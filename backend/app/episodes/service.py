"""Episodes: document pages → Alex & Sam script (Groq) → voices (ElevenLabs) → flashcards → MySQL + MP3s.

Creating an episode returns immediately with status "queued"; `run_episode_job` does the work in the
background and records its stage and progress so the frontend can show a live progress screen.
"""

import logging
import re
import shutil
from datetime import datetime

from sqlalchemy import select, update
from sqlalchemy.orm import Session, sessionmaker

from ..ai.script import LANGUAGES, generate_script
from ..config import get_settings
from ..db import get_engine
from ..errors import AppError
from ..flashcards.service import build_deck, checkpoint_cards
from ..ingestion.service import load_document_text
from ..models import Document, Episode, EpisodeSegment, Flashcard, ListeningProgress, StudyEvent, new_uuid
from ..tts import elevenlabs
from ..tts.audio import episode_dir, join_episode, render_episode_audio

logger = logging.getLogger("study_mate.episodes")

STAGE_LABELS = {
    "queued": "Waiting to start",
    "reading": "Reading your pages",
    "writing": "Writing Alex & Sam's script",
    "recording": "Recording the voices",
    "flashcards": "Making your flashcards",
    "done": "Ready",
    "failed": "Something went wrong",
}


# --- Creating ------------------------------------------------------------------------------------


def queue_episode(
    db: Session,
    *,
    document_id: str,
    page_start: int | None,
    page_end: int | None,
    target_minutes: int,
    title: str | None,
    style: str,
    level: str,
    language: str,
) -> Episode:
    document = db.get(Document, document_id)
    if document is None:
        raise AppError("NOT_FOUND", 404, "That document doesn't exist.")
    if language not in LANGUAGES:
        raise AppError("INVALID_REQUEST", 400, "Unsupported language.")
    if page_start and page_start > document.page_count:
        raise AppError("INVALID_REQUEST", 400, f"This document only has {document.page_count} pages.")

    episode = Episode(
        id=new_uuid(),
        document_id=document.id,
        title=(title or document.filename.rsplit(".", 1)[0])[:300],
        page_start=page_start,
        page_end=min(page_end, document.page_count) if page_end else None,
        target_minutes=target_minutes,
        total_duration_sec=0,
        ai_model=get_settings().groq_model,
        tts_provider=elevenlabs.PROVIDER_NAME,
        style=style,
        level=level,
        language=language,
        status="queued",
        stage="queued",
        progress=0,
    )
    db.add(episode)
    db.commit()
    return episode


def run_episode_job(episode_id: str) -> None:
    """Background task. Uses its own DB session; never raises (failures are recorded on the episode)."""
    session = sessionmaker(bind=get_engine(), expire_on_commit=False)()
    try:
        _run(session, episode_id)
    except Exception as err:  # last-resort guard so a failed job never crashes the worker
        logger.exception("episode job %s failed", episode_id)
        session.rollback()
        message = err.message if isinstance(err, AppError) else "Something went wrong while making this lesson. Please try again."
        session.execute(
            update(Episode).where(Episode.id == episode_id).values(status="failed", stage="failed", error_message=message[:500])
        )
        session.commit()
        shutil.rmtree(episode_dir(episode_id), ignore_errors=True)
    finally:
        session.close()


def _run(db: Session, episode_id: str) -> None:
    episode = db.get(Episode, episode_id)
    if episode is None:
        return

    def set_stage(stage: str, progress: int) -> None:
        episode.status, episode.stage, episode.progress = "processing", stage, progress
        db.commit()

    set_stage("reading", 5)
    _, material = load_document_text(db, episode.document_id, episode.page_start, episode.page_end)

    set_stage("writing", 12)
    script = generate_script(
        material,
        lecture_title=episode.title,
        target_minutes=episode.target_minutes,
        style=episode.style,
        level=episode.level,
        language=episode.language,
    )

    set_stage("recording", 30)
    segments = render_episode_audio(
        episode.id, script, on_progress=lambda done, total: set_stage("recording", 30 + int(55 * done / total))
    )
    episode.segments = [
        EpisodeSegment(
            segment_index=s.segment_index,
            line_index=s.line_index,
            speaker=s.speaker,
            line_type=s.line_type,
            text=s.text,
            file_path=s.file_path,
            start_sec=s.start_sec,
            end_sec=s.end_sec,
            duration_sec=s.duration_sec,
            pause_after_sec=s.pause_after_sec,
        )
        for s in segments
    ]
    episode.total_duration_sec = round(segments[-1].end_sec, 3) if segments else 0
    set_stage("flashcards", 88)

    try:
        episode.flashcards = build_deck(episode, script)
    except AppError as err:
        # Flashcards are a bonus: keep the lesson, fall back to checkpoint cards only.
        logger.warning("flashcards for %s: %s", episode.id, err)
        episode.flashcards = [Flashcard(front=f, back=b, source="checkpoint") for f, b in checkpoint_cards(script)]

    episode.status, episode.stage, episode.progress = "ready", "done", 100
    db.commit()


def fail_interrupted_jobs(db: Session) -> int:
    """At startup: jobs that were running when the server stopped will never finish."""
    result = db.execute(
        update(Episode)
        .where(Episode.status.in_(("queued", "processing")))
        .values(status="failed", stage="failed", error_message="Interrupted by a server restart. Please create it again.")
    )
    db.commit()
    return result.rowcount or 0


# --- Reading -------------------------------------------------------------------------------------


def get_episode(db: Session, episode_id: str) -> Episode:
    episode = db.get(Episode, episode_id)
    if episode is None:
        raise AppError("NOT_FOUND", 404, "That episode doesn't exist.")
    return episode


def episode_summary(episode: Episode) -> dict:
    progress = episode.listening
    return {
        "scriptId": episode.id,
        "documentId": episode.document_id,
        "title": episode.title,
        "status": episode.status,
        "stage": episode.stage,
        "stageLabel": STAGE_LABELS.get(episode.stage, episode.stage),
        "progress": episode.progress,
        "error": episode.error_message,
        "style": episode.style,
        "level": episode.level,
        "language": episode.language,
        "targetMinutes": episode.target_minutes,
        "pageStart": episode.page_start,
        "pageEnd": episode.page_end,
        "totalDurationSec": episode.total_duration_sec,
        "createdAt": episode.created_at.isoformat() if episode.created_at else None,
        "flashcardCount": len(episode.flashcards),
        "listening": {
            "positionSec": progress.position_sec if progress else 0,
            "completed": progress.completed if progress else False,
            "updatedAt": progress.updated_at.isoformat() if progress else None,
        },
    }


def manifest(episode: Episode) -> dict:
    """Status + (when ready) the playback manifest the frontend AudioPlayer expects."""
    data = {
        "version": 1,
        **episode_summary(episode),
        "provider": episode.tts_provider,
        "manifestUrl": f"/api/episodes/{episode.id}",
        "downloadUrl": f"/api/episodes/{episode.id}/download" if episode.status == "ready" else None,
        "segments": [],
    }
    if episode.status == "ready":
        data["segments"] = [
            {
                "index": s.segment_index,
                "lineIndex": s.line_index,
                "speaker": s.speaker,
                "type": s.line_type,
                "text": s.text,
                "url": f"/media/{s.file_path}",
                "storagePath": s.file_path,
                "startSec": s.start_sec,
                "endSec": s.end_sec,
                "durationSec": s.duration_sec,
                "pauseAfterSec": s.pause_after_sec,
            }
            for s in episode.segments
        ]
    return data


def list_episodes(db: Session, limit: int = 100) -> list[Episode]:
    return list(db.scalars(select(Episode).order_by(Episode.created_at.desc()).limit(limit)))


# --- Listening progress --------------------------------------------------------------------------

MAX_LISTEN_CREDIT_SEC = 120  # ignore implausible jumps between progress updates


def save_progress(db: Session, episode_id: str, *, position_sec: float, listened_sec: float, completed: bool) -> dict:
    episode = get_episode(db, episode_id)
    progress = episode.listening or ListeningProgress(episode_id=episode.id)
    progress.position_sec = max(0.0, min(position_sec, episode.total_duration_sec))
    credit = max(0.0, min(listened_sec, MAX_LISTEN_CREDIT_SEC))
    progress.listened_sec = (progress.listened_sec or 0) + credit
    progress.completed = progress.completed or completed
    progress.updated_at = datetime.now()
    episode.listening = progress
    if credit >= 1:
        db.add(StudyEvent(kind="listen", ref_id=episode.id, amount=credit))
    db.commit()
    return {"positionSec": progress.position_sec, "completed": progress.completed}


# --- Download & delete ---------------------------------------------------------------------------


def download_episode(db: Session, episode_id: str) -> tuple[bytes, str]:
    episode = get_episode(db, episode_id)
    if episode.status != "ready" or not episode.segments:
        raise AppError("NOT_READY", 409, "This lesson isn't ready yet.")
    media = get_settings().media_dir
    try:
        audio = join_episode([(media / s.file_path, s.pause_after_sec) for s in episode.segments])
    except FileNotFoundError as err:
        raise AppError("NOT_FOUND", 404, "This lesson's audio files are missing.", detail=repr(err)) from err
    slug = re.sub(r"[^A-Za-z0-9]+", "-", episode.title).strip("-")[:80] or "study-mate-lesson"
    return audio, f"{slug}.mp3"


def delete_episode(db: Session, episode_id: str) -> None:
    episode = get_episode(db, episode_id)
    if episode.status in ("queued", "processing"):
        raise AppError("BUSY", 409, "This lesson is still being made. Wait for it to finish before deleting it.")
    db.delete(episode)
    db.commit()
    shutil.rmtree(episode_dir(episode_id), ignore_errors=True)

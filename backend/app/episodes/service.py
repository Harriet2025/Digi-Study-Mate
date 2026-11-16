"""Episodes: document pages → Alex & Sam script (Groq) → voices (ElevenLabs) → MySQL + MP3 files."""

import shutil

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..ai.script import generate_script
from ..config import get_settings
from ..errors import AppError
from ..ingestion.service import load_document_text
from ..models import Episode, EpisodeSegment, new_uuid
from ..tts import elevenlabs
from ..tts.audio import episode_dir, render_episode_audio


def create_episode(
    db: Session,
    *,
    document_id: str,
    page_start: int | None,
    page_end: int | None,
    target_minutes: int,
    title: str | None,
) -> Episode:
    document, material = load_document_text(db, document_id, page_start, page_end)
    title = title or document.filename.rsplit(".", 1)[0]

    script = generate_script(material, lecture_title=title, target_minutes=target_minutes)

    episode = Episode(
        id=new_uuid(),  # needed before insert: it names the audio folder
        document_id=document.id,
        title=title[:300],
        page_start=page_start,
        page_end=page_end,
        target_minutes=target_minutes,
        total_duration_sec=0,
        ai_model=get_settings().groq_model,
        tts_provider=elevenlabs.PROVIDER_NAME,
    )
    segments = render_episode_audio(episode.id, script)

    try:
        episode.total_duration_sec = round(segments[-1].end_sec, 3) if segments else 0
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
        db.add(episode)
        db.commit()
    except Exception:
        db.rollback()
        shutil.rmtree(episode_dir(episode.id), ignore_errors=True)  # no orphaned audio
        raise
    return episode


def get_episode(db: Session, episode_id: str) -> Episode:
    episode = db.get(Episode, episode_id)
    if episode is None:
        raise AppError("NOT_FOUND", 404, "That episode doesn't exist.")
    return episode


def list_episodes(db: Session, limit: int = 50) -> list[Episode]:
    return list(db.scalars(select(Episode).order_by(Episode.created_at.desc()).limit(limit)))


def manifest(episode: Episode) -> dict:
    """The playback manifest the frontend AudioPlayer expects."""
    return {
        "version": 1,
        "scriptId": episode.id,
        "title": episode.title,
        "provider": episode.tts_provider,
        "createdAt": episode.created_at.isoformat(),
        "totalDurationSec": episode.total_duration_sec,
        "manifestUrl": f"/api/episodes/{episode.id}",
        "segments": [
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
        ],
    }

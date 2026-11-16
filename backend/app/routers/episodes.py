from typing import Literal

from fastapi import APIRouter, BackgroundTasks, Depends, Response
from pydantic import BaseModel, Field, model_validator
from sqlalchemy.orm import Session

from ..db import get_db
from ..episodes.service import (
    delete_episode,
    download_episode,
    episode_summary,
    get_episode,
    list_episodes,
    manifest,
    queue_episode,
    run_episode_job,
    save_progress,
)

router = APIRouter(prefix="/api/episodes", tags=["episodes"])


class CreateEpisodeBody(BaseModel):
    documentId: str = Field(min_length=36, max_length=36)
    #: Optional page/slide range. On Groq's free tier keep it to roughly 10 pages per episode.
    pageStart: int | None = Field(default=None, ge=1)
    pageEnd: int | None = Field(default=None, ge=1)
    targetMinutes: int = Field(default=5, ge=1, le=60)
    title: str | None = Field(default=None, max_length=300)
    style: Literal["standard", "recap", "deep_dive", "exam_cram"] = "standard"
    level: Literal["beginner", "intermediate", "advanced"] = "intermediate"
    language: Literal["en", "fr", "es", "pt", "de"] = "en"

    @model_validator(mode="after")
    def check_range(self) -> "CreateEpisodeBody":
        if self.pageStart and self.pageEnd and self.pageEnd < self.pageStart:
            raise ValueError("pageEnd must be greater than or equal to pageStart")
        return self


@router.post("", status_code=202)
def create(body: CreateEpisodeBody, background: BackgroundTasks, db: Session = Depends(get_db)) -> dict:
    """Start making a lesson. Returns at once with status "queued"; poll GET /api/episodes/{id} for progress."""
    episode = queue_episode(
        db,
        document_id=body.documentId,
        page_start=body.pageStart,
        page_end=body.pageEnd,
        target_minutes=body.targetMinutes,
        title=body.title,
        style=body.style,
        level=body.level,
        language=body.language,
    )
    background.add_task(run_episode_job, episode.id)
    return episode_summary(episode)


@router.get("")
def index(db: Session = Depends(get_db)) -> list[dict]:
    return [episode_summary(e) for e in list_episodes(db)]


@router.get("/{episode_id}")
def show(episode_id: str, db: Session = Depends(get_db)) -> dict:
    """Status and, once ready, the full playback manifest."""
    return manifest(get_episode(db, episode_id))


class ProgressBody(BaseModel):
    positionSec: float = Field(ge=0)
    #: Seconds actually listened since the last update (for study time and streaks).
    listenedSec: float = Field(default=0, ge=0)
    completed: bool = False


@router.put("/{episode_id}/progress")
def progress(episode_id: str, body: ProgressBody, db: Session = Depends(get_db)) -> dict:
    return save_progress(db, episode_id, position_sec=body.positionSec, listened_sec=body.listenedSec, completed=body.completed)


@router.get("/{episode_id}/download")
def download(episode_id: str, db: Session = Depends(get_db)) -> Response:
    """The whole lesson as one MP3, for offline listening."""
    audio, filename = download_episode(db, episode_id)
    return Response(
        content=audio, media_type="audio/mpeg", headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )


@router.delete("/{episode_id}", status_code=204)
def delete(episode_id: str, db: Session = Depends(get_db)) -> Response:
    delete_episode(db, episode_id)
    return Response(status_code=204)

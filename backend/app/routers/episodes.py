from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field, model_validator
from sqlalchemy.orm import Session

from ..db import get_db
from ..episodes.service import create_episode, get_episode, list_episodes, manifest

router = APIRouter(prefix="/api/episodes", tags=["episodes"])


class CreateEpisodeBody(BaseModel):
    documentId: str = Field(min_length=36, max_length=36)
    #: Optional page/slide range. On Groq's free tier keep it to roughly 10 pages per episode.
    pageStart: int | None = Field(default=None, ge=1)
    pageEnd: int | None = Field(default=None, ge=1)
    targetMinutes: int = Field(default=5, ge=1, le=60)
    title: str | None = Field(default=None, max_length=300)

    @model_validator(mode="after")
    def check_range(self) -> "CreateEpisodeBody":
        if self.pageStart and self.pageEnd and self.pageEnd < self.pageStart:
            raise ValueError("pageEnd must be greater than or equal to pageStart")
        return self


@router.post("", status_code=201)
def create(body: CreateEpisodeBody, db: Session = Depends(get_db)) -> dict:
    """Write an Alex & Sam script for the chosen pages, voice it, and return the playback manifest."""
    episode = create_episode(
        db,
        document_id=body.documentId,
        page_start=body.pageStart,
        page_end=body.pageEnd,
        target_minutes=body.targetMinutes,
        title=body.title,
    )
    return manifest(episode)


@router.get("")
def index(db: Session = Depends(get_db)) -> list[dict]:
    return [
        {
            "scriptId": e.id,
            "title": e.title,
            "documentId": e.document_id,
            "totalDurationSec": e.total_duration_sec,
            "createdAt": e.created_at.isoformat(),
        }
        for e in list_episodes(db)
    ]


@router.get("/{episode_id}")
def show(episode_id: str, db: Session = Depends(get_db)) -> dict:
    return manifest(get_episode(db, episode_id))

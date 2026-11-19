from typing import Literal

from fastapi import APIRouter, BackgroundTasks, Depends, Request, Response
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from ..auth.deps import guest_limit
from ..auth.scoping import as_current_user
from ..config import get_settings
from ..db import get_db
from ..flashcards.service import card_json, deck_stats, list_cards
from ..models import ChatMessage, StudyGuide
from ..guides.service import (
    chat,
    delete_guide,
    get_guide,
    grade_quiz,
    guide_detail,
    guide_summary,
    queue_guide,
    regenerate_practice,
    run_guide_job,
)

router = APIRouter(prefix="/api/guides", tags=["study spaces"])


class CreateGuideBody(BaseModel):
    documentId: str = Field(min_length=36, max_length=36)
    pageStart: int | None = Field(default=None, ge=1)
    pageEnd: int | None = Field(default=None, ge=1)
    title: str | None = Field(default=None, max_length=300)
    level: Literal["beginner", "intermediate", "advanced"] = "intermediate"
    language: Literal["en", "fr", "es", "pt", "de"] = "en"

    @model_validator(mode="after")
    def check_range(self) -> "CreateGuideBody":
        if self.pageStart and self.pageEnd and self.pageEnd < self.pageStart:
            raise ValueError("pageEnd must be greater than or equal to pageStart")
        return self


@router.post("", status_code=202)
def create(body: CreateGuideBody, request: Request, background: BackgroundTasks, db: Session = Depends(get_db)) -> dict:
    """Start making a study space (guided lesson, diagrams, flashcards, quiz, resources) in the background."""
    guest_limit(request, db.scalar(select(func.count(StudyGuide.id))) or 0, 1)
    page_start, page_end = body.pageStart, body.pageEnd
    if request.state.user.is_guest:
        # A guest's trial lesson covers a limited number of pages so it's ready quickly.
        page_start = page_start or 1
        page_end = min(page_end or page_start + 999, page_start + get_settings().guest_max_pages - 1)
    guide = queue_guide(
        db,
        document_id=body.documentId,
        page_start=page_start,
        page_end=page_end,
        title=body.title,
        level=body.level,
        language=body.language,
    )
    background.add_task(as_current_user(run_guide_job), guide.id)
    return guide_summary(guide)


@router.get("/{guide_id}")
def show(guide_id: str, db: Session = Depends(get_db)) -> dict:
    return guide_detail(db, get_guide(db, guide_id))


@router.delete("/{guide_id}", status_code=204)
def delete(guide_id: str, db: Session = Depends(get_db)) -> Response:
    delete_guide(db, guide_id)
    return Response(status_code=204)


class QuizBody(BaseModel):
    answers: list[int] = Field(min_length=1, max_length=20)


@router.post("/{guide_id}/quiz")
def quiz(guide_id: str, body: QuizBody, db: Session = Depends(get_db)) -> dict:
    """Grade the end-of-lesson quiz and return the score, rating and explanations."""
    return grade_quiz(db, guide_id, body.answers)


class ChatBody(BaseModel):
    message: str = Field(min_length=1, max_length=2_000)


@router.post("/{guide_id}/chat")
async def ask(guide_id: str, body: ChatBody, request: Request, db: Session = Depends(get_db)) -> dict:
    """Ask the tutor a question; answers are grounded in the student's pages and cite them."""
    guest_limit(request, (db.scalar(select(func.count(ChatMessage.id))) or 0) // 2, 3)
    return await run_in_threadpool(chat, db, guide_id, body.message)


@router.post("/{guide_id}/practice")
async def remake_practice(guide_id: str, db: Session = Depends(get_db)) -> dict:
    """Make the flashcards, quiz and resources again (e.g. after a failure)."""
    guide = await run_in_threadpool(regenerate_practice, db, guide_id)
    return guide_detail(db, guide)


@router.get("/{guide_id}/flashcards")
def flashcards(guide_id: str, due: bool = True, db: Session = Depends(get_db)) -> dict:
    get_guide(db, guide_id)
    return {
        "cards": [card_json(c) for c in list_cards(db, episode_id=None, guide_id=guide_id, due_only=due, limit=100)],
        "stats": deck_stats(db, guide_id=guide_id),
    }

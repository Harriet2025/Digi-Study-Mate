from typing import Literal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..db import get_db
from ..flashcards.service import card_json, deck_stats, list_cards, review_card

router = APIRouter(prefix="/api/flashcards", tags=["flashcards"])


@router.get("")
def cards(
    episodeId: str | None = Query(default=None, max_length=36),
    guideId: str | None = Query(default=None, max_length=36),
    due: bool = True,
    limit: int = Query(default=30, ge=1, le=200),
    db: Session = Depends(get_db),
) -> dict:
    """Cards to review (due now by default), optionally for one lesson, plus deck stats."""
    return {
        "cards": [card_json(c) for c in list_cards(db, episode_id=episodeId, guide_id=guideId, due_only=due, limit=limit)],
        "stats": deck_stats(db, episodeId, guideId),
    }


class ReviewBody(BaseModel):
    rating: Literal["again", "hard", "good", "easy"]


@router.post("/{card_id}/review")
def review(card_id: int, body: ReviewBody, db: Session = Depends(get_db)) -> dict:
    return card_json(review_card(db, card_id, body.rating))

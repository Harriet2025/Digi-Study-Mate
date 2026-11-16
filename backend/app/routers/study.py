from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..db import get_db
from ..study.service import insights, library

router = APIRouter(prefix="/api", tags=["study"])


@router.get("/library")
def get_library(db: Session = Depends(get_db)) -> dict:
    """Documents with their lessons and practice sets, plus "continue listening"."""
    return library(db)


@router.get("/insights")
def get_insights(db: Session = Depends(get_db)) -> dict:
    """Streaks, a 12-week activity calendar, totals and weak spots."""
    return insights(db)

"""Library overview, study streaks, activity calendar and weak spots."""

from collections import defaultdict
from datetime import date, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..episodes.service import episode_summary
from ..flashcards.service import _ready_cards, deck_stats
from ..models import (
    DefenseAttempt,
    DefenseQuestion,
    DefenseQuestionSet,
    Document,
    Episode,
    Flashcard,
    ListeningProgress,
    QuizAttempt,
    StudyEvent,
    StudyGuide,
)
from ..guides.service import guide_summary

CALENDAR_DAYS = 84  # 12 weeks


# --- Library --------------------------------------------------------------------------------------


def _set_summary(qs: DefenseQuestionSet) -> dict:
    best_scores = []
    for q in qs.questions:
        scores = [a.score for a in q.attempts]
        if scores:
            best_scores.append(max(scores))
    return {
        "setId": qs.id,
        "title": qs.source_title,
        "createdAt": qs.created_at.isoformat(),
        "questionCount": len(qs.questions),
        "answeredCount": len(best_scores),
        "averageBest": round(sum(best_scores) / len(best_scores)) if best_scores else None,
    }


def library(db: Session) -> dict:
    documents = list(db.scalars(select(Document).order_by(Document.created_at.desc())))
    episodes_by_doc: dict[str | None, list[Episode]] = defaultdict(list)
    for ep in db.scalars(select(Episode).order_by(Episode.created_at.desc())):
        episodes_by_doc[ep.document_id].append(ep)
    guides_by_doc: dict[str, list[StudyGuide]] = defaultdict(list)
    for g in db.scalars(select(StudyGuide).order_by(StudyGuide.created_at.desc())):
        guides_by_doc[g.document_id].append(g)
    sets_by_doc: dict[str | None, list[DefenseQuestionSet]] = defaultdict(list)
    for qs in db.scalars(select(DefenseQuestionSet).order_by(DefenseQuestionSet.created_at.desc())):
        sets_by_doc[qs.document_id].append(qs)

    continue_listening = [
        episode_summary(p.episode)
        for p in db.scalars(
            select(ListeningProgress)
            .join(Episode)
            .where(Episode.status == "ready", ListeningProgress.completed.is_(False), ListeningProgress.position_sec > 5)
            .order_by(ListeningProgress.updated_at.desc())
            .limit(6)
        )
    ]

    return {
        "continueListening": continue_listening,
        "flashcards": deck_stats(db),
        "documents": [
            {
                "documentId": d.id,
                "filename": d.filename,
                "sourceType": d.source_type,
                "pageCount": d.page_count,
                "createdAt": d.created_at.isoformat(),
                "guides": [guide_summary(g) for g in guides_by_doc.get(d.id, [])],
                "episodes": [episode_summary(e) for e in episodes_by_doc.get(d.id, [])],
                "questionSets": [_set_summary(qs) for qs in sets_by_doc.get(d.id, [])],
            }
            for d in documents
        ],
        # Practice sets made from pasted text rather than an upload.
        "looseQuestionSets": [_set_summary(qs) for qs in sets_by_doc.get(None, [])],
    }


# --- Insights -------------------------------------------------------------------------------------


def _streaks(active_days: set[date], today: date) -> tuple[int, int]:
    """(current streak, longest streak). The current streak survives until the end of today."""
    current = 0
    day = today if today in active_days else today - timedelta(days=1)
    while day in active_days:
        current += 1
        day -= timedelta(days=1)

    longest = run = 0
    previous: date | None = None
    for d in sorted(active_days):
        run = run + 1 if previous and d - previous == timedelta(days=1) else 1
        longest = max(longest, run)
        previous = d
    return current, longest


def insights(db: Session) -> dict:
    today = date.today()
    since = datetime.combine(today - timedelta(days=CALENDAR_DAYS - 1), datetime.min.time())

    per_day: dict[date, dict[str, float]] = defaultdict(
        lambda: {"listen": 0.0, "review": 0.0, "defense": 0.0, "upload": 0.0, "quiz": 0.0, "chat": 0.0}
    )
    for kind, amount, created in db.execute(select(StudyEvent.kind, StudyEvent.amount, StudyEvent.created_at)):
        per_day[created.date()][kind] += amount

    active_days = {d for d, v in per_day.items() if v["listen"] >= 60 or v["review"] or v["defense"] or v["quiz"] or v["chat"]}
    current, longest = _streaks(active_days, today)

    calendar = []
    for offset in range(CALENDAR_DAYS):
        d = since.date() + timedelta(days=offset)
        v = per_day.get(d, {"listen": 0.0, "review": 0.0, "defense": 0.0, "quiz": 0.0, "chat": 0.0})
        calendar.append(
            {
                "date": d.isoformat(),
                "listenMinutes": round(v["listen"] / 60, 1),
                "reviews": int(v["review"]),
                "defense": int(v["defense"]),
                "quizzes": int(v["quiz"]),
                "questionsAsked": int(v["chat"]),
                "active": d in active_days,
            }
        )

    totals_listen = sum(v["listen"] for v in per_day.values())
    weak_cards = db.scalars(
        _ready_cards(select(Flashcard))
        .where((Flashcard.lapses > 0) | (Flashcard.ease < 2.3))
        .order_by(Flashcard.lapses.desc(), Flashcard.ease.asc())
        .limit(8)
    )
    weak_questions = []
    for q in db.scalars(select(DefenseQuestion).join(DefenseAttempt).group_by(DefenseQuestion.id)):
        best = max(a.score for a in q.attempts)
        if best < 65:
            weak_questions.append(
                {
                    "setId": q.set_id,
                    "questionId": q.question_key,
                    "question": q.question,
                    "bestScore": best,
                    "attempts": len(q.attempts),
                    "title": q.question_set.source_title,
                }
            )
    weak_questions.sort(key=lambda w: w["bestScore"])

    return {
        "streak": {"current": current, "longest": longest, "activeToday": today in active_days},
        "calendar": calendar,
        "totals": {
            "listenMinutes": round(totals_listen / 60),
            "lessons": db.scalar(select(func.count(Episode.id)).where(Episode.status == "ready")) or 0,
            "documents": db.scalar(select(func.count(Document.id))) or 0,
            "cardsReviewed": int(sum(v["review"] for v in per_day.values())),
            "defenseAnswers": db.scalar(select(func.count(DefenseAttempt.id))) or 0,
            "studySpaces": db.scalar(select(func.count(StudyGuide.id)).where(StudyGuide.status == "ready")) or 0,
            "quizzesTaken": db.scalar(select(func.count(QuizAttempt.id))) or 0,
            "questionsAsked": int(sum(v["chat"] for v in per_day.values())),
        },
        "flashcards": deck_stats(db),
        "weakSpots": {
            "flashcards": [
                {
                    "id": c.id,
                    "front": c.front,
                    "lapses": c.lapses,
                    "episodeId": c.episode_id,
                    "guideId": c.guide_id,
                    "lessonTitle": (c.episode or c.guide).title,
                }
                for c in weak_cards
            ],
            "defense": weak_questions[:8],
        },
    }

"""Spaced repetition (a simplified SM-2, like Anki): cards you know come back less and less often;
cards you miss come back soon."""

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Literal

Rating = Literal["again", "hard", "good", "easy"]
RATINGS: tuple[Rating, ...] = ("again", "hard", "good", "easy")

MIN_EASE = 1.3
RELEARN_MINUTES = 10


@dataclass
class CardState:
    ease: float
    interval_days: float
    repetitions: int
    lapses: int


def schedule(state: CardState, rating: Rating) -> CardState:
    """The card's state after answering with `rating`."""
    ease, interval, reps, lapses = state.ease, state.interval_days, state.repetitions, state.lapses

    if rating == "again":
        return CardState(max(MIN_EASE, ease - 0.2), RELEARN_MINUTES / (24 * 60), 0, lapses + 1)

    if rating == "hard":
        new_interval = 1.0 if reps == 0 else max(1.0, interval * 1.2)
        return CardState(max(MIN_EASE, ease - 0.15), new_interval, reps + 1, lapses)

    if rating == "good":
        new_interval = 1.0 if reps == 0 else 3.0 if reps == 1 else interval * ease
        return CardState(ease, new_interval, reps + 1, lapses)

    # easy
    new_interval = 4.0 if reps == 0 else max(interval * ease * 1.3, 4.0)
    return CardState(ease + 0.15, new_interval, reps + 1, lapses)


def due_after(state: CardState, now: datetime | None = None) -> datetime:
    return (now or datetime.now()) + timedelta(days=state.interval_days)


def preview(state: CardState) -> dict[str, float]:
    """Interval in days each rating would give, so buttons can show "10 min", "1 day", "4 days"."""
    return {rating: round(schedule(state, rating).interval_days, 4) for rating in RATINGS}

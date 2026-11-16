"""Keeps each user's data private, in one place instead of in every query.

While a request (or a background job it started) runs for a signed-in user:
- every ORM SELECT, UPDATE and DELETE only sees rows whose user_id is that user's, and
- every new owned row (document, lesson, flashcard, event…) is stamped with that user's ID.

Code running outside a user context (startup clean-up, tests of internals) is not filtered.
"""

from collections.abc import Callable, Iterator
from contextlib import contextmanager
from contextvars import ContextVar
from functools import wraps
from typing import ParamSpec, TypeVar

from sqlalchemy import event
from sqlalchemy.orm import ORMExecuteState, Session, with_loader_criteria

from ..models import OwnedMixin

_current_user: ContextVar[str | None] = ContextVar("study_mate_current_user", default=None)

P = ParamSpec("P")
R = TypeVar("R")


def current_user_id() -> str | None:
    return _current_user.get()


def set_current_user(user_id: str | None) -> None:
    """Called by the auth dependency for the rest of the request."""
    _current_user.set(user_id)


@contextmanager
def acting_as(user_id: str | None) -> Iterator[None]:
    token = _current_user.set(user_id)
    try:
        yield
    finally:
        _current_user.reset(token)


def as_current_user(fn: Callable[P, R]) -> Callable[P, R]:
    """Wraps a background job so it keeps running as the user who started it."""
    user_id = current_user_id()

    @wraps(fn)
    def run(*args: P.args, **kwargs: P.kwargs) -> R:
        with acting_as(user_id):
            return fn(*args, **kwargs)

    return run


@event.listens_for(Session, "do_orm_execute")
def _only_this_users_rows(state: ORMExecuteState) -> None:
    user_id = _current_user.get()
    if user_id is None:
        return
    if not (state.is_select or state.is_update or state.is_delete):
        return
    if state.is_column_load or state.is_relationship_load:
        return  # already covered: the criteria propagate to these loads
    state.statement = state.statement.options(
        with_loader_criteria(OwnedMixin, lambda cls: cls.user_id == user_id, include_aliases=True)
    )


@event.listens_for(Session, "before_flush")
def _stamp_owner(session: Session, _context, _instances) -> None:
    user_id = _current_user.get()
    if user_id is None:
        return
    for obj in session.new:
        if isinstance(obj, OwnedMixin) and obj.user_id is None:
            obj.user_id = user_id

"""FastAPI dependencies and cookie helpers."""

from fastapi import Request, Response
from starlette.concurrency import run_in_threadpool

from ..config import get_settings
from ..db import _session_factory
from ..errors import AppError
from ..models import User
from .scoping import set_current_user
from .service import user_for_token

SESSION_COOKIE = "sm_session"


def _lookup(token: str) -> User | None:
    with _session_factory()() as db:
        return user_for_token(db, token)


async def optional_user(request: Request) -> User | None:
    token = request.cookies.get(SESSION_COOKIE)
    if not token or len(token) > 200:
        return None
    return await run_in_threadpool(_lookup, token)


async def require_user(request: Request) -> User:
    """Rejects anonymous requests and scopes all data access in this request to the signed-in user.

    Async on purpose: the user ID is stored in a context variable, which must be set in the request's
    own task (sync dependencies run in a copied context) so the endpoint and its background jobs see it.
    """
    user = await optional_user(request)
    if user is None:
        raise AppError("UNAUTHENTICATED", 401, "Please log in to continue.")
    set_current_user(user.id)
    request.state.user = user
    return user


def _secure() -> bool:
    return get_settings().app_url.startswith("https://")


def set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=get_settings().session_days * 86_400,
        httponly=True,
        secure=_secure(),
        samesite="lax",
        path="/",
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(SESSION_COOKIE, path="/", httponly=True, secure=_secure(), samesite="lax")

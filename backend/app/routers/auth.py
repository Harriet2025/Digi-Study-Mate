"""Sign up, log in (email + password or Google), log out, and who am I."""

import logging
import secrets
import threading
import time
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, Request, Response
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from ..auth.deps import SESSION_COOKIE, clear_session_cookie, optional_user, set_session_cookie
from ..auth.mailer import send_password_reset
from ..auth.service import (
    authenticate,
    create_guest,
    create_session,
    end_session,
    finish_password_reset,
    google_user,
    merge_guest,
    register,
    start_password_reset,
    user_json,
)
from ..config import get_settings
from ..db import get_db
from ..errors import AppError
from ..models import User

logger = logging.getLogger("study_mate.auth")

router = APIRouter(prefix="/api/auth", tags=["auth"])

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"
OAUTH_COOKIE = "sm_oauth"


def _safe_next(path: str | None) -> str:
    """Only allow redirects to pages on this site."""
    if not path or not path.startswith("/") or path.startswith("//") or "\\" in path or len(path) > 500:
        return "/library"
    return path


def _google_enabled() -> bool:
    s = get_settings()
    return bool(s.google_client_id and s.google_client_secret)


def _redirect_uri() -> str:
    return f"{get_settings().app_url.rstrip('/')}/api/auth/google/callback"


@router.get("/me")
async def me(user: User | None = Depends(optional_user)) -> dict:
    return {"user": user_json(user) if user else None}


@router.get("/providers")
def providers() -> dict:
    return {"google": _google_enabled()}


class SignupBody(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=1, max_length=200)


@router.post("/signup", status_code=201)
async def signup(
    body: SignupBody, response: Response, db: Session = Depends(get_db), current: User | None = Depends(optional_user)
) -> dict:
    """A guest who signs up keeps everything they made during the trial."""
    user = await run_in_threadpool(register, db, name=body.name, email=body.email, password=body.password, guest=current)
    set_session_cookie(response, await run_in_threadpool(create_session, db, user))
    return {"user": user_json(user)}


class LoginBody(BaseModel):
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=1, max_length=200)


@router.post("/login")
async def login(
    body: LoginBody, response: Response, db: Session = Depends(get_db), current: User | None = Depends(optional_user)
) -> dict:
    user = await run_in_threadpool(authenticate, db, email=body.email, password=body.password)
    await run_in_threadpool(merge_guest, db, current, user)
    set_session_cookie(response, await run_in_threadpool(create_session, db, user))
    return {"user": user_json(user)}


# --- Guest trial -------------------------------------------------------------
_guest_starts: dict[str, list[float]] = {}
_guest_lock = threading.Lock()
GUESTS_PER_IP_PER_HOUR = 5


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "")
    return forwarded.split(",")[0].strip() or (request.client.host if request.client else "unknown")


@router.post("/guest")
async def start_guest(request: Request, response: Response, db: Session = Depends(get_db), current: User | None = Depends(optional_user)) -> dict:
    """Starts a free trial without an account, so a visitor can upload once and see their lesson first."""
    if current is not None:
        return {"user": user_json(current)}
    ip, now = _client_ip(request), time.monotonic()
    with _guest_lock:
        recent = [t for t in _guest_starts.get(ip, []) if now - t < 3600]
        if len(recent) >= GUESTS_PER_IP_PER_HOUR:
            raise AppError("TOO_MANY_TRIALS", 429, "Too many free trials from this network. Create a free account to continue.")
        _guest_starts[ip] = [*recent, now]
    user = await run_in_threadpool(create_guest, db)
    set_session_cookie(response, await run_in_threadpool(create_session, db, user))
    return {"user": user_json(user)}


# --- Forgot password -----------------------------------------------------------
class ForgotBody(BaseModel):
    email: str = Field(min_length=3, max_length=255)


@router.post("/forgot")
def forgot_password(body: ForgotBody, db: Session = Depends(get_db)) -> dict:
    """Emails a reset link if the address has an account. Always answers the same, so it can't reveal who has one."""
    found = start_password_reset(db, body.email)
    if found:
        user, token = found
        link = f"{get_settings().app_url.rstrip('/')}/reset-password?token={token}"
        send_password_reset(user.email, user.name, link)
    return {"ok": True}


class ResetBody(BaseModel):
    token: str = Field(min_length=20, max_length=200)
    password: str = Field(min_length=1, max_length=200)


@router.post("/reset")
def reset_password(body: ResetBody, response: Response, db: Session = Depends(get_db)) -> dict:
    user = finish_password_reset(db, body.token, body.password)
    set_session_cookie(response, create_session(db, user))
    return {"user": user_json(user)}


@router.post("/logout")
def logout(request: Request, response: Response, db: Session = Depends(get_db)) -> dict:
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        end_session(db, token)
    clear_session_cookie(response)
    return {"ok": True}


# --- Google (OAuth 2.0 authorization code flow) ------------------------------
@router.get("/google")
def google_start(next: str | None = None) -> RedirectResponse:
    if not _google_enabled():
        raise AppError("GOOGLE_DISABLED", 404, "Google sign-in isn't set up on this server.")
    state = secrets.token_urlsafe(24)
    query = urlencode(
        {
            "client_id": get_settings().google_client_id,
            "redirect_uri": _redirect_uri(),
            "response_type": "code",
            "scope": "openid email profile",
            "state": state,
            "prompt": "select_account",
        }
    )
    response = RedirectResponse(f"{GOOGLE_AUTH_URL}?{query}", status_code=302)
    # The state proves the callback belongs to a sign-in this browser started; next is where to go after.
    response.set_cookie(
        OAUTH_COOKIE,
        f"{state}|{_safe_next(next)}",
        max_age=600,
        httponly=True,
        secure=get_settings().app_url.startswith("https://"),
        samesite="lax",
        path="/api/auth",
    )
    return response


def _google_identity(code: str) -> dict:
    s = get_settings()
    with httpx.Client(timeout=15) as http:
        token = http.post(
            GOOGLE_TOKEN_URL,
            data={
                "code": code,
                "client_id": s.google_client_id,
                "client_secret": s.google_client_secret,
                "redirect_uri": _redirect_uri(),
                "grant_type": "authorization_code",
            },
        )
        token.raise_for_status()
        info = http.get(GOOGLE_USERINFO_URL, headers={"Authorization": f"Bearer {token.json()['access_token']}"})
        info.raise_for_status()
        return info.json()


@router.get("/google/callback")
async def google_callback(
    request: Request, code: str | None = None, state: str | None = None, error: str | None = None, db: Session = Depends(get_db)
) -> RedirectResponse:
    def fail(reason: str) -> RedirectResponse:
        response = RedirectResponse(f"/login?error={reason}", status_code=302)
        response.delete_cookie(OAUTH_COOKIE, path="/api/auth")
        return response

    saved_state, _, next_path = (request.cookies.get(OAUTH_COOKIE) or "").partition("|")
    if error:
        return fail("google_cancelled")
    if not code or not state or not saved_state or not secrets.compare_digest(state, saved_state):
        return fail("google_state")

    try:
        identity = await run_in_threadpool(_google_identity, code)
    except (httpx.HTTPError, KeyError, ValueError) as err:
        logger.warning("Google sign-in failed: %r", err)
        return fail("google_failed")
    if not identity.get("sub") or not identity.get("email") or not identity.get("email_verified"):
        return fail("google_unverified")

    user = await run_in_threadpool(
        google_user, db, sub=identity["sub"], email=identity["email"], name=identity.get("name") or "", picture=identity.get("picture")
    )
    await run_in_threadpool(merge_guest, db, await optional_user(request), user)
    token = await run_in_threadpool(create_session, db, user)
    response = RedirectResponse(_safe_next(next_path), status_code=302)
    response.delete_cookie(OAUTH_COOKIE, path="/api/auth")
    set_session_cookie(response, token)
    return response

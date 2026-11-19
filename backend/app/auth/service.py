"""Users, passwords and sessions."""

import base64
import hashlib
import hmac
import re
import secrets
import threading
import time
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, func, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..config import get_settings
from ..errors import AppError
from ..models import OWNED_MODELS, PasswordReset, User, UserSession

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
MIN_PASSWORD = 8

# --- Passwords (scrypt from the standard library) ----------------------------
_N, _R, _P = 2**14, 8, 1


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=_N, r=_R, p=_P, dklen=32)
    return f"scrypt${_N}${_R}${_P}${base64.b64encode(salt).decode()}${base64.b64encode(digest).decode()}"


def verify_password(password: str, stored: str | None) -> bool:
    try:
        algo, n, r, p, salt, digest = (stored or "").split("$")
        if algo != "scrypt":
            return False
        expected = base64.b64decode(digest)
        actual = hashlib.scrypt(
            password.encode(), salt=base64.b64decode(salt), n=int(n), r=int(r), p=int(p), dklen=len(expected)
        )
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(actual, expected)


# A real hash to check against when the email doesn't exist, so both cases take the same time.
_DUMMY_HASH = hash_password(secrets.token_hex(8))


# --- Brute-force protection (per email, in memory) ---------------------------
_MAX_FAILURES, _WINDOW_SEC = 10, 15 * 60
_failures: dict[str, list[float]] = {}
_failures_lock = threading.Lock()


def _check_attempts(email: str) -> None:
    now = time.monotonic()
    with _failures_lock:
        recent = [t for t in _failures.get(email, []) if now - t < _WINDOW_SEC]
        _failures[email] = recent
    if len(recent) >= _MAX_FAILURES:
        raise AppError("TOO_MANY_ATTEMPTS", 429, "Too many failed attempts. Wait 15 minutes and try again.")


def _record_failure(email: str) -> None:
    with _failures_lock:
        _failures.setdefault(email, []).append(time.monotonic())


# --- Users -------------------------------------------------------------------
def normalize_email(email: str) -> str:
    email = email.strip().lower()
    if not EMAIL_RE.match(email) or len(email) > 255:
        raise AppError("INVALID_EMAIL", 400, "Enter a valid email address.")
    return email


def user_json(user: User) -> dict:
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "avatarUrl": user.avatar_url,
        "hasPassword": bool(user.password_hash),
        "hasGoogle": bool(user.google_sub),
        "isGuest": user.is_guest,
    }


def _create_user(db: Session, **fields) -> User:
    """Creates the user. The very first account also takes over data made before accounts existed."""
    is_first = not fields.get("is_guest") and (
        db.scalar(select(func.count(User.id)).where(User.is_guest.is_(False))) or 0
    ) == 0
    user = User(**fields)
    db.add(user)
    try:
        db.flush()
    except IntegrityError as err:
        db.rollback()
        raise AppError("EMAIL_TAKEN", 409, "An account with that email already exists. Log in instead.") from err
    if is_first:
        conn = db.connection()
        for model in OWNED_MODELS:
            conn.execute(text(f"UPDATE {model.__tablename__} SET user_id = :uid WHERE user_id IS NULL"), {"uid": user.id})
    return user


def _check_password(password: str) -> None:
    if len(password) < MIN_PASSWORD:
        raise AppError("WEAK_PASSWORD", 400, f"Use at least {MIN_PASSWORD} characters for your password.")


def register(db: Session, *, name: str, email: str, password: str, guest: User | None = None) -> User:
    """Creates an account. If a guest is signing up, their trial account becomes the real one (keeping their work)."""
    email = normalize_email(email)
    name = name.strip()
    if not name:
        raise AppError("INVALID_NAME", 400, "Enter your name.")
    _check_password(password)
    if db.scalar(select(User).where(User.email == email)):
        raise AppError("EMAIL_TAKEN", 409, "An account with that email already exists. Log in instead.")
    if guest is not None and guest.is_guest:
        guest = db.merge(guest)
        guest.name, guest.email, guest.password_hash, guest.is_guest = name[:120], email, hash_password(password), False
        db.commit()
        return guest
    user = _create_user(db, name=name[:120], email=email, password_hash=hash_password(password))
    db.commit()
    return user


# --- Guests (try before signing up) -----------------------------------------
def create_guest(db: Session) -> User:
    user = _create_user(db, name="Guest", email=f"guest-{secrets.token_hex(12)}@guest.invalid", is_guest=True)
    db.commit()
    return user


def merge_guest(db: Session, guest: User | None, into: User) -> None:
    """Moves a guest's uploads and lessons into the account they just logged in to, then removes the guest."""
    if guest is None or not guest.is_guest or guest.id == into.id:
        return
    conn = db.connection()
    for model in OWNED_MODELS:
        conn.execute(text(f"UPDATE {model.__tablename__} SET user_id = :to WHERE user_id = :guest"), {"to": into.id, "guest": guest.id})
    db.execute(delete(User).where(User.id == guest.id))
    db.commit()


def delete_old_guests(db: Session) -> int:
    """Guest trials that were never turned into accounts are removed (with their data) after a week."""
    cutoff = _utcnow() - timedelta(days=get_settings().guest_days)
    result = db.execute(delete(User).where(User.is_guest.is_(True), User.created_at < cutoff))
    db.commit()
    return result.rowcount or 0


def authenticate(db: Session, *, email: str, password: str) -> User:
    email = email.strip().lower()
    _check_attempts(email)
    user = db.scalar(select(User).where(User.email == email, User.is_guest.is_(False)))
    if user is None or not user.password_hash:
        verify_password(password, _DUMMY_HASH)
        _record_failure(email)
        if user is not None:
            raise AppError("USE_GOOGLE", 401, "This account signs in with Google. Use “Continue with Google”.")
        raise AppError("BAD_CREDENTIALS", 401, "That email and password don't match.")
    if not verify_password(password, user.password_hash):
        _record_failure(email)
        raise AppError("BAD_CREDENTIALS", 401, "That email and password don't match.")
    return user


def google_user(db: Session, *, sub: str, email: str, name: str, picture: str | None) -> User:
    """Finds or creates the account for a verified Google identity, linking it to an existing email account."""
    user = db.scalar(select(User).where(User.google_sub == sub))
    if user is None:
        user = db.scalar(select(User).where(User.email == email.lower()))
        if user is not None:
            user.google_sub = sub
    if user is None:
        user = _create_user(db, name=(name or email.split("@")[0])[:120], email=email.lower(), google_sub=sub)
    if picture and not user.avatar_url:
        user.avatar_url = picture[:500]
    db.commit()
    return user


# --- Sessions ----------------------------------------------------------------
def _utcnow() -> datetime:
    """Naive UTC, matching the DATETIME columns."""
    return datetime.now(UTC).replace(tzinfo=None)


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def create_session(db: Session, user: User) -> str:
    token = secrets.token_urlsafe(32)
    expires = _utcnow() + timedelta(days=get_settings().session_days)
    db.add(UserSession(token_hash=_token_hash(token), user_id=user.id, expires_at=expires))
    # Tidy up this user's expired sessions.
    db.execute(delete(UserSession).where(UserSession.user_id == user.id, UserSession.expires_at < _utcnow()))
    db.commit()
    return token


def user_for_token(db: Session, token: str) -> User | None:
    session = db.get(UserSession, _token_hash(token))
    if session is None or session.expires_at < _utcnow():
        return None
    return db.get(User, session.user_id)


def end_session(db: Session, token: str) -> None:
    db.execute(delete(UserSession).where(UserSession.token_hash == _token_hash(token)))
    db.commit()


# --- Forgot password ---------------------------------------------------------
RESET_MINUTES = 60


def start_password_reset(db: Session, email: str) -> tuple[User, str] | None:
    """Returns (user, token) when the email belongs to an account; None otherwise (the caller says the same either way)."""
    email = email.strip().lower()
    _check_attempts(f"reset:{email}")
    _record_failure(f"reset:{email}")  # counts requests, so one address can't be flooded with emails
    user = db.scalar(select(User).where(User.email == email, User.is_guest.is_(False)))
    if user is None:
        return None
    token = secrets.token_urlsafe(32)
    db.execute(delete(PasswordReset).where(PasswordReset.user_id == user.id))
    db.add(PasswordReset(token_hash=_token_hash(token), user_id=user.id, expires_at=_utcnow() + timedelta(minutes=RESET_MINUTES)))
    db.commit()
    return user, token


def finish_password_reset(db: Session, token: str, password: str) -> User:
    _check_password(password)
    reset = db.get(PasswordReset, _token_hash(token))
    if reset is None or reset.expires_at < _utcnow():
        raise AppError("RESET_EXPIRED", 400, "This reset link has expired or was already used. Request a new one.")
    user = db.get(User, reset.user_id)
    user.password_hash = hash_password(password)
    db.delete(reset)
    # Sign out everywhere else: whoever knew the old password loses access.
    db.execute(delete(UserSession).where(UserSession.user_id == user.id))
    db.commit()
    return user

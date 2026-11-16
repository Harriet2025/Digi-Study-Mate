"""Database engine and per-request sessions."""

from collections.abc import Iterator
from functools import lru_cache

from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import get_settings


class Base(DeclarativeBase):
    pass


@lru_cache
def get_engine() -> Engine:
    url = get_settings().sqlalchemy_url()
    is_sqlite = str(url).startswith("sqlite")
    return create_engine(
        url,
        # Recycle connections before MySQL's wait_timeout closes them; check them before use.
        pool_pre_ping=True,
        pool_recycle=3600,
        connect_args={"check_same_thread": False} if is_sqlite else {},
    )


@lru_cache
def _session_factory() -> sessionmaker[Session]:
    return sessionmaker(bind=get_engine(), expire_on_commit=False)


def get_db() -> Iterator[Session]:
    """FastAPI dependency: one session per request, always closed."""
    session = _session_factory()()
    try:
        yield session
    finally:
        session.close()

"""Database engine and sessions. SQLite on your machine, Postgres (Neon) when deployed."""
from collections.abc import Iterator
from contextlib import contextmanager

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app import config

_engine = None
_sessions: sessionmaker | None = None


def get_engine():
    global _engine, _sessions
    if _engine is None:
        url = config.DATABASE_URL
        if url.startswith("sqlite"):
            if config.REQUIRE_DATABASE:
                raise RuntimeError("DATABASE_URL is not set. Uploads would be lost on restart without a database.")
            _engine = create_engine(url, connect_args={"check_same_thread": False})
        else:
            # Neon pauses idle databases, so test connections before use and recycle them often
            _engine = create_engine(url, pool_pre_ping=True, pool_recycle=300)
        _sessions = sessionmaker(_engine, expire_on_commit=False)
    return _engine


@contextmanager
def session_scope() -> Iterator[Session]:
    get_engine()
    session = _sessions()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def get_session() -> Iterator[Session]:
    """FastAPI dependency."""
    with session_scope() as session:
        yield session


def reset_engine() -> None:
    """Used by tests to point the app at a fresh database."""
    global _engine, _sessions
    if _engine is not None:
        _engine.dispose()
    _engine = _sessions = None


def init_db() -> None:
    from app.models import Base

    Base.metadata.create_all(get_engine())

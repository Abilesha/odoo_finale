"""Database session and base model wiring.

PostgreSQL is the production database.  A local SQLite fallback remains only
for developers who deliberately have not supplied ``DATABASE_URL`` yet.
"""
import os
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker


def _load_local_env() -> None:
    """Load this checkout's ignored ``.env`` without adding a dependency.

    Existing process environment variables always win, which keeps Docker and
    hosted deployments in control while making a local PostgreSQL setup stay
    active when the server is restarted from an IDE or terminal.
    """
    env_file = Path(__file__).resolve().parents[2] / ".env"
    if not env_file.is_file():
        return
    for raw in env_file.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        if key and key.replace("_", "").isalnum():
            os.environ.setdefault(key, value.strip().strip('"').strip("'"))


_load_local_env()

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./royalknot.db").strip()

# Render/Heroku hand out "postgres://" which SQLAlchemy 2.x no longer accepts.
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql+psycopg://", 1)
elif DATABASE_URL.startswith("postgresql://"):
    # Pin the SQLAlchemy driver rather than relying on whichever PostgreSQL
    # adapter happens to be installed on a machine.
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+psycopg://", 1)

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(
    DATABASE_URL,
    connect_args=connect_args,
    pool_pre_ping=True,
    echo=os.getenv("DATABASE_ECHO", "0") == "1",
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

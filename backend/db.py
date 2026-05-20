import os
import sys
from pathlib import Path
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from .constants import SCHEMA_VERSION


def _is_frozen() -> bool:
    return getattr(sys, "frozen", False)


def _data_root() -> Path:
    """Where user data lives (DB, logos, generated proposals).

    In dev (running from source): the repo root — convenient for inspection.
    In frozen .exe mode: %APPDATA%\\SolutionsAI\\AMBSProposalGen\\ — OUTSIDE
    the payload/current/ folder so that swapping in a new payload during an
    update never touches user data.
    """
    if _is_frozen():
        base = Path(os.getenv("APPDATA") or (Path.home() / ".local" / "share"))
        return base / "SolutionsAI" / "AMBSProposalGen"
    return Path(__file__).resolve().parent.parent


# APP_DIR kept for backward compat with any reference — points at the code
# tree in dev, at payload/current in frozen mode. Never use it for user data.
APP_DIR = Path(__file__).resolve().parent.parent

DATA_ROOT = _data_root()
DATA_ROOT.mkdir(parents=True, exist_ok=True)

DATA_DIR = DATA_ROOT / "data"
DATA_DIR.mkdir(exist_ok=True)

LOGOS_DIR = DATA_DIR / "logos"
LOGOS_DIR.mkdir(exist_ok=True)

OUTPUT_DIR = DATA_ROOT / "output"
OUTPUT_DIR.mkdir(exist_ok=True)

DB_PATH = DATA_DIR / "ambs.db"
SCHEMA_FILE = DATA_DIR / "schema_version"


def _ensure_schema_version():
    """Runs BEFORE the engine is created so we can drop an incompatible DB
    file without fighting SQLite's file lock. Demo-only — production would use
    Alembic migrations. User output (.docx proposals) is kept outside the DB."""
    current = None
    if SCHEMA_FILE.exists():
        try:
            current = int(SCHEMA_FILE.read_text(encoding="utf-8").strip())
        except (ValueError, OSError):
            current = None
    if current != SCHEMA_VERSION:
        if DB_PATH.exists():
            try:
                DB_PATH.unlink()
            except OSError:
                pass
        SCHEMA_FILE.write_text(str(SCHEMA_VERSION), encoding="utf-8")


_ensure_schema_version()


engine = create_engine(
    f"sqlite:///{DB_PATH}",
    connect_args={"check_same_thread": False},
    future=True,
)

SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False, future=True)


class Base(DeclarativeBase):
    pass


# Kept for backward compat with seed.py's call — no-op at this point.
def ensure_schema_version():
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

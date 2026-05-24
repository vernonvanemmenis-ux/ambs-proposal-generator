import os
import sys
from pathlib import Path
from sqlalchemy import create_engine, text
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

# Template-level hero images used by the 'hero' section in proposals.
TEMPLATE_HEROES_DIR = DATA_DIR / "heroes"
TEMPLATE_HEROES_DIR.mkdir(exist_ok=True)

OUTPUT_DIR = DATA_ROOT / "output"
OUTPUT_DIR.mkdir(exist_ok=True)

# Canonical product photos for Item catalogue (one image per Item).
ITEM_IMAGES_DIR = DATA_ROOT / "item_images"
ITEM_IMAGES_DIR.mkdir(exist_ok=True)

# Per-opportunity hero image overrides (one image per opportunity, organised
# by opportunity_id so we can wipe a deal's folder without affecting others).
OPP_HEROES_DIR = DATA_ROOT / "opp_heroes"
OPP_HEROES_DIR.mkdir(exist_ok=True)

# Per-opportunity appendix uploads (drawings, PDFs, supporting images).
OPP_ATTACHMENTS_DIR = DATA_ROOT / "opp_attachments"
OPP_ATTACHMENTS_DIR.mkdir(exist_ok=True)

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


def _ensure_columns():
    """Idempotent column-level migration for already-deployed databases.

    Base.metadata.create_all() only adds NEW tables — it does NOT add columns
    to existing ones. When we add a column to a Mapped model, every existing
    install would otherwise crash on first query against that column. This
    runs on every boot, checks PRAGMA table_info, and ALTERs only if missing.
    Safe to extend with more (table, column, ddl) tuples in future migrations.
    """
    migrations = [
        ("items", "image_path", "ALTER TABLE items ADD COLUMN image_path TEXT DEFAULT ''"),
        # Per-opportunity overrides for the new structured sections.
        ("opportunities", "hero_filename", "ALTER TABLE opportunities ADD COLUMN hero_filename TEXT DEFAULT ''"),
        ("opportunities", "warranty_override", "ALTER TABLE opportunities ADD COLUMN warranty_override TEXT DEFAULT ''"),
        ("opportunities", "site_logistics_override", "ALTER TABLE opportunities ADD COLUMN site_logistics_override TEXT DEFAULT ''"),
        ("opportunities", "risks_override_json", "ALTER TABLE opportunities ADD COLUMN risks_override_json TEXT DEFAULT ''"),
        ("opportunities", "section_drafts_json", "ALTER TABLE opportunities ADD COLUMN section_drafts_json TEXT DEFAULT '{}'"),
        # Template-level defaults & hero & tax block.
        ("proposal_templates", "hero_filename", "ALTER TABLE proposal_templates ADD COLUMN hero_filename TEXT DEFAULT ''"),
        ("proposal_templates", "default_warranty_md", "ALTER TABLE proposal_templates ADD COLUMN default_warranty_md TEXT DEFAULT ''"),
        ("proposal_templates", "default_site_logistics_md", "ALTER TABLE proposal_templates ADD COLUMN default_site_logistics_md TEXT DEFAULT ''"),
        ("proposal_templates", "default_risks_json", "ALTER TABLE proposal_templates ADD COLUMN default_risks_json TEXT DEFAULT '[]'"),
        ("proposal_templates", "tax_company_reg", "ALTER TABLE proposal_templates ADD COLUMN tax_company_reg TEXT DEFAULT ''"),
        ("proposal_templates", "tax_vat_number", "ALTER TABLE proposal_templates ADD COLUMN tax_vat_number TEXT DEFAULT ''"),
        ("proposal_templates", "tax_bbbee_level", "ALTER TABLE proposal_templates ADD COLUMN tax_bbbee_level TEXT DEFAULT ''"),
        ("proposal_templates", "tax_bbbee_cert_expiry", "ALTER TABLE proposal_templates ADD COLUMN tax_bbbee_cert_expiry TEXT DEFAULT ''"),
        ("proposal_templates", "tax_address", "ALTER TABLE proposal_templates ADD COLUMN tax_address TEXT DEFAULT ''"),
        ("proposal_templates", "tax_directors", "ALTER TABLE proposal_templates ADD COLUMN tax_directors TEXT DEFAULT ''"),
    ]
    with engine.begin() as conn:
        for table_name, column_name, ddl in migrations:
            try:
                rows = conn.execute(text(f"PRAGMA table_info('{table_name}')")).fetchall()
            except Exception:
                continue  # Table doesn't exist yet — create_all() will handle it.
            existing = {row[1] for row in rows}
            if existing and column_name not in existing:
                try:
                    conn.execute(text(ddl))
                except Exception:
                    pass  # Best-effort; e.g. concurrent boot race.


# Kept for backward compat with seed.py's call — no-op at this point.
def ensure_schema_version():
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

"""Database utilities — exposes the DB location and opens the data folder in
the OS file browser. Only opens the *data* folder (never .exe folders), so the
user can't accidentally poke at program files."""

from __future__ import annotations

import os
import platform
import subprocess
import sys
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import text

from ..db import DATA_DIR, DB_PATH, engine

router = APIRouter(prefix="/api/database", tags=["database"])


class DatabaseInfo(BaseModel):
    db_path: str
    data_folder: str
    db_size_bytes: int
    tables: list[dict]


@router.get("/info", response_model=DatabaseInfo)
def info():
    size = DB_PATH.stat().st_size if DB_PATH.exists() else 0
    # Count rows per table
    tables = []
    with engine.connect() as con:
        rows = con.execute(text(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
        )).fetchall()
        for (name,) in rows:
            count = con.execute(text(f'SELECT COUNT(*) FROM "{name}"')).scalar_one()
            tables.append({"name": name, "rows": int(count)})
    return DatabaseInfo(
        db_path=str(DB_PATH),
        data_folder=str(DATA_DIR),
        db_size_bytes=size,
        tables=tables,
    )


@router.post("/open-folder")
def open_folder():
    """Open the data folder in the OS file browser."""
    folder = Path(DATA_DIR)
    if not folder.exists():
        raise HTTPException(404, "Data folder not found.")
    try:
        if platform.system() == "Windows":
            os.startfile(str(folder))  # type: ignore[attr-defined]
        elif platform.system() == "Darwin":
            subprocess.Popen(["open", str(folder)])
        else:
            subprocess.Popen(["xdg-open", str(folder)])
    except Exception as e:
        raise HTTPException(500, f"Could not open folder: {e}")
    return {"ok": True, "folder": str(folder)}

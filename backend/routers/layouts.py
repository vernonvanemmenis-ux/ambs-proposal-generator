"""Studio mode — per-page layout API.

Read the saved layout for a page, save changes, or reset to the registry
default. The PAGE_BLOCKS registry (backend/blocks.py) is the source of
truth for which block keys are valid per page; saved layouts that
reference unknown keys are dropped silently on read so removing a block
from the registry doesn't crash the page.
"""

from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..blocks import PAGE_BLOCKS, default_layout
from ..db import get_db
from ..models import PageLayout
from ..schemas import PageLayoutBlock, PageLayoutOut, PageLayoutUpdate


router = APIRouter(prefix="/api/layouts", tags=["layouts"])


def _to_out(row: PageLayout | None, page_key: str, blocks: list[dict]) -> PageLayoutOut:
    return PageLayoutOut(
        page_key=page_key,
        blocks=[PageLayoutBlock(**b) for b in blocks],
        updated_at=row.updated_at if row else None,
    )


def _normalise_blocks(page_key: str, saved: list) -> list[dict]:
    """Drop unknown block keys, append registered blocks missing from the
    saved layout. Returns a fresh list in display order."""
    valid_keys = set(PAGE_BLOCKS[page_key].keys())
    clean: list[dict] = []
    seen: set[str] = set()
    for b in saved:
        if not isinstance(b, dict):
            continue
        key = b.get("key")
        if key not in valid_keys or key in seen:
            continue
        clean.append({
            "key": key,
            "enabled": bool(b.get("enabled", True)),
            "config": dict(b.get("config") or {}),
        })
        seen.add(key)
    for key, meta in PAGE_BLOCKS[page_key].items():
        if key not in seen:
            clean.append({"key": key, "enabled": bool(meta.get("default_enabled", True)), "config": {}})
    return clean


@router.get("/registry")
def get_registry():
    """Return the full PAGE_BLOCKS registry so the page editor knows what
    blocks every page supports, with their labels and descriptions."""
    return PAGE_BLOCKS


@router.get("/{page_key}", response_model=PageLayoutOut)
def get_layout(page_key: str, db: Session = Depends(get_db)):
    if page_key not in PAGE_BLOCKS:
        raise HTTPException(404, f"Unknown page_key: {page_key}")
    row = db.query(PageLayout).filter(PageLayout.page_key == page_key).first()
    if row is None:
        return _to_out(None, page_key, default_layout(page_key))
    try:
        saved = json.loads(row.blocks_json or "[]")
        if not isinstance(saved, list):
            saved = []
    except (ValueError, TypeError):
        saved = []
    return _to_out(row, page_key, _normalise_blocks(page_key, saved))


@router.put("/{page_key}", response_model=PageLayoutOut)
def update_layout(page_key: str, payload: PageLayoutUpdate, db: Session = Depends(get_db)):
    if page_key not in PAGE_BLOCKS:
        raise HTTPException(404, f"Unknown page_key: {page_key}")
    blocks = _normalise_blocks(page_key, [b.model_dump() for b in payload.blocks])
    row = db.query(PageLayout).filter(PageLayout.page_key == page_key).first()
    if row is None:
        row = PageLayout(page_key=page_key, blocks_json=json.dumps(blocks))
        db.add(row)
    else:
        row.blocks_json = json.dumps(blocks)
    db.commit()
    db.refresh(row)
    return _to_out(row, page_key, blocks)


@router.post("/{page_key}/reset", response_model=PageLayoutOut)
def reset_layout(page_key: str, db: Session = Depends(get_db)):
    """Delete the saved layout so subsequent GETs return the registry default.

    Used by the "Reset to defaults" button in the page editor drawer
    (Studio §7 Q2 — empty-state placeholder triggers this).
    """
    if page_key not in PAGE_BLOCKS:
        raise HTTPException(404, f"Unknown page_key: {page_key}")
    row = db.query(PageLayout).filter(PageLayout.page_key == page_key).first()
    if row is not None:
        db.delete(row)
        db.commit()
    return _to_out(None, page_key, default_layout(page_key))

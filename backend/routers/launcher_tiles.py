"""Studio mode — CRUD for user-defined launcher tiles.

Custom tiles live alongside the 8 hard-coded launcher tiles. Each one
points to /p/<slug>, which the frontend resolves to a fresh PageRenderer
keyed "custom:<slug>" against the shared "custom" block template
(heading / notes / links).

Deleting a tile also wipes the matching `page_layouts` row so a re-created
tile with the same slug doesn't inherit stale content (handoff §Gotchas).
"""

from __future__ import annotations

import re

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..blocks import CUSTOM_PAGE_PREFIX
from ..db import get_db
from ..models import CustomTile, PageLayout
from ..schemas import CustomTileIn, CustomTileOut, CustomTileUpdate


router = APIRouter(prefix="/api/tiles", tags=["tiles"])


_SLUG_STRIP = re.compile(r"[^a-z0-9]+")


def _slugify(text: str) -> str:
    """Lowercase, replace non-alphanumeric runs with '-', strip ends.

    Deliberately ASCII-only — no unicode transliteration. Empty input
    falls back to "tile" so the unique-suffix loop below always converges.
    """
    base = _SLUG_STRIP.sub("-", text.strip().lower()).strip("-")
    return base or "tile"


def _unique_slug(db: Session, candidate: str, *, exclude_id: int | None = None) -> str:
    """Append -2, -3, ... until the slug is unique within custom_tiles."""
    slug = candidate
    n = 1
    while True:
        q = db.query(CustomTile).filter(CustomTile.slug == slug)
        if exclude_id is not None:
            q = q.filter(CustomTile.id != exclude_id)
        if q.first() is None:
            return slug
        n += 1
        slug = f"{candidate}-{n}"


@router.get("", response_model=list[CustomTileOut])
def list_tiles(db: Session = Depends(get_db)):
    return (
        db.query(CustomTile)
        .order_by(CustomTile.sequence, CustomTile.created_at)
        .all()
    )


@router.post("", response_model=CustomTileOut)
def create_tile(payload: CustomTileIn, db: Session = Depends(get_db)):
    label = (payload.label or "").strip()
    if not label:
        raise HTTPException(400, "label is required")
    raw_slug = payload.slug.strip() or label
    slug = _unique_slug(db, _slugify(raw_slug))
    tile = CustomTile(
        slug=slug,
        label=label,
        icon=payload.icon or "🧩",
        color=payload.color or "#64748b",
        sequence=payload.sequence,
    )
    db.add(tile)
    db.commit()
    db.refresh(tile)
    return tile


@router.put("/{tile_id}", response_model=CustomTileOut)
def update_tile(tile_id: int, payload: CustomTileUpdate, db: Session = Depends(get_db)):
    tile = db.get(CustomTile, tile_id)
    if tile is None:
        raise HTTPException(404, "Tile not found")

    # Capture the old slug so we can rename the matching page_layouts row.
    old_slug = tile.slug

    if payload.label is not None:
        label = payload.label.strip()
        if not label:
            raise HTTPException(400, "label cannot be empty")
        tile.label = label
    if payload.icon is not None:
        tile.icon = payload.icon
    if payload.color is not None:
        tile.color = payload.color
    if payload.sequence is not None:
        tile.sequence = payload.sequence
    if payload.slug is not None:
        new_raw = payload.slug.strip() or tile.label
        tile.slug = _unique_slug(db, _slugify(new_raw), exclude_id=tile.id)

    if tile.slug != old_slug:
        # Carry any saved layout over to the new key so renaming doesn't
        # lose the user's heading / notes / links content.
        old_key = f"{CUSTOM_PAGE_PREFIX}{old_slug}"
        new_key = f"{CUSTOM_PAGE_PREFIX}{tile.slug}"
        row = db.query(PageLayout).filter(PageLayout.page_key == old_key).first()
        if row is not None:
            row.page_key = new_key

    db.commit()
    db.refresh(tile)
    return tile


@router.delete("/{tile_id}")
def delete_tile(tile_id: int, db: Session = Depends(get_db)):
    tile = db.get(CustomTile, tile_id)
    if tile is None:
        raise HTTPException(404, "Tile not found")

    page_key = f"{CUSTOM_PAGE_PREFIX}{tile.slug}"
    layout = db.query(PageLayout).filter(PageLayout.page_key == page_key).first()
    if layout is not None:
        db.delete(layout)
    db.delete(tile)
    db.commit()
    return {"ok": True}

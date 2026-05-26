import re
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from ..db import ITEM_IMAGES_DIR, get_db
from ..models import Item
from ..schemas import ItemIn, ItemOut

router = APIRouter(prefix="/api/items", tags=["items"])

MAX_IMAGE_BYTES = 25 * 1024 * 1024  # match attachments cap
_SAFE_NAME_RE = re.compile(r"[^A-Za-z0-9._-]+")


def _safe_filename(name: str) -> str:
    return _SAFE_NAME_RE.sub("_", name).strip("._-") or "image"


def _delete_image_file(rel_path: str) -> None:
    """Best-effort removal of the on-disk image for an item."""
    if not rel_path:
        return
    try:
        target = ITEM_IMAGES_DIR / rel_path
        target.unlink(missing_ok=True)
    except OSError:
        pass


@router.get("", response_model=list[ItemOut])
def list_items(db: Session = Depends(get_db)):
    return db.query(Item).order_by(Item.category, Item.name).all()


@router.post("", response_model=ItemOut)
def create_item(payload: ItemIn, db: Session = Depends(get_db)):
    if db.query(Item).filter(Item.code == payload.code).first():
        raise HTTPException(409, f"Item with code '{payload.code}' already exists.")
    it = Item(**payload.model_dump())
    db.add(it)
    db.commit()
    db.refresh(it)
    return it


@router.put("/{item_id}", response_model=ItemOut)
def update_item(item_id: int, payload: ItemIn, db: Session = Depends(get_db)):
    it = db.get(Item, item_id)
    if not it:
        raise HTTPException(404, "Item not found")
    dup = db.query(Item).filter(Item.code == payload.code, Item.id != item_id).first()
    if dup:
        raise HTTPException(409, f"Another item already uses code '{payload.code}'.")
    for k, v in payload.model_dump().items():
        setattr(it, k, v)
    db.commit()
    db.refresh(it)
    return it


@router.delete("/{item_id}")
def delete_item(item_id: int, db: Session = Depends(get_db)):
    it = db.get(Item, item_id)
    if not it:
        raise HTTPException(404, "Item not found")
    _delete_image_file(it.image_path)
    db.delete(it)
    db.commit()
    return {"ok": True}


# ----------------------------------------------------------- product image
@router.post("/{item_id}/image", response_model=ItemOut)
async def upload_item_image(
    item_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    it = db.get(Item, item_id)
    if not it:
        raise HTTPException(404, "Item not found")

    data = await file.read()
    if len(data) > MAX_IMAGE_BYTES:
        raise HTTPException(413, "Image exceeds 25 MB limit.")

    # Replace any existing image first so we don't accumulate orphan files.
    _delete_image_file(it.image_path)

    folder = ITEM_IMAGES_DIR / str(item_id)
    folder.mkdir(parents=True, exist_ok=True)
    safe = _safe_filename(file.filename or "image")
    unique_name = f"{uuid.uuid4().hex[:8]}_{safe}"
    target = folder / unique_name
    target.write_bytes(data)

    it.image_path = f"{item_id}/{unique_name}"
    db.commit()
    db.refresh(it)
    return it


@router.delete("/{item_id}/image", response_model=ItemOut)
def delete_item_image(item_id: int, db: Session = Depends(get_db)):
    it = db.get(Item, item_id)
    if not it:
        raise HTTPException(404, "Item not found")
    _delete_image_file(it.image_path)
    it.image_path = ""
    db.commit()
    db.refresh(it)
    return it


@router.get("/{item_id}/image")
def get_item_image(item_id: int, db: Session = Depends(get_db)):
    it = db.get(Item, item_id)
    if not it or not it.image_path:
        raise HTTPException(404, "No image for this item")
    p = ITEM_IMAGES_DIR / it.image_path
    if not p.exists():
        raise HTTPException(410, "Image missing on disk")
    return FileResponse(p)

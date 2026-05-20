from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Item
from ..schemas import ItemIn, ItemOut

router = APIRouter(prefix="/api/items", tags=["items"])


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
    db.delete(it)
    db.commit()
    return {"ok": True}

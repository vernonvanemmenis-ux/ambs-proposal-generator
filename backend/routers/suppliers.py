"""M1 — Suppliers (vendor directory) CRUD.

Mirrors the salespeople router shape (soft-delete via active flag).
ItemSupplier links live under nested endpoints so the frontend can
attach prices/codes per item without a separate page.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import ItemSupplier, Supplier
from ..schemas import ItemSupplierIn, ItemSupplierOut, SupplierIn, SupplierOut


router = APIRouter(prefix="/api/suppliers", tags=["suppliers"])


@router.get("", response_model=list[SupplierOut])
def list_suppliers(
    include_inactive: bool = False,
    db: Session = Depends(get_db),
):
    q = db.query(Supplier)
    if not include_inactive:
        q = q.filter(Supplier.active == True)  # noqa: E712
    return q.order_by(Supplier.name).all()


@router.get("/{supplier_id}", response_model=SupplierOut)
def get_supplier(supplier_id: int, db: Session = Depends(get_db)):
    s = db.get(Supplier, supplier_id)
    if not s:
        raise HTTPException(404, "Supplier not found")
    return s


@router.post("", response_model=SupplierOut)
def create_supplier(payload: SupplierIn, db: Session = Depends(get_db)):
    s = Supplier(**payload.model_dump())
    db.add(s)
    db.commit()
    db.refresh(s)
    return s


@router.put("/{supplier_id}", response_model=SupplierOut)
def update_supplier(supplier_id: int, payload: SupplierIn, db: Session = Depends(get_db)):
    s = db.get(Supplier, supplier_id)
    if not s:
        raise HTTPException(404, "Supplier not found")
    for k, v in payload.model_dump().items():
        setattr(s, k, v)
    db.commit()
    db.refresh(s)
    return s


@router.delete("/{supplier_id}")
def delete_supplier(supplier_id: int, db: Session = Depends(get_db)):
    """Soft-delete: marks the supplier inactive so historical purchase
    orders (M2+) still resolve their supplier's name."""
    s = db.get(Supplier, supplier_id)
    if not s:
        raise HTTPException(404, "Supplier not found")
    s.active = False
    db.commit()
    return {"ok": True, "soft_deleted": True}


# ---------- ItemSupplier links ----------

@router.get("/{supplier_id}/items", response_model=list[ItemSupplierOut])
def list_supplier_items(supplier_id: int, db: Session = Depends(get_db)):
    s = db.get(Supplier, supplier_id)
    if not s:
        raise HTTPException(404, "Supplier not found")
    return (
        db.query(ItemSupplier)
        .filter(ItemSupplier.supplier_id == supplier_id)
        .order_by(ItemSupplier.id)
        .all()
    )


@router.post("/{supplier_id}/items", response_model=ItemSupplierOut)
def link_item(supplier_id: int, payload: ItemSupplierIn, db: Session = Depends(get_db)):
    if payload.supplier_id != supplier_id:
        raise HTTPException(400, "supplier_id mismatch between URL and body")
    s = db.get(Supplier, supplier_id)
    if not s:
        raise HTTPException(404, "Supplier not found")
    link = ItemSupplier(**payload.model_dump())
    db.add(link)
    db.commit()
    db.refresh(link)
    return link


@router.put("/{supplier_id}/items/{link_id}", response_model=ItemSupplierOut)
def update_link(supplier_id: int, link_id: int, payload: ItemSupplierIn, db: Session = Depends(get_db)):
    link = db.get(ItemSupplier, link_id)
    if not link or link.supplier_id != supplier_id:
        raise HTTPException(404, "Link not found")
    for k, v in payload.model_dump().items():
        setattr(link, k, v)
    db.commit()
    db.refresh(link)
    return link


@router.delete("/{supplier_id}/items/{link_id}")
def delete_link(supplier_id: int, link_id: int, db: Session = Depends(get_db)):
    link = db.get(ItemSupplier, link_id)
    if not link or link.supplier_id != supplier_id:
        raise HTTPException(404, "Link not found")
    db.delete(link)
    db.commit()
    return {"ok": True}

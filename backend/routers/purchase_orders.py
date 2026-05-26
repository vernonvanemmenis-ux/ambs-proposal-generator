"""M2 — Purchase Orders router.

Lifecycle: draft → confirmed → received (→ cancelled).
- POST / PUT mutate while draft only.
- POST /{id}/confirm flips draft → confirmed and stamps confirmed_at.
- POST /{id}/receive accepts per-line received quantities, creates a
  Receipt record, increments PurchaseLine.received_qty, and (when every
  line is fully received) marks the PO received + stamps received_at.
- POST /{id}/cancel marks the PO cancelled (only from draft/confirmed).

M3 will replace the simple received_qty counter with StockMove records;
the endpoint contract stays the same so the frontend doesn't move.
"""

from __future__ import annotations

import json
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import PurchaseLine, PurchaseOrder, Receipt, Supplier
from ..schemas import (
    PurchaseOrderCreate,
    PurchaseOrderOut,
    PurchaseOrderUpdate,
    PurchaseLineIn,
    ReceiptIn,
    ReceiptOut,
)
from ..services import stock as stock_svc


router = APIRouter(prefix="/api/purchase-orders", tags=["purchase-orders"])


_DRAFT = "draft"
_CONFIRMED = "confirmed"
_RECEIVED = "received"
_CANCELLED = "cancelled"
_OPEN_STATES = {_DRAFT, _CONFIRMED}


def _gen_ref(db: Session) -> str:
    """Sequential ref like PO-000123 — best-effort, no concurrent-write
    safety needed (single-user offline app)."""
    last = db.query(PurchaseOrder).order_by(PurchaseOrder.id.desc()).first()
    next_id = (last.id if last else 0) + 1
    return f"PO-{next_id:06d}"


def _ensure_supplier(db: Session, supplier_id: int) -> Supplier:
    s = db.get(Supplier, supplier_id)
    if not s:
        raise HTTPException(404, f"Supplier {supplier_id} not found")
    return s


def _set_lines(po: PurchaseOrder, line_payloads: list[PurchaseLineIn]) -> None:
    """Replace the PO's lines with the supplied set. Used by create + update."""
    po.lines.clear()
    for idx, lp in enumerate(line_payloads):
        po.lines.append(PurchaseLine(
            sequence=lp.sequence or idx,
            item_id=lp.item_id,
            description=lp.description,
            quantity=lp.quantity,
            unit_of_measure=lp.unit_of_measure,
            unit_cost=lp.unit_cost,
            supplier_code=lp.supplier_code,
        ))


@router.get("", response_model=list[PurchaseOrderOut])
def list_pos(status: str | None = None, db: Session = Depends(get_db)):
    q = db.query(PurchaseOrder)
    if status:
        q = q.filter(PurchaseOrder.status == status)
    return q.order_by(PurchaseOrder.created_at.desc()).all()


@router.get("/{po_id}", response_model=PurchaseOrderOut)
def get_po(po_id: int, db: Session = Depends(get_db)):
    po = db.get(PurchaseOrder, po_id)
    if not po:
        raise HTTPException(404, "Purchase order not found")
    return po


@router.post("", response_model=PurchaseOrderOut)
def create_po(payload: PurchaseOrderCreate, db: Session = Depends(get_db)):
    _ensure_supplier(db, payload.supplier_id)
    po = PurchaseOrder(
        ref=_gen_ref(db),
        supplier_id=payload.supplier_id,
        status=_DRAFT,
        expected_date=payload.expected_date,
        currency=payload.currency or "ZAR",
        notes=payload.notes,
    )
    _set_lines(po, payload.lines)
    db.add(po)
    db.commit()
    db.refresh(po)
    return po


@router.put("/{po_id}", response_model=PurchaseOrderOut)
def update_po(po_id: int, payload: PurchaseOrderUpdate, db: Session = Depends(get_db)):
    po = db.get(PurchaseOrder, po_id)
    if not po:
        raise HTTPException(404, "Purchase order not found")
    if po.status != _DRAFT:
        raise HTTPException(400, f"Cannot edit a {po.status} PO — only drafts are editable")
    if payload.supplier_id is not None:
        _ensure_supplier(db, payload.supplier_id)
        po.supplier_id = payload.supplier_id
    if payload.expected_date is not None:
        po.expected_date = payload.expected_date
    if payload.currency is not None:
        po.currency = payload.currency
    if payload.notes is not None:
        po.notes = payload.notes
    db.commit()
    db.refresh(po)
    return po


@router.put("/{po_id}/lines", response_model=PurchaseOrderOut)
def replace_lines(po_id: int, lines: list[PurchaseLineIn], db: Session = Depends(get_db)):
    po = db.get(PurchaseOrder, po_id)
    if not po:
        raise HTTPException(404, "Purchase order not found")
    if po.status != _DRAFT:
        raise HTTPException(400, f"Cannot edit lines on a {po.status} PO")
    _set_lines(po, lines)
    db.commit()
    db.refresh(po)
    return po


@router.delete("/{po_id}")
def delete_po(po_id: int, db: Session = Depends(get_db)):
    po = db.get(PurchaseOrder, po_id)
    if not po:
        raise HTTPException(404, "Purchase order not found")
    if po.status not in (_DRAFT, _CANCELLED):
        raise HTTPException(400, f"Cannot delete a {po.status} PO — cancel it first")
    db.delete(po)
    db.commit()
    return {"ok": True}


@router.post("/{po_id}/confirm", response_model=PurchaseOrderOut)
def confirm_po(po_id: int, db: Session = Depends(get_db)):
    po = db.get(PurchaseOrder, po_id)
    if not po:
        raise HTTPException(404, "Purchase order not found")
    if po.status != _DRAFT:
        raise HTTPException(400, f"Cannot confirm a {po.status} PO")
    if not po.lines:
        raise HTTPException(400, "Cannot confirm a PO with no lines")
    po.status = _CONFIRMED
    po.confirmed_at = datetime.utcnow()
    db.commit()
    db.refresh(po)
    return po


@router.post("/{po_id}/cancel", response_model=PurchaseOrderOut)
def cancel_po(po_id: int, db: Session = Depends(get_db)):
    po = db.get(PurchaseOrder, po_id)
    if not po:
        raise HTTPException(404, "Purchase order not found")
    if po.status not in _OPEN_STATES:
        raise HTTPException(400, f"Cannot cancel a {po.status} PO")
    po.status = _CANCELLED
    db.commit()
    db.refresh(po)
    return po


@router.post("/{po_id}/receive", response_model=PurchaseOrderOut)
def receive_po(po_id: int, payload: ReceiptIn, db: Session = Depends(get_db)):
    """Record a delivery against a confirmed PO.

    The payload's `lines` carries `(line_id, received_qty)` pairs — the
    quantity NEWLY received in this event. We append to received_qty
    rather than overwrite so a multi-shipment delivery accumulates
    correctly. When every line is fully received the PO flips to
    `received` and stamps `received_at`.
    """
    po = db.get(PurchaseOrder, po_id)
    if not po:
        raise HTTPException(404, "Purchase order not found")
    if po.status != _CONFIRMED:
        raise HTTPException(400, f"Cannot receive against a {po.status} PO")

    # Validate every supplied line_id belongs to this PO and the qty
    # doesn't take us past the ordered quantity (the supplier sent extra
    # is a real-world case but we'd rather catch a typo here).
    line_by_id = {ln.id: ln for ln in po.lines}
    deltas: dict[int, float] = {}
    for rl in payload.lines:
        ln = line_by_id.get(rl.line_id)
        if ln is None:
            raise HTTPException(400, f"Line {rl.line_id} not on this PO")
        if rl.received_qty < 0:
            raise HTTPException(400, "received_qty must be >= 0")
        remaining = float(ln.quantity) - float(ln.received_qty)
        if rl.received_qty > remaining + 1e-9:
            raise HTTPException(
                400,
                f"Line {rl.line_id}: receiving {rl.received_qty} would exceed remaining {remaining}",
            )
        deltas[rl.line_id] = rl.received_qty

    # Apply the deltas + persist the audit row.
    # If inventory is wired up (M3+), each delta also spawns a done
    # StockMove from the supplier virtual location into the default
    # internal location so on-hand actually rises. We skip the move if
    # the catalogue isn't ready (no supplier location, no internal
    # location, or the line has no item_id) — the PO still receives.
    supplier_loc = stock_svc.get_virtual_location(db, "supplier")
    internal_loc = stock_svc.get_default_internal_location(db)
    stock_warnings: list[str] = []

    for line_id, delta in deltas.items():
        line = line_by_id[line_id]
        line.received_qty = float(line.received_qty) + float(delta)
        if delta <= 0:
            continue
        if line.item_id and supplier_loc and internal_loc:
            stock_svc.create_move(
                db,
                item_id=line.item_id,
                qty=float(delta),
                source_location_id=supplier_loc.id,
                dest_location_id=internal_loc.id,
                reference_kind="po_receipt",
                reference_id=po.id,
                notes=f"PO {po.ref} line {line_id}",
                auto_done=True,
            )
        elif not (supplier_loc and internal_loc):
            stock_warnings.append(
                "inventory not configured — receipt recorded but stock unchanged",
            )
        # else: line has no item_id (free-text PO line), skip silently.

    receipt = Receipt(
        po_id=po.id,
        notes=payload.notes,
        lines_json=json.dumps([
            {"line_id": rl.line_id, "received_qty": rl.received_qty}
            for rl in payload.lines
        ]),
    )
    db.add(receipt)

    # If every line is now fully received, close the PO.
    if all(float(ln.received_qty) + 1e-9 >= float(ln.quantity) for ln in po.lines):
        po.status = _RECEIVED
        po.received_at = datetime.utcnow()

    db.commit()
    db.refresh(po)
    return po


@router.get("/{po_id}/receipts", response_model=list[ReceiptOut])
def list_receipts(po_id: int, db: Session = Depends(get_db)):
    po = db.get(PurchaseOrder, po_id)
    if not po:
        raise HTTPException(404, "Purchase order not found")
    return po.receipts

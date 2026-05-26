"""M4 — Sales orders router.

Sales orders are created via POST /api/opportunities/{id}/confirm (see
opportunities.py) and surfaced as a separate resource from there on.

Lifecycle: confirmed → delivered → invoiced → paid (terminal escape:
cancelled from any pre-paid state).

`delivered` is set when /deliver flips all reserved StockMoves to done
(if any were reserved). `invoiced` and `paid` are derived from the
invoices collection — the SO transitions when invoiced_total >= total
and paid_total >= total respectively.
"""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Opportunity, SalesOrder, StockMove
from ..schemas import SalesOrderOut


router = APIRouter(prefix="/api/sales-orders", tags=["sales-orders"])


_CONFIRMED = "confirmed"
_DELIVERED = "delivered"
_INVOICED = "invoiced"
_PAID = "paid"
_CANCELLED = "cancelled"
_TERMINAL = {_PAID, _CANCELLED}


@router.get("", response_model=list[SalesOrderOut])
def list_sales_orders(state: str | None = None, db: Session = Depends(get_db)):
    q = db.query(SalesOrder)
    if state:
        q = q.filter(SalesOrder.state == state)
    return q.order_by(SalesOrder.created_at.desc()).all()


@router.get("/{so_id}", response_model=SalesOrderOut)
def get_sales_order(so_id: int, db: Session = Depends(get_db)):
    so = db.get(SalesOrder, so_id)
    if not so:
        raise HTTPException(404, "Sales order not found")
    return so


@router.post("/{so_id}/deliver", response_model=SalesOrderOut)
def deliver(so_id: int, db: Session = Depends(get_db)):
    """Mark the SO delivered.

    Flips every confirmed StockMove referencing this SO to done so the
    customer-location quants decrement. If no reservations exist (M3
    not configured or the SO was confirmed before inventory was set up)
    the flip is a no-op and the SO still transitions.
    """
    so = db.get(SalesOrder, so_id)
    if not so:
        raise HTTPException(404, "Sales order not found")
    if so.state in _TERMINAL:
        raise HTTPException(400, f"Cannot deliver a {so.state} SO")
    if so.state == _DELIVERED:
        return so

    moves = (
        db.query(StockMove)
        .filter(
            StockMove.reference_kind == "sales_order",
            StockMove.reference_id == so.id,
            StockMove.state == "confirmed",
        )
        .all()
    )
    now = datetime.utcnow()
    for mv in moves:
        mv.state = "done"
        mv.done_at = now

    so.state = _DELIVERED
    so.delivered_at = now
    db.commit()
    db.refresh(so)
    return so


@router.post("/{so_id}/cancel", response_model=SalesOrderOut)
def cancel(so_id: int, db: Session = Depends(get_db)):
    """Cancel the SO. Cancels any non-done reserved StockMoves too."""
    so = db.get(SalesOrder, so_id)
    if not so:
        raise HTTPException(404, "Sales order not found")
    if so.state == _PAID:
        raise HTTPException(400, "Cannot cancel a paid SO")
    if so.state == _CANCELLED:
        return so

    moves = (
        db.query(StockMove)
        .filter(
            StockMove.reference_kind == "sales_order",
            StockMove.reference_id == so.id,
            StockMove.state.in_(["draft", "confirmed"]),
        )
        .all()
    )
    for mv in moves:
        mv.state = "cancelled"

    so.state = _CANCELLED
    so.cancelled_at = datetime.utcnow()
    db.commit()
    db.refresh(so)
    return so


@router.get("/by-opportunity/{opp_id}", response_model=SalesOrderOut | None)
def get_for_opportunity(opp_id: int, db: Session = Depends(get_db)):
    """Returns the SO for an opportunity if one exists, else null.

    Used by the frontend to show a "Confirm to SO" button vs an
    "Open SO" link on the opportunity form.
    """
    opp = db.get(Opportunity, opp_id)
    if not opp:
        raise HTTPException(404, "Opportunity not found")
    return db.query(SalesOrder).filter(SalesOrder.opportunity_id == opp_id).first()

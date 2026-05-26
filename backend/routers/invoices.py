"""M4 — Invoices router.

Invoices belong to a SalesOrder. Lifecycle: draft → sent → paid (or
cancelled). The SO transitions to `invoiced` / `paid` automatically when
its invoiced_total / paid_total cross the SO total threshold (computed
on the SO model).

Two `kind`s for an invoice:
- `down_payment`: total auto-defaults to SO.total * SO.deposit_pct / 100
                  when not supplied.
- `regular`:     total auto-defaults to SO.total minus invoices already
                 raised (i.e. the remaining balance).
"""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Invoice, Payment, SalesOrder
from ..schemas import InvoiceIn, InvoiceOut, InvoiceUpdate, PaymentIn, PaymentOut


router = APIRouter(prefix="/api/invoices", tags=["invoices"])


_DRAFT = "draft"
_SENT = "sent"
_PAID = "paid"
_CANCELLED = "cancelled"


def _gen_ref(db: Session, kind: str) -> str:
    last = db.query(Invoice).order_by(Invoice.id.desc()).first()
    n = (last.id if last else 0) + 1
    prefix = "DP" if kind == "down_payment" else "INV"
    return f"{prefix}-{n:06d}"


def _refresh_so_state(db: Session, so: SalesOrder) -> None:
    """Bump the SO state up the funnel as invoices/payments mount.

    Never downgrades (a paid SO stays paid even if you delete an
    invoice; the user should cancel the SO instead).

    The SO's `invoices` relationship may be stale at the moment this
    runs (we just inserted a new invoice or payment), so we expire it
    first to force a fresh load when total/paid_total/invoiced_total
    are computed.
    """
    if so.state in {"cancelled", "paid"}:
        return
    total = so.total
    if total <= 0:
        return
    db.expire(so, ["invoices"])
    inv_total = so.invoiced_total
    paid_total = so.paid_total
    if paid_total + 1e-6 >= total:
        so.state = "paid"
    elif so.state in {"confirmed", "delivered"} and inv_total + 1e-6 >= total:
        so.state = "invoiced"


@router.get("", response_model=list[InvoiceOut])
def list_invoices(
    state: str | None = None,
    sales_order_id: int | None = None,
    db: Session = Depends(get_db),
):
    q = db.query(Invoice)
    if state:
        q = q.filter(Invoice.state == state)
    if sales_order_id is not None:
        q = q.filter(Invoice.sales_order_id == sales_order_id)
    return q.order_by(Invoice.created_at.desc()).all()


@router.get("/{inv_id}", response_model=InvoiceOut)
def get_invoice(inv_id: int, db: Session = Depends(get_db)):
    inv = db.get(Invoice, inv_id)
    if not inv:
        raise HTTPException(404, "Invoice not found")
    return inv


@router.post("", response_model=InvoiceOut)
def create_invoice(payload: InvoiceIn, db: Session = Depends(get_db)):
    so = db.get(SalesOrder, payload.sales_order_id)
    if not so:
        raise HTTPException(404, f"Sales order {payload.sales_order_id} not found")
    if so.state == "cancelled":
        raise HTTPException(400, "Cannot invoice a cancelled SO")
    if payload.kind not in {"regular", "down_payment"}:
        raise HTTPException(400, "kind must be 'regular' or 'down_payment'")

    # Auto-compute total when the caller leaves it at 0 — UX shortcut so
    # the frontend doesn't have to replicate the deposit math.
    total = float(payload.total or 0.0)
    if total <= 0:
        so_total = float(so.total or 0.0)
        if payload.kind == "down_payment":
            total = so_total * float(so.deposit_pct or 0.0) / 100.0
        else:
            already = sum(float(i.total or 0.0) for i in so.invoices if i.state != "cancelled")
            total = max(0.0, so_total - already)
    if total <= 0:
        raise HTTPException(400, "Cannot create a zero-total invoice")

    inv = Invoice(
        ref=_gen_ref(db, payload.kind),
        sales_order_id=so.id,
        kind=payload.kind,
        state=_DRAFT,
        total=total,
        currency=payload.currency or so.currency or "ZAR",
        due_date=payload.due_date,
        notes=payload.notes,
    )
    db.add(inv)
    db.flush()
    # Bump SO to 'invoiced' if this invoice closes the invoicing gap.
    _refresh_so_state(db, so)
    db.commit()
    db.refresh(inv)
    return inv


@router.put("/{inv_id}", response_model=InvoiceOut)
def update_invoice(inv_id: int, payload: InvoiceUpdate, db: Session = Depends(get_db)):
    inv = db.get(Invoice, inv_id)
    if not inv:
        raise HTTPException(404, "Invoice not found")
    if inv.state != _DRAFT:
        raise HTTPException(400, f"Cannot edit a {inv.state} invoice")
    if payload.total is not None:
        if payload.total <= 0:
            raise HTTPException(400, "total must be > 0")
        inv.total = float(payload.total)
    if payload.due_date is not None:
        inv.due_date = payload.due_date
    if payload.notes is not None:
        inv.notes = payload.notes
    db.commit()
    db.refresh(inv)
    return inv


@router.post("/{inv_id}/send", response_model=InvoiceOut)
def mark_sent(inv_id: int, db: Session = Depends(get_db)):
    inv = db.get(Invoice, inv_id)
    if not inv:
        raise HTTPException(404, "Invoice not found")
    if inv.state != _DRAFT:
        raise HTTPException(400, f"Cannot send a {inv.state} invoice")
    inv.state = _SENT
    inv.sent_at = datetime.utcnow()
    db.commit()
    db.refresh(inv)
    return inv


@router.post("/{inv_id}/cancel", response_model=InvoiceOut)
def cancel(inv_id: int, db: Session = Depends(get_db)):
    inv = db.get(Invoice, inv_id)
    if not inv:
        raise HTTPException(404, "Invoice not found")
    if inv.state == _PAID:
        raise HTTPException(400, "Cannot cancel a paid invoice")
    inv.state = _CANCELLED
    db.commit()
    db.refresh(inv)
    return inv


@router.delete("/{inv_id}")
def delete_invoice(inv_id: int, db: Session = Depends(get_db)):
    inv = db.get(Invoice, inv_id)
    if not inv:
        raise HTTPException(404, "Invoice not found")
    if inv.state not in (_DRAFT, _CANCELLED):
        raise HTTPException(400, f"Cannot delete a {inv.state} invoice — cancel it first")
    db.delete(inv)
    db.commit()
    return {"ok": True}


# ---------- Payments (nested under invoice) ----------

@router.get("/{inv_id}/payments", response_model=list[PaymentOut])
def list_payments(inv_id: int, db: Session = Depends(get_db)):
    inv = db.get(Invoice, inv_id)
    if not inv:
        raise HTTPException(404, "Invoice not found")
    return inv.payments


@router.post("/{inv_id}/payments", response_model=PaymentOut)
def record_payment(inv_id: int, payload: PaymentIn, db: Session = Depends(get_db)):
    """Add a payment to an invoice. Auto-flips invoice to paid when the
    sum reaches total. If the invoice is still in draft, a payment
    implicitly sends it (rare in practice but tolerated)."""
    inv = db.get(Invoice, inv_id)
    if not inv:
        raise HTTPException(404, "Invoice not found")
    if inv.state == _CANCELLED:
        raise HTTPException(400, "Cannot pay a cancelled invoice")
    if payload.amount <= 0:
        raise HTTPException(400, "amount must be > 0")
    if payload.method not in {"cash", "eft", "card", "other"}:
        raise HTTPException(400, "method must be one of cash | eft | card | other")

    pay = Payment(
        invoice_id=inv.id,
        amount=float(payload.amount),
        method=payload.method,
        reference=payload.reference,
        notes=payload.notes,
        received_at=payload.received_at or datetime.utcnow(),
    )
    db.add(pay)
    db.flush()

    # State transitions on the invoice.
    if inv.state == _DRAFT:
        inv.state = _SENT
        inv.sent_at = inv.sent_at or datetime.utcnow()
    if inv.paid_total + 1e-6 >= inv.total:
        inv.state = _PAID
        inv.paid_at = datetime.utcnow()

    # Roll up to the SO.
    so = db.get(SalesOrder, inv.sales_order_id)
    if so:
        _refresh_so_state(db, so)

    db.commit()
    db.refresh(pay)
    return pay


@router.delete("/{inv_id}/payments/{pay_id}")
def delete_payment(inv_id: int, pay_id: int, db: Session = Depends(get_db)):
    pay = db.get(Payment, pay_id)
    if not pay or pay.invoice_id != inv_id:
        raise HTTPException(404, "Payment not found")
    inv = pay.invoice
    db.delete(pay)
    db.flush()
    # If invoice was paid and removing this payment drops below total,
    # demote back to sent (don't go all the way to draft — sent_at is
    # already populated).
    if inv.state == _PAID and inv.paid_total + 1e-6 < inv.total:
        inv.state = _SENT
        inv.paid_at = None
    so = db.get(SalesOrder, inv.sales_order_id)
    if so and so.state == "paid" and so.paid_total + 1e-6 < so.total:
        # SO downgrade is mostly a sanity check; if you really want to
        # un-pay, cancel the invoice instead.
        so.state = "invoiced" if so.invoiced_total + 1e-6 >= so.total else "delivered"
    db.commit()
    return {"ok": True}

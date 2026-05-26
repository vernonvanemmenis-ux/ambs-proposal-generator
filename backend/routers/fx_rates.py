"""M6 — FX rates router.

Flat table of currency conversion rates. Each row is a directional
pair (from → to) with an effective_date. The "current" rate is the
most recent active row for a given pair.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import FxRate
from ..schemas import FxRateIn, FxRateOut


router = APIRouter(prefix="/api/fx-rates", tags=["fx-rates"])


@router.get("", response_model=list[FxRateOut])
def list_rates(include_inactive: bool = False, db: Session = Depends(get_db)):
    q = db.query(FxRate)
    if not include_inactive:
        q = q.filter(FxRate.active == True)  # noqa: E712
    return q.order_by(FxRate.from_currency, FxRate.to_currency, FxRate.effective_date.desc()).all()


@router.post("", response_model=FxRateOut)
def create_rate(payload: FxRateIn, db: Session = Depends(get_db)):
    fc = (payload.from_currency or "").upper().strip()
    tc = (payload.to_currency or "").upper().strip()
    if not fc or not tc:
        raise HTTPException(400, "from_currency and to_currency are required")
    if fc == tc:
        raise HTTPException(400, "from_currency and to_currency must differ")
    if payload.rate <= 0:
        raise HTTPException(400, "rate must be > 0")
    row = FxRate(
        from_currency=fc,
        to_currency=tc,
        rate=float(payload.rate),
        effective_date=payload.effective_date,
        notes=payload.notes,
        active=payload.active,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.put("/{rate_id}", response_model=FxRateOut)
def update_rate(rate_id: int, payload: FxRateIn, db: Session = Depends(get_db)):
    row = db.get(FxRate, rate_id)
    if not row:
        raise HTTPException(404, "FX rate not found")
    fc = (payload.from_currency or "").upper().strip()
    tc = (payload.to_currency or "").upper().strip()
    if not fc or not tc:
        raise HTTPException(400, "from_currency and to_currency are required")
    if fc == tc:
        raise HTTPException(400, "from_currency and to_currency must differ")
    if payload.rate <= 0:
        raise HTTPException(400, "rate must be > 0")
    row.from_currency = fc
    row.to_currency = tc
    row.rate = float(payload.rate)
    row.effective_date = payload.effective_date or row.effective_date
    row.notes = payload.notes
    row.active = payload.active
    db.commit()
    db.refresh(row)
    return row


@router.delete("/{rate_id}")
def delete_rate(rate_id: int, db: Session = Depends(get_db)):
    row = db.get(FxRate, rate_id)
    if not row:
        raise HTTPException(404, "FX rate not found")
    db.delete(row)
    db.commit()
    return {"ok": True}

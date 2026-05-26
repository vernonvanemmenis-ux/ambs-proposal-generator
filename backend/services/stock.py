"""M3 — Stock service.

Centralises the rules for creating, confirming, and aggregating
StockMoves so the inventory router and the PO router both call into
the same code path. Quants are computed on demand from done moves
(per the plan — denormalise only if perf hurts).
"""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime

from fastapi import HTTPException
from sqlalchemy import case, func
from sqlalchemy.orm import Session

from ..models import Item, Location, Lot, StockMove


_DRAFT = "draft"
_CONFIRMED = "confirmed"
_DONE = "done"
_CANCELLED = "cancelled"


def _ensure_location(db: Session, loc_id: int) -> Location:
    loc = db.get(Location, loc_id)
    if not loc:
        raise HTTPException(404, f"Location {loc_id} not found")
    return loc


def _ensure_item(db: Session, item_id: int) -> Item:
    it = db.get(Item, item_id)
    if not it:
        raise HTTPException(404, f"Item {item_id} not found")
    return it


def _ensure_lot(db: Session, lot_id: int | None, item_id: int) -> Lot | None:
    if lot_id is None:
        return None
    lot = db.get(Lot, lot_id)
    if not lot:
        raise HTTPException(404, f"Lot {lot_id} not found")
    if lot.item_id != item_id:
        raise HTTPException(400, f"Lot {lot_id} belongs to item {lot.item_id}, not {item_id}")
    return lot


def create_move(
    db: Session,
    *,
    item_id: int,
    qty: float,
    source_location_id: int,
    dest_location_id: int,
    lot_id: int | None = None,
    reference_kind: str = "",
    reference_id: int | None = None,
    notes: str = "",
    auto_confirm: bool = False,
    auto_done: bool = False,
) -> StockMove:
    """Create a StockMove. Optionally short-circuit it through
    confirmed/done in one call (used by PO receipts and reorder triggers
    that produce immediately-realised stock).
    """
    if qty <= 0:
        raise HTTPException(400, "qty must be > 0")
    if source_location_id == dest_location_id:
        raise HTTPException(400, "source and destination locations must differ")
    _ensure_item(db, item_id)
    _ensure_location(db, source_location_id)
    _ensure_location(db, dest_location_id)
    _ensure_lot(db, lot_id, item_id)

    move = StockMove(
        item_id=item_id,
        qty=qty,
        source_location_id=source_location_id,
        dest_location_id=dest_location_id,
        lot_id=lot_id,
        reference_kind=reference_kind,
        reference_id=reference_id,
        notes=notes,
        state=_DRAFT,
    )
    db.add(move)
    db.flush()  # need move.id below

    if auto_done:
        move.state = _DONE
        move.done_at = datetime.utcnow()
    elif auto_confirm:
        move.state = _CONFIRMED

    return move


def confirm_move(db: Session, move: StockMove) -> StockMove:
    if move.state != _DRAFT:
        raise HTTPException(400, f"Cannot confirm a {move.state} move")
    move.state = _CONFIRMED
    return move


def done_move(db: Session, move: StockMove) -> StockMove:
    if move.state not in (_DRAFT, _CONFIRMED):
        raise HTTPException(400, f"Cannot complete a {move.state} move")
    move.state = _DONE
    move.done_at = datetime.utcnow()
    return move


def cancel_move(db: Session, move: StockMove) -> StockMove:
    if move.state == _DONE:
        raise HTTPException(400, "Done moves are immutable")
    if move.state == _CANCELLED:
        return move
    move.state = _CANCELLED
    return move


def quants_for(
    db: Session,
    *,
    item_id: int | None = None,
    location_id: int | None = None,
) -> list[dict]:
    """Return on-hand stock from done moves.

    Aggregates +qty into dest_location and -qty from source_location
    per (item_id, location_id, lot_id). Filters drop zero/negative
    entries; for internal locations a negative quant is a data bug,
    for virtual locations (supplier/customer) negative is expected
    so we don't filter those.
    """
    # Sum moves into dest locations as positive, source as negative.
    # SQLAlchemy lets us union the two sides with a UNION ALL via a
    # subquery, but for clarity (and SQLite perf is fine at this scale)
    # we run two queries and merge in Python.
    dest_q = db.query(
        StockMove.item_id,
        StockMove.dest_location_id.label("location_id"),
        StockMove.lot_id,
        func.sum(StockMove.qty).label("qty"),
    ).filter(StockMove.state == _DONE).group_by(
        StockMove.item_id, StockMove.dest_location_id, StockMove.lot_id,
    )
    src_q = db.query(
        StockMove.item_id,
        StockMove.source_location_id.label("location_id"),
        StockMove.lot_id,
        func.sum(-StockMove.qty).label("qty"),
    ).filter(StockMove.state == _DONE).group_by(
        StockMove.item_id, StockMove.source_location_id, StockMove.lot_id,
    )

    if item_id is not None:
        dest_q = dest_q.filter(StockMove.item_id == item_id)
        src_q = src_q.filter(StockMove.item_id == item_id)
    if location_id is not None:
        dest_q = dest_q.filter(StockMove.dest_location_id == location_id)
        src_q = src_q.filter(StockMove.source_location_id == location_id)

    bucket: dict[tuple, float] = defaultdict(float)
    for row in dest_q.all():
        bucket[(row.item_id, row.location_id, row.lot_id)] += float(row.qty or 0)
    for row in src_q.all():
        bucket[(row.item_id, row.location_id, row.lot_id)] += float(row.qty or 0)

    out: list[dict] = []
    for (iid, lid, lot), q in bucket.items():
        if abs(q) < 1e-9:
            continue
        out.append({
            "item_id": iid,
            "location_id": lid,
            "lot_id": lot,
            "qty": float(q),
        })
    return out


def on_hand(db: Session, item_id: int, location_id: int) -> float:
    """Fast helper: scalar on-hand for one (item, location) ignoring lots."""
    quants = quants_for(db, item_id=item_id, location_id=location_id)
    return sum(q["qty"] for q in quants)


def get_default_internal_location(db: Session) -> Location | None:
    """First active internal location, used when callers don't specify."""
    return (
        db.query(Location)
        .filter(Location.kind == "internal", Location.active == True)  # noqa: E712
        .order_by(Location.id)
        .first()
    )


def get_virtual_location(db: Session, kind: str) -> Location | None:
    """First active virtual location of a given kind (supplier/customer/scrap/production)."""
    if kind not in {"supplier", "customer", "scrap", "production"}:
        raise ValueError(f"Not a virtual kind: {kind}")
    return (
        db.query(Location)
        .filter(Location.kind == kind, Location.active == True)  # noqa: E712
        .order_by(Location.id)
        .first()
    )

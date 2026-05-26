"""M3 — Inventory router.

Exposes warehouses, locations, lots, stock moves, on-hand quants, scrap,
and reorder rules + their trigger. Stock moves are immutable once done;
draft/confirmed moves can be cancelled. The reorder trigger reads the
rules, computes shortfall, picks the cheapest active ItemSupplier per
item, and creates one DRAFT PurchaseOrder per supplier covering all the
shortfall lines together.
"""

from __future__ import annotations

import math
from collections import defaultdict
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import (
    ItemSupplier,
    Location,
    Lot,
    PurchaseLine,
    PurchaseOrder,
    ReorderRule,
    Scrap,
    StockMove,
    Supplier,
    Warehouse,
)
from ..schemas import (
    LocationIn,
    LocationOut,
    LotIn,
    LotOut,
    QuantOut,
    ReorderRuleIn,
    ReorderRuleOut,
    ReorderTriggerResult,
    ScrapIn,
    ScrapOut,
    StockMoveIn,
    StockMoveOut,
    WarehouseIn,
    WarehouseOut,
)
from ..services import stock as stock_svc


router = APIRouter(prefix="/api/inventory", tags=["inventory"])


_LOCATION_KINDS = {"internal", "supplier", "customer", "production", "scrap"}


# ---------------- Warehouses ----------------

@router.get("/warehouses", response_model=list[WarehouseOut])
def list_warehouses(include_inactive: bool = False, db: Session = Depends(get_db)):
    q = db.query(Warehouse)
    if not include_inactive:
        q = q.filter(Warehouse.active == True)  # noqa: E712
    return q.order_by(Warehouse.name).all()


@router.post("/warehouses", response_model=WarehouseOut)
def create_warehouse(payload: WarehouseIn, db: Session = Depends(get_db)):
    w = Warehouse(**payload.model_dump())
    db.add(w)
    db.commit()
    db.refresh(w)
    return w


@router.put("/warehouses/{wh_id}", response_model=WarehouseOut)
def update_warehouse(wh_id: int, payload: WarehouseIn, db: Session = Depends(get_db)):
    w = db.get(Warehouse, wh_id)
    if not w:
        raise HTTPException(404, "Warehouse not found")
    for k, v in payload.model_dump().items():
        setattr(w, k, v)
    db.commit()
    db.refresh(w)
    return w


@router.delete("/warehouses/{wh_id}")
def delete_warehouse(wh_id: int, db: Session = Depends(get_db)):
    w = db.get(Warehouse, wh_id)
    if not w:
        raise HTTPException(404, "Warehouse not found")
    w.active = False
    db.commit()
    return {"ok": True, "soft_deleted": True}


# ---------------- Locations ----------------

@router.get("/locations", response_model=list[LocationOut])
def list_locations(
    warehouse_id: int | None = None,
    kind: str | None = None,
    include_inactive: bool = False,
    db: Session = Depends(get_db),
):
    q = db.query(Location)
    if warehouse_id is not None:
        q = q.filter(Location.warehouse_id == warehouse_id)
    if kind:
        q = q.filter(Location.kind == kind)
    if not include_inactive:
        q = q.filter(Location.active == True)  # noqa: E712
    return q.order_by(Location.kind, Location.name).all()


@router.post("/locations", response_model=LocationOut)
def create_location(payload: LocationIn, db: Session = Depends(get_db)):
    if payload.kind not in _LOCATION_KINDS:
        raise HTTPException(400, f"Unknown location kind: {payload.kind}")
    if payload.kind == "internal" and payload.warehouse_id is None:
        raise HTTPException(400, "Internal locations require a warehouse_id")
    if payload.warehouse_id is not None:
        if not db.get(Warehouse, payload.warehouse_id):
            raise HTTPException(404, "Warehouse not found")
    loc = Location(**payload.model_dump())
    db.add(loc)
    db.commit()
    db.refresh(loc)
    return loc


@router.put("/locations/{loc_id}", response_model=LocationOut)
def update_location(loc_id: int, payload: LocationIn, db: Session = Depends(get_db)):
    loc = db.get(Location, loc_id)
    if not loc:
        raise HTTPException(404, "Location not found")
    if payload.kind not in _LOCATION_KINDS:
        raise HTTPException(400, f"Unknown location kind: {payload.kind}")
    for k, v in payload.model_dump().items():
        setattr(loc, k, v)
    db.commit()
    db.refresh(loc)
    return loc


@router.delete("/locations/{loc_id}")
def delete_location(loc_id: int, db: Session = Depends(get_db)):
    loc = db.get(Location, loc_id)
    if not loc:
        raise HTTPException(404, "Location not found")
    loc.active = False
    db.commit()
    return {"ok": True, "soft_deleted": True}


# ---------------- Lots ----------------

@router.get("/lots", response_model=list[LotOut])
def list_lots(item_id: int | None = None, db: Session = Depends(get_db)):
    q = db.query(Lot)
    if item_id is not None:
        q = q.filter(Lot.item_id == item_id)
    return q.order_by(Lot.created_at.desc()).all()


@router.post("/lots", response_model=LotOut)
def create_lot(payload: LotIn, db: Session = Depends(get_db)):
    lot = Lot(**payload.model_dump())
    db.add(lot)
    db.commit()
    db.refresh(lot)
    return lot


@router.delete("/lots/{lot_id}")
def delete_lot(lot_id: int, db: Session = Depends(get_db)):
    lot = db.get(Lot, lot_id)
    if not lot:
        raise HTTPException(404, "Lot not found")
    # Only safe to delete if no move references the lot.
    in_use = db.query(StockMove).filter(StockMove.lot_id == lot_id).first()
    if in_use:
        raise HTTPException(400, "Lot is referenced by one or more stock moves — cannot delete")
    db.delete(lot)
    db.commit()
    return {"ok": True}


# ---------------- Stock moves ----------------

@router.get("/moves", response_model=list[StockMoveOut])
def list_moves(
    state: str | None = None,
    item_id: int | None = None,
    location_id: int | None = None,
    limit: int = 200,
    db: Session = Depends(get_db),
):
    q = db.query(StockMove)
    if state:
        q = q.filter(StockMove.state == state)
    if item_id is not None:
        q = q.filter(StockMove.item_id == item_id)
    if location_id is not None:
        q = q.filter(
            (StockMove.source_location_id == location_id)
            | (StockMove.dest_location_id == location_id),
        )
    return q.order_by(StockMove.created_at.desc()).limit(limit).all()


@router.post("/moves", response_model=StockMoveOut)
def create_move(
    payload: StockMoveIn,
    immediate: bool = False,
    db: Session = Depends(get_db),
):
    """Create a stock move.

    Default is draft; set ?immediate=true to also confirm + complete in
    one call (used by the manual transfer UI which has no separate
    'confirm shipment' step).
    """
    move = stock_svc.create_move(
        db,
        item_id=payload.item_id,
        qty=payload.qty,
        source_location_id=payload.source_location_id,
        dest_location_id=payload.dest_location_id,
        lot_id=payload.lot_id,
        reference_kind=payload.reference_kind,
        reference_id=payload.reference_id,
        notes=payload.notes,
        auto_done=immediate,
    )
    db.commit()
    db.refresh(move)
    return move


@router.post("/moves/{move_id}/confirm", response_model=StockMoveOut)
def confirm_move(move_id: int, db: Session = Depends(get_db)):
    move = db.get(StockMove, move_id)
    if not move:
        raise HTTPException(404, "Move not found")
    stock_svc.confirm_move(db, move)
    db.commit()
    db.refresh(move)
    return move


@router.post("/moves/{move_id}/done", response_model=StockMoveOut)
def complete_move(move_id: int, db: Session = Depends(get_db)):
    move = db.get(StockMove, move_id)
    if not move:
        raise HTTPException(404, "Move not found")
    stock_svc.done_move(db, move)
    db.commit()
    db.refresh(move)
    return move


@router.post("/moves/{move_id}/cancel", response_model=StockMoveOut)
def cancel_move(move_id: int, db: Session = Depends(get_db)):
    move = db.get(StockMove, move_id)
    if not move:
        raise HTTPException(404, "Move not found")
    stock_svc.cancel_move(db, move)
    db.commit()
    db.refresh(move)
    return move


# ---------------- Quants (on-hand snapshot) ----------------

@router.get("/quants", response_model=list[QuantOut])
def list_quants(
    item_id: int | None = None,
    location_id: int | None = None,
    db: Session = Depends(get_db),
):
    return stock_svc.quants_for(db, item_id=item_id, location_id=location_id)


# ---------------- Scrap ----------------

@router.post("/scrap", response_model=ScrapOut)
def create_scrap(payload: ScrapIn, db: Session = Depends(get_db)):
    scrap_loc = stock_svc.get_virtual_location(db, "scrap")
    if not scrap_loc:
        raise HTTPException(400, "No scrap location exists — create one (kind='scrap') first")
    if payload.source_location_id == scrap_loc.id:
        raise HTTPException(400, "source_location cannot be the scrap location itself")
    move = stock_svc.create_move(
        db,
        item_id=payload.item_id,
        qty=payload.qty,
        source_location_id=payload.source_location_id,
        dest_location_id=scrap_loc.id,
        lot_id=payload.lot_id,
        reference_kind="scrap",
        notes=payload.reason,
        auto_done=True,
    )
    db.flush()
    scrap = Scrap(stock_move_id=move.id, reason=payload.reason)
    db.add(scrap)
    db.commit()
    db.refresh(scrap)
    return scrap


@router.get("/scrap", response_model=list[ScrapOut])
def list_scraps(db: Session = Depends(get_db)):
    return db.query(Scrap).order_by(Scrap.created_at.desc()).all()


# ---------------- Reorder rules ----------------

@router.get("/reorder-rules", response_model=list[ReorderRuleOut])
def list_rules(include_inactive: bool = False, db: Session = Depends(get_db)):
    q = db.query(ReorderRule)
    if not include_inactive:
        q = q.filter(ReorderRule.active == True)  # noqa: E712
    return q.order_by(ReorderRule.id).all()


@router.post("/reorder-rules", response_model=ReorderRuleOut)
def create_rule(payload: ReorderRuleIn, db: Session = Depends(get_db)):
    if payload.max_qty < payload.min_qty:
        raise HTTPException(400, "max_qty must be >= min_qty")
    if payload.qty_multiple <= 0:
        raise HTTPException(400, "qty_multiple must be > 0")
    rule = ReorderRule(**payload.model_dump())
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return rule


@router.put("/reorder-rules/{rule_id}", response_model=ReorderRuleOut)
def update_rule(rule_id: int, payload: ReorderRuleIn, db: Session = Depends(get_db)):
    rule = db.get(ReorderRule, rule_id)
    if not rule:
        raise HTTPException(404, "Rule not found")
    if payload.max_qty < payload.min_qty:
        raise HTTPException(400, "max_qty must be >= min_qty")
    for k, v in payload.model_dump().items():
        setattr(rule, k, v)
    db.commit()
    db.refresh(rule)
    return rule


@router.delete("/reorder-rules/{rule_id}")
def delete_rule(rule_id: int, db: Session = Depends(get_db)):
    rule = db.get(ReorderRule, rule_id)
    if not rule:
        raise HTTPException(404, "Rule not found")
    db.delete(rule)
    db.commit()
    return {"ok": True}


def _gen_po_ref(db: Session) -> str:
    last = db.query(PurchaseOrder).order_by(PurchaseOrder.id.desc()).first()
    return f"PO-{(last.id if last else 0) + 1:06d}"


@router.post("/reorder-rules/trigger", response_model=ReorderTriggerResult)
def trigger_reorder(db: Session = Depends(get_db)):
    """Walk every active rule, compute shortfall, group by cheapest
    supplier, create one draft PO per supplier.

    Shortfall = max(0, max_qty - on_hand). Rounded UP to the nearest
    qty_multiple. Picks the cheapest active ItemSupplier link by
    `supplier_price` (ties broken by lowest id). Rules with no supplier
    link are reported in `skipped` so the user knows what to fix.
    """
    rules = db.query(ReorderRule).filter(ReorderRule.active == True).all()  # noqa: E712
    if not rules:
        return ReorderTriggerResult()

    # Group shortfall lines by supplier so a single PO covers all the
    # items that supplier provides.
    by_supplier: dict[int, list[dict]] = defaultdict(list)
    skipped: list[dict] = []

    for rule in rules:
        on_hand = stock_svc.on_hand(db, rule.item_id, rule.location_id)
        shortfall = rule.max_qty - on_hand
        if shortfall <= 0:
            skipped.append({
                "rule_id": rule.id,
                "reason": f"on-hand {on_hand} already >= max {rule.max_qty}",
            })
            continue
        if on_hand >= rule.min_qty:
            skipped.append({
                "rule_id": rule.id,
                "reason": f"on-hand {on_hand} >= min {rule.min_qty} — not below threshold",
            })
            continue
        # Round shortfall up to the qty_multiple.
        mult = float(rule.qty_multiple or 1)
        order_qty = math.ceil(shortfall / mult) * mult

        link = (
            db.query(ItemSupplier)
            .join(Supplier, Supplier.id == ItemSupplier.supplier_id)
            .filter(ItemSupplier.item_id == rule.item_id, Supplier.active == True)  # noqa: E712
            .order_by(ItemSupplier.supplier_price, ItemSupplier.id)
            .first()
        )
        if not link:
            skipped.append({
                "rule_id": rule.id,
                "reason": "no active supplier link for this item — add one in Suppliers",
            })
            continue

        by_supplier[link.supplier_id].append({
            "rule_id": rule.id,
            "item_id": rule.item_id,
            "qty": order_qty,
            "unit_cost": float(link.supplier_price),
            "supplier_code": link.supplier_code,
        })

    created_ids: list[int] = []
    for supplier_id, entries in by_supplier.items():
        po = PurchaseOrder(
            ref=_gen_po_ref(db),
            supplier_id=supplier_id,
            status="draft",
            notes="Auto-generated by reorder trigger",
        )
        db.add(po)
        db.flush()  # need po.id for the lines
        for i, e in enumerate(entries):
            po.lines.append(PurchaseLine(
                po_id=po.id,
                sequence=i,
                item_id=e["item_id"],
                description="",
                quantity=e["qty"],
                unit_of_measure="each",
                unit_cost=e["unit_cost"],
                supplier_code=e["supplier_code"],
            ))
        db.flush()
        created_ids.append(po.id)

    db.commit()
    return ReorderTriggerResult(created_po_ids=created_ids, skipped=skipped)

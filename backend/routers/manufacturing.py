"""M5 — Manufacturing router.

Covers BoMs, BoM lines + operations, WorkCenters, ManufacturingOrders
(with the spawn-work-orders + reserve-components → finish flow), and
QualityChecks (which block MO completion when failed).

Stock flow on an MO:
  1. POST /mo            — create draft.
  2. POST /mo/{id}/confirm — reserve components: one confirmed StockMove
                              per BoMLine (internal → production virtual).
                              Spawn WorkOrders from BoMOperations.
  3. WorkOrders are started/finished in any order via POST /wo/{id}/start
     and /wo/{id}/finish.
  4. POST /mo/{id}/start  — bookkeeping flip to in_progress.
  5. POST /mo/{id}/finish — refuses if any QC is `fail` or any non-cancelled
                              WO isn't done. Completes reservations (consumes
                              components), produces finished good (production
                              → dest internal location, state=done). Flips MO
                              to done.
  6. POST /mo/{id}/cancel — cancels reservations, cancels open WOs, flips MO.
"""

from __future__ import annotations

import math
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import (
    BoM,
    BoMLine,
    BoMOperation,
    Item,
    ManufacturingOrder,
    QualityCheck,
    StockMove,
    WorkCenter,
    WorkOrder,
)
from ..schemas import (
    BoMIn,
    BoMOut,
    BoMLineIn,
    BoMOperationIn,
    ManufacturingOrderIn,
    ManufacturingOrderOut,
    ManufacturingOrderUpdate,
    QualityCheckIn,
    QualityCheckOut,
    QualityCheckUpdate,
    WorkCenterIn,
    WorkCenterOut,
    WorkOrderOut,
    WorkOrderUpdate,
)
from ..services import stock as stock_svc


router = APIRouter(prefix="/api/manufacturing", tags=["manufacturing"])


# ============================================================================
# Work centers
# ============================================================================

@router.get("/work-centers", response_model=list[WorkCenterOut])
def list_work_centers(include_inactive: bool = False, db: Session = Depends(get_db)):
    q = db.query(WorkCenter)
    if not include_inactive:
        q = q.filter(WorkCenter.active == True)  # noqa: E712
    return q.order_by(WorkCenter.name).all()


@router.post("/work-centers", response_model=WorkCenterOut)
def create_work_center(payload: WorkCenterIn, db: Session = Depends(get_db)):
    wc = WorkCenter(**payload.model_dump())
    db.add(wc)
    db.commit()
    db.refresh(wc)
    return wc


@router.put("/work-centers/{wc_id}", response_model=WorkCenterOut)
def update_work_center(wc_id: int, payload: WorkCenterIn, db: Session = Depends(get_db)):
    wc = db.get(WorkCenter, wc_id)
    if not wc:
        raise HTTPException(404, "Work center not found")
    for k, v in payload.model_dump().items():
        setattr(wc, k, v)
    db.commit()
    db.refresh(wc)
    return wc


@router.delete("/work-centers/{wc_id}")
def delete_work_center(wc_id: int, db: Session = Depends(get_db)):
    wc = db.get(WorkCenter, wc_id)
    if not wc:
        raise HTTPException(404, "Work center not found")
    wc.active = False
    db.commit()
    return {"ok": True, "soft_deleted": True}


# ============================================================================
# Bills of Materials
# ============================================================================

def _replace_bom_children(db: Session, bom: BoM, lines: list[BoMLineIn], operations: list[BoMOperationIn]) -> None:
    bom.lines.clear()
    for idx, lp in enumerate(lines):
        bom.lines.append(BoMLine(
            item_id=lp.item_id,
            sequence=lp.sequence or idx,
            qty_required=lp.qty_required,
            unit_of_measure=lp.unit_of_measure,
            scrap_pct=lp.scrap_pct,
        ))
    bom.operations.clear()
    for idx, op in enumerate(operations):
        bom.operations.append(BoMOperation(
            work_center_id=op.work_center_id,
            name=op.name,
            sequence=op.sequence or idx,
            duration_min=op.duration_min,
            notes=op.notes,
        ))


@router.get("/boms", response_model=list[BoMOut])
def list_boms(item_id: int | None = None, include_inactive: bool = False, db: Session = Depends(get_db)):
    q = db.query(BoM)
    if item_id is not None:
        q = q.filter(BoM.item_id == item_id)
    if not include_inactive:
        q = q.filter(BoM.active == True)  # noqa: E712
    return q.order_by(BoM.item_id, BoM.version.desc()).all()


@router.get("/boms/{bom_id}", response_model=BoMOut)
def get_bom(bom_id: int, db: Session = Depends(get_db)):
    b = db.get(BoM, bom_id)
    if not b:
        raise HTTPException(404, "BoM not found")
    return b


@router.post("/boms", response_model=BoMOut)
def create_bom(payload: BoMIn, db: Session = Depends(get_db)):
    if not db.get(Item, payload.item_id):
        raise HTTPException(404, f"Item {payload.item_id} not found")
    for op in payload.operations:
        if not db.get(WorkCenter, op.work_center_id):
            raise HTTPException(404, f"Work center {op.work_center_id} not found")
    bom = BoM(
        item_id=payload.item_id,
        code=payload.code,
        version=payload.version,
        qty_produced=payload.qty_produced,
        active=payload.active,
        notes=payload.notes,
    )
    db.add(bom)
    db.flush()
    _replace_bom_children(db, bom, payload.lines, payload.operations)
    db.commit()
    db.refresh(bom)
    return bom


@router.put("/boms/{bom_id}", response_model=BoMOut)
def update_bom(bom_id: int, payload: BoMIn, db: Session = Depends(get_db)):
    bom = db.get(BoM, bom_id)
    if not bom:
        raise HTTPException(404, "BoM not found")
    in_use = db.query(ManufacturingOrder).filter(
        ManufacturingOrder.bom_id == bom_id,
        ManufacturingOrder.state.in_(["confirmed", "in_progress"]),
    ).first()
    if in_use:
        raise HTTPException(400, f"Cannot edit BoM — MO {in_use.ref} is open against it. Cancel it first.")
    bom.item_id = payload.item_id
    bom.code = payload.code
    bom.version = payload.version
    bom.qty_produced = payload.qty_produced
    bom.active = payload.active
    bom.notes = payload.notes
    _replace_bom_children(db, bom, payload.lines, payload.operations)
    db.commit()
    db.refresh(bom)
    return bom


@router.delete("/boms/{bom_id}")
def delete_bom(bom_id: int, db: Session = Depends(get_db)):
    bom = db.get(BoM, bom_id)
    if not bom:
        raise HTTPException(404, "BoM not found")
    any_mo = db.query(ManufacturingOrder).filter(ManufacturingOrder.bom_id == bom_id).first()
    if any_mo:
        bom.active = False
        db.commit()
        return {"ok": True, "soft_deleted": True}
    db.delete(bom)
    db.commit()
    return {"ok": True}


# ============================================================================
# Manufacturing orders
# ============================================================================

def _gen_mo_ref(db: Session) -> str:
    last = db.query(ManufacturingOrder).order_by(ManufacturingOrder.id.desc()).first()
    return f"MO-{(last.id if last else 0) + 1:06d}"


def _resolve_locations(
    db: Session,
    mo: ManufacturingOrder,
) -> tuple[int | None, int | None, int | None]:
    """Return (src_internal_id, production_id, dest_internal_id).

    `src_internal` = where components live (default internal location).
    `production` = virtual production location for the reservation.
    `dest_internal` = where the finished good lands (defaults to src).
    """
    src = None
    if mo.source_location_id is not None:
        src = db.get(type(stock_svc.get_default_internal_location(db) or object), mo.source_location_id)
    else:
        src = stock_svc.get_default_internal_location(db)
    prod = stock_svc.get_virtual_location(db, "production")
    dest = None
    if mo.dest_location_id is not None:
        # Soft fetch
        from ..models import Location
        dest = db.get(Location, mo.dest_location_id)
    else:
        dest = src
    return (
        src.id if src else None,
        prod.id if prod else None,
        dest.id if dest else None,
    )


@router.get("/manufacturing-orders", response_model=list[ManufacturingOrderOut])
def list_mos(state: str | None = None, db: Session = Depends(get_db)):
    q = db.query(ManufacturingOrder)
    if state:
        q = q.filter(ManufacturingOrder.state == state)
    return q.order_by(ManufacturingOrder.created_at.desc()).all()


@router.get("/manufacturing-orders/{mo_id}", response_model=ManufacturingOrderOut)
def get_mo(mo_id: int, db: Session = Depends(get_db)):
    mo = db.get(ManufacturingOrder, mo_id)
    if not mo:
        raise HTTPException(404, "Manufacturing order not found")
    return mo


@router.post("/manufacturing-orders", response_model=ManufacturingOrderOut)
def create_mo(payload: ManufacturingOrderIn, db: Session = Depends(get_db)):
    bom = db.get(BoM, payload.bom_id)
    if not bom:
        raise HTTPException(404, f"BoM {payload.bom_id} not found")
    if payload.qty_to_produce <= 0:
        raise HTTPException(400, "qty_to_produce must be > 0")
    mo = ManufacturingOrder(
        ref=_gen_mo_ref(db),
        bom_id=bom.id,
        qty_to_produce=payload.qty_to_produce,
        state="draft",
        source_location_id=payload.source_location_id,
        dest_location_id=payload.dest_location_id,
        scheduled_start=payload.scheduled_start,
        notes=payload.notes,
    )
    db.add(mo)
    db.commit()
    db.refresh(mo)
    return mo


@router.put("/manufacturing-orders/{mo_id}", response_model=ManufacturingOrderOut)
def update_mo(mo_id: int, payload: ManufacturingOrderUpdate, db: Session = Depends(get_db)):
    mo = db.get(ManufacturingOrder, mo_id)
    if not mo:
        raise HTTPException(404, "Manufacturing order not found")
    if mo.state != "draft":
        raise HTTPException(400, f"Cannot edit a {mo.state} MO")
    for field, val in payload.model_dump(exclude_unset=True).items():
        setattr(mo, field, val)
    db.commit()
    db.refresh(mo)
    return mo


@router.delete("/manufacturing-orders/{mo_id}")
def delete_mo(mo_id: int, db: Session = Depends(get_db)):
    mo = db.get(ManufacturingOrder, mo_id)
    if not mo:
        raise HTTPException(404, "Manufacturing order not found")
    if mo.state not in ("draft", "cancelled"):
        raise HTTPException(400, f"Cannot delete a {mo.state} MO — cancel it first")
    db.delete(mo)
    db.commit()
    return {"ok": True}


def _scaled_component_qty(line: BoMLine, mo_qty: float, bom_qty_produced: float) -> float:
    base = float(line.qty_required) * (float(mo_qty) / float(bom_qty_produced or 1.0))
    scrap_factor = 1.0 + float(line.scrap_pct or 0.0) / 100.0
    return base * scrap_factor


@router.post("/manufacturing-orders/{mo_id}/confirm", response_model=ManufacturingOrderOut)
def confirm_mo(mo_id: int, db: Session = Depends(get_db)):
    mo = db.get(ManufacturingOrder, mo_id)
    if not mo:
        raise HTTPException(404, "Manufacturing order not found")
    if mo.state != "draft":
        raise HTTPException(400, f"Cannot confirm a {mo.state} MO")
    bom = mo.bom
    if not bom or not bom.lines:
        raise HTTPException(400, "BoM has no component lines — cannot confirm")

    src_id, prod_id, _dest_id = _resolve_locations(db, mo)
    if src_id is None or prod_id is None:
        raise HTTPException(
            400,
            "Inventory not configured — need a default internal location AND a virtual production location",
        )
    if src_id == prod_id:
        raise HTTPException(400, "source and production locations must differ")

    # Reserve components — one confirmed StockMove per BoMLine.
    for line in bom.lines:
        qty = _scaled_component_qty(line, mo.qty_to_produce, bom.qty_produced)
        if qty <= 0:
            continue
        stock_svc.create_move(
            db,
            item_id=line.item_id,
            qty=qty,
            source_location_id=src_id,
            dest_location_id=prod_id,
            reference_kind="mo_reservation",
            reference_id=mo.id,
            notes=f"MO {mo.ref} component reservation",
            auto_confirm=True,
        )

    # Spawn WorkOrders from BoMOperations.
    for op in bom.operations:
        if not db.get(WorkCenter, op.work_center_id):
            continue
        db.add(WorkOrder(
            mo_id=mo.id,
            operation_id=op.id,
            work_center_id=op.work_center_id,
            name=op.name,
            sequence=op.sequence,
            state="pending",
            notes=op.notes,
        ))

    mo.state = "confirmed"
    mo.confirmed_at = datetime.utcnow()
    db.commit()
    db.refresh(mo)
    return mo


@router.post("/manufacturing-orders/{mo_id}/start", response_model=ManufacturingOrderOut)
def start_mo(mo_id: int, db: Session = Depends(get_db)):
    mo = db.get(ManufacturingOrder, mo_id)
    if not mo:
        raise HTTPException(404, "Manufacturing order not found")
    if mo.state != "confirmed":
        raise HTTPException(400, f"Cannot start a {mo.state} MO")
    mo.state = "in_progress"
    mo.started_at = datetime.utcnow()
    db.commit()
    db.refresh(mo)
    return mo


@router.post("/manufacturing-orders/{mo_id}/finish", response_model=ManufacturingOrderOut)
def finish_mo(mo_id: int, db: Session = Depends(get_db)):
    """Complete the MO.

    Guards:
      - Every non-cancelled WO must be done.
      - No QualityCheck may be `fail`.

    Side effects:
      - Component reservations (confirmed moves) flipped to done.
      - One production output move (production → dest internal) for
        qty_to_produce of the BoM item, state=done.
    """
    mo = db.get(ManufacturingOrder, mo_id)
    if not mo:
        raise HTTPException(404, "Manufacturing order not found")
    if mo.state not in ("confirmed", "in_progress"):
        raise HTTPException(400, f"Cannot finish a {mo.state} MO")

    pending = [w for w in mo.work_orders if w.state not in ("done", "cancelled")]
    if pending:
        raise HTTPException(
            400,
            f"Cannot finish — {len(pending)} work order(s) still open: {', '.join(w.name for w in pending)}",
        )
    failed = [qc for qc in mo.quality_checks if qc.result == "fail"]
    if failed:
        raise HTTPException(
            400,
            f"Cannot finish — {len(failed)} quality check(s) failed",
        )

    src_id, prod_id, dest_id = _resolve_locations(db, mo)
    if prod_id is None or dest_id is None:
        raise HTTPException(400, "Inventory not configured — cannot complete the production output move")

    # Complete each reservation move.
    reservations = (
        db.query(StockMove)
        .filter(
            StockMove.reference_kind == "mo_reservation",
            StockMove.reference_id == mo.id,
            StockMove.state == "confirmed",
        )
        .all()
    )
    now = datetime.utcnow()
    for mv in reservations:
        mv.state = "done"
        mv.done_at = now

    # Produce the finished good: production → dest internal, done.
    stock_svc.create_move(
        db,
        item_id=mo.bom.item_id,
        qty=float(mo.qty_to_produce),
        source_location_id=prod_id,
        dest_location_id=dest_id,
        reference_kind="mo_production",
        reference_id=mo.id,
        notes=f"{mo.ref} output ({mo.bom.qty_produced} × per batch)",
        auto_done=True,
    )

    mo.state = "done"
    mo.finished_at = now
    db.commit()
    db.refresh(mo)
    return mo


@router.post("/manufacturing-orders/{mo_id}/cancel", response_model=ManufacturingOrderOut)
def cancel_mo(mo_id: int, db: Session = Depends(get_db)):
    mo = db.get(ManufacturingOrder, mo_id)
    if not mo:
        raise HTTPException(404, "Manufacturing order not found")
    if mo.state == "done":
        raise HTTPException(400, "Cannot cancel a completed MO")
    if mo.state == "cancelled":
        return mo
    # Cancel open reservations + work orders.
    for mv in db.query(StockMove).filter(
        StockMove.reference_kind == "mo_reservation",
        StockMove.reference_id == mo.id,
        StockMove.state.in_(["draft", "confirmed"]),
    ).all():
        mv.state = "cancelled"
    for wo in mo.work_orders:
        if wo.state in ("pending", "in_progress"):
            wo.state = "cancelled"
    mo.state = "cancelled"
    mo.cancelled_at = datetime.utcnow()
    db.commit()
    db.refresh(mo)
    return mo


# ============================================================================
# Work orders
# ============================================================================

@router.put("/work-orders/{wo_id}", response_model=WorkOrderOut)
def update_work_order(wo_id: int, payload: WorkOrderUpdate, db: Session = Depends(get_db)):
    wo = db.get(WorkOrder, wo_id)
    if not wo:
        raise HTTPException(404, "Work order not found")
    if wo.state in ("done", "cancelled"):
        raise HTTPException(400, f"Cannot edit a {wo.state} work order")
    for field, val in payload.model_dump(exclude_unset=True).items():
        setattr(wo, field, val)
    db.commit()
    db.refresh(wo)
    return wo


@router.post("/work-orders/{wo_id}/start", response_model=WorkOrderOut)
def start_work_order(wo_id: int, db: Session = Depends(get_db)):
    wo = db.get(WorkOrder, wo_id)
    if not wo:
        raise HTTPException(404, "Work order not found")
    if wo.state != "pending":
        raise HTTPException(400, f"Cannot start a {wo.state} work order")
    wo.state = "in_progress"
    wo.started_at = datetime.utcnow()
    db.commit()
    db.refresh(wo)
    return wo


@router.post("/work-orders/{wo_id}/finish", response_model=WorkOrderOut)
def finish_work_order(wo_id: int, db: Session = Depends(get_db)):
    wo = db.get(WorkOrder, wo_id)
    if not wo:
        raise HTTPException(404, "Work order not found")
    if wo.state not in ("pending", "in_progress"):
        raise HTTPException(400, f"Cannot finish a {wo.state} work order")
    now = datetime.utcnow()
    if wo.started_at is None:
        wo.started_at = now
    wo.state = "done"
    wo.finished_at = now
    if wo.actual_duration_min <= 0 and wo.started_at:
        wo.actual_duration_min = (now - wo.started_at).total_seconds() / 60.0
    db.commit()
    db.refresh(wo)
    return wo


@router.post("/work-orders/{wo_id}/cancel", response_model=WorkOrderOut)
def cancel_work_order(wo_id: int, db: Session = Depends(get_db)):
    wo = db.get(WorkOrder, wo_id)
    if not wo:
        raise HTTPException(404, "Work order not found")
    if wo.state == "done":
        raise HTTPException(400, "Cannot cancel a completed work order")
    wo.state = "cancelled"
    db.commit()
    db.refresh(wo)
    return wo


# ============================================================================
# Quality checks
# ============================================================================

@router.post("/quality-checks", response_model=QualityCheckOut)
def create_quality_check(payload: QualityCheckIn, db: Session = Depends(get_db)):
    mo = db.get(ManufacturingOrder, payload.mo_id)
    if not mo:
        raise HTTPException(404, f"MO {payload.mo_id} not found")
    if payload.work_order_id is not None:
        wo = db.get(WorkOrder, payload.work_order_id)
        if not wo or wo.mo_id != mo.id:
            raise HTTPException(404, f"Work order {payload.work_order_id} not on this MO")
    if payload.kind not in {"pass_fail", "measure", "visual"}:
        raise HTTPException(400, "kind must be pass_fail | measure | visual")
    qc = QualityCheck(
        mo_id=mo.id,
        work_order_id=payload.work_order_id,
        name=payload.name,
        kind=payload.kind,
        notes=payload.notes,
    )
    db.add(qc)
    db.commit()
    db.refresh(qc)
    return qc


@router.put("/quality-checks/{qc_id}", response_model=QualityCheckOut)
def update_quality_check(qc_id: int, payload: QualityCheckUpdate, db: Session = Depends(get_db)):
    qc = db.get(QualityCheck, qc_id)
    if not qc:
        raise HTTPException(404, "Quality check not found")
    data = payload.model_dump(exclude_unset=True)
    if "result" in data and data["result"] not in {"", "pass", "fail"}:
        raise HTTPException(400, "result must be empty, 'pass', or 'fail'")
    for field, val in data.items():
        setattr(qc, field, val)
    if qc.result and qc.performed_at is None:
        qc.performed_at = datetime.utcnow()
    db.commit()
    db.refresh(qc)
    return qc


@router.delete("/quality-checks/{qc_id}")
def delete_quality_check(qc_id: int, db: Session = Depends(get_db)):
    qc = db.get(QualityCheck, qc_id)
    if not qc:
        raise HTTPException(404, "Quality check not found")
    db.delete(qc)
    db.commit()
    return {"ok": True}

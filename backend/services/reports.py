"""M6 — Reports service.

Centralised aggregations for the /api/reports/* endpoints so the same
math is reusable from the CSV export endpoints too. Everything is
computed live from existing tables (StockMove for valuation, Invoice +
Payment for AR, Opportunity for sales analytics, ManufacturingOrder
for throughput).
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime

from sqlalchemy.orm import Session

from ..models import (
    Client,
    Invoice,
    Item,
    ManufacturingOrder,
    Opportunity,
    SalesOrder,
)
from ..services import stock as stock_svc


# ---------------- Inventory valuation ----------------

def inventory_valuation(db: Session) -> dict:
    """On-hand × unit_cost across all internal locations.

    Unit cost comes from Item.default_rate (the catalogue rate) — until
    M5+ adds a real costing field, this is the best approximation. Skips
    items with zero on-hand to keep the report tight.
    """
    rows = []
    grand_total = 0.0
    items = db.query(Item).all()
    for item in items:
        on_hand = sum(
            q["qty"]
            for q in stock_svc.quants_for(db, item_id=item.id)
            if q["qty"] > 0
        )
        # Only count positive on-hand at internal locations (virtual
        # locations like supplier/customer have signed quants).
        from ..models import Location
        internal_ids = {
            l.id for l in db.query(Location).filter(Location.kind == "internal").all()
        }
        on_hand_internal = sum(
            q["qty"]
            for q in stock_svc.quants_for(db, item_id=item.id)
            if q["location_id"] in internal_ids
        )
        if on_hand_internal <= 0:
            continue
        unit_cost = float(item.default_rate or 0.0)
        total_value = on_hand_internal * unit_cost
        rows.append({
            "item_id": item.id,
            "item_code": item.code,
            "item_name": item.name,
            "on_hand": on_hand_internal,
            "unit_cost": unit_cost,
            "total_value": total_value,
        })
        grand_total += total_value

    rows.sort(key=lambda r: r["total_value"], reverse=True)
    return {"rows": rows, "total_value": grand_total, "currency": "ZAR"}


# ---------------- Aged receivables ----------------

_AR_BUCKETS = [
    ("current", 0, 0),
    ("1-30", 1, 30),
    ("31-60", 31, 60),
    ("61-90", 61, 90),
    ("90+", 91, 99999),
]


def _bucket_for_days(days: int) -> str:
    if days <= 0:
        return "current"
    for label, lo, hi in _AR_BUCKETS[1:]:
        if lo <= days <= hi:
            return label
    return "90+"


def aged_receivables(db: Session, today: date | None = None) -> dict:
    today = today or date.today()
    rows = []
    bucket_totals: dict[str, dict] = {
        label: {"label": label, "count": 0, "total": 0.0}
        for label, _, _ in _AR_BUCKETS
    }

    invoices = db.query(Invoice).filter(
        Invoice.state.in_(["sent", "draft"]),
    ).all()
    for inv in invoices:
        outstanding = float(inv.outstanding)
        if outstanding <= 0:
            continue
        if inv.due_date is None:
            days = 0
        else:
            days = (today - inv.due_date).days
        bucket = _bucket_for_days(days)

        so = db.get(SalesOrder, inv.sales_order_id)
        client_name = "—"
        if so:
            opp = db.get(Opportunity, so.opportunity_id)
            if opp and opp.client:
                client_name = opp.client.name

        rows.append({
            "invoice_id": inv.id,
            "invoice_ref": inv.ref,
            "sales_order_ref": so.ref if so else "",
            "client_name": client_name,
            "due_date": inv.due_date,
            "days_overdue": max(0, days),
            "total": float(inv.total),
            "paid": float(inv.paid_total),
            "outstanding": outstanding,
            "bucket": bucket,
        })
        bucket_totals[bucket]["count"] += 1
        bucket_totals[bucket]["total"] += outstanding

    rows.sort(key=lambda r: (-r["days_overdue"], -r["outstanding"]))
    return {
        "rows": rows,
        "buckets": [bucket_totals[label] for label, _, _ in _AR_BUCKETS],
        "grand_total": sum(b["total"] for b in bucket_totals.values()),
    }


# ---------------- Sales analytics ----------------

def sales_analytics(db: Session) -> dict:
    opps = db.query(Opportunity).all()
    by_stage: dict[str, dict] = defaultdict(lambda: {"stage": "", "count": 0, "value": 0.0})
    by_sp: dict[str, dict] = defaultdict(lambda: {"salesperson": "", "count": 0, "value": 0.0})
    monthly: dict[str, dict] = defaultdict(lambda: {"month": "", "count": 0, "value": 0.0})

    pipeline_value = 0.0
    won_value = 0.0
    won_count = 0
    lost_count = 0

    for opp in opps:
        amt = float(opp.amount or 0.0)
        stage = opp.stage or "new"
        sp = (opp.salesperson or "Unassigned").strip() or "Unassigned"

        by_stage[stage]["stage"] = stage
        by_stage[stage]["count"] += 1
        by_stage[stage]["value"] += amt
        by_sp[sp]["salesperson"] = sp
        by_sp[sp]["count"] += 1
        by_sp[sp]["value"] += amt

        created = opp.created_at or datetime.utcnow()
        key = created.strftime("%Y-%m")
        monthly[key]["month"] = key
        monthly[key]["count"] += 1
        monthly[key]["value"] += amt

        if stage in ("new", "qualified", "proposal"):
            pipeline_value += amt
        if stage == "won":
            won_value += amt
            won_count += 1
        if stage == "lost":
            lost_count += 1

    stage_order = {"new": 0, "qualified": 1, "proposal": 2, "won": 3, "lost": 4}
    stage_rows = sorted(by_stage.values(), key=lambda r: stage_order.get(r["stage"], 99))
    sp_rows = sorted(by_sp.values(), key=lambda r: r["value"], reverse=True)
    month_rows = sorted(monthly.values(), key=lambda r: r["month"])

    decisions = won_count + lost_count
    win_rate = (won_count / decisions * 100.0) if decisions else 0.0

    return {
        "by_stage": stage_rows,
        "by_salesperson": sp_rows,
        "monthly": month_rows,
        "pipeline_value": pipeline_value,
        "won_value": won_value,
        "win_rate": win_rate,
    }


# ---------------- Manufacturing throughput ----------------

def manufacturing_throughput(db: Session) -> dict:
    mos = db.query(ManufacturingOrder).all()
    monthly: dict[str, dict] = defaultdict(lambda: {"month": "", "mo_count": 0, "units_produced": 0.0})
    open_count = 0
    units_ytd = 0.0
    this_year = datetime.utcnow().year

    for mo in mos:
        if mo.state in ("draft", "confirmed", "in_progress"):
            open_count += 1
        finished = mo.finished_at
        if mo.state == "done" and finished:
            key = finished.strftime("%Y-%m")
            monthly[key]["month"] = key
            monthly[key]["mo_count"] += 1
            monthly[key]["units_produced"] += float(mo.qty_to_produce)
            if finished.year == this_year:
                units_ytd += float(mo.qty_to_produce)

    rows = sorted(monthly.values(), key=lambda r: r["month"])
    return {
        "monthly": rows,
        "open_mo_count": open_count,
        "units_ytd": units_ytd,
    }

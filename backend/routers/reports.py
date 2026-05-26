"""M6 — Reports router.

Exposes the four core ERP reports (inventory valuation, aged receivables,
sales analytics, manufacturing throughput) plus two CSV exports for the
accountant (invoices + payments).
"""

from __future__ import annotations

import csv
import io
from datetime import datetime

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Invoice, Payment, SalesOrder, Opportunity
from ..schemas import (
    AgedReceivablesOut,
    InventoryValuationOut,
    ManufacturingThroughputOut,
    SalesAnalyticsOut,
)
from ..services import reports as reports_svc


router = APIRouter(prefix="/api/reports", tags=["reports"])


@router.get("/inventory-valuation", response_model=InventoryValuationOut)
def inventory_valuation(db: Session = Depends(get_db)):
    return reports_svc.inventory_valuation(db)


@router.get("/aged-receivables", response_model=AgedReceivablesOut)
def aged_receivables(db: Session = Depends(get_db)):
    return reports_svc.aged_receivables(db)


@router.get("/sales-analytics", response_model=SalesAnalyticsOut)
def sales_analytics(db: Session = Depends(get_db)):
    return reports_svc.sales_analytics(db)


@router.get("/manufacturing-throughput", response_model=ManufacturingThroughputOut)
def manufacturing_throughput(db: Session = Depends(get_db)):
    return reports_svc.manufacturing_throughput(db)


# ---------------- CSV exports ----------------

def _csv_response(rows: list[list], headers: list[str], filename: str) -> StreamingResponse:
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(headers)
    writer.writerows(rows)
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/export/invoices.csv")
def export_invoices(db: Session = Depends(get_db)):
    invoices = db.query(Invoice).order_by(Invoice.created_at).all()
    rows: list[list] = []
    for inv in invoices:
        so = db.get(SalesOrder, inv.sales_order_id)
        opp = db.get(Opportunity, so.opportunity_id) if so else None
        client_name = opp.client.name if (opp and opp.client) else ""
        rows.append([
            inv.ref, inv.kind, inv.state, inv.currency,
            f"{inv.total:.2f}", f"{inv.paid_total:.2f}", f"{inv.outstanding:.2f}",
            inv.created_at.date().isoformat() if inv.created_at else "",
            inv.due_date.isoformat() if inv.due_date else "",
            inv.paid_at.isoformat() if inv.paid_at else "",
            so.ref if so else "",
            client_name,
            inv.notes.replace("\n", " ").replace("\r", " "),
        ])
    headers = [
        "ref", "kind", "state", "currency",
        "total", "paid_total", "outstanding",
        "created_date", "due_date", "paid_date",
        "sales_order_ref", "client", "notes",
    ]
    today = datetime.utcnow().strftime("%Y%m%d")
    return _csv_response(rows, headers, f"invoices-{today}.csv")


@router.get("/export/payments.csv")
def export_payments(db: Session = Depends(get_db)):
    payments = db.query(Payment).order_by(Payment.received_at).all()
    rows: list[list] = []
    for p in payments:
        inv = p.invoice
        so = db.get(SalesOrder, inv.sales_order_id) if inv else None
        opp = db.get(Opportunity, so.opportunity_id) if so else None
        client_name = opp.client.name if (opp and opp.client) else ""
        rows.append([
            p.received_at.date().isoformat() if p.received_at else "",
            f"{p.amount:.2f}",
            p.method,
            p.reference,
            inv.ref if inv else "",
            inv.currency if inv else "",
            so.ref if so else "",
            client_name,
            p.notes.replace("\n", " ").replace("\r", " "),
        ])
    headers = [
        "received_date", "amount", "method", "reference",
        "invoice_ref", "currency", "sales_order_ref", "client", "notes",
    ]
    today = datetime.utcnow().strftime("%Y%m%d")
    return _csv_response(rows, headers, f"payments-{today}.csv")

"""Opportunity templates — quick-start packages for common project types."""
from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import OpportunityTemplate
from ..schemas import OpportunityTemplateIn, OpportunityTemplateOut

router = APIRouter(prefix="/api/opportunity-templates", tags=["opportunity-templates"])


def _serialise(t: OpportunityTemplate) -> dict:
    try:
        lines = json.loads(t.default_lines_json or "[]")
    except (ValueError, TypeError):
        lines = []
    return {
        "id": t.id,
        "name": t.name,
        "description": t.description,
        "icon": t.icon,
        "industry": t.industry,
        "title_hint": t.title_hint,
        "default_delivery_weeks": t.default_delivery_weeks,
        "default_deposit_pct": t.default_deposit_pct,
        "default_lines": lines,
        "is_active": bool(t.is_active),
        "created_at": t.created_at,
    }


@router.get("", response_model=list[OpportunityTemplateOut])
def list_templates(db: Session = Depends(get_db)):
    rows = db.query(OpportunityTemplate).order_by(OpportunityTemplate.name).all()
    return [_serialise(t) for t in rows]


@router.get("/{template_id}", response_model=OpportunityTemplateOut)
def get_template(template_id: int, db: Session = Depends(get_db)):
    t = db.get(OpportunityTemplate, template_id)
    if not t:
        raise HTTPException(404, "Template not found")
    return _serialise(t)


@router.post("", response_model=OpportunityTemplateOut)
def create_template(payload: OpportunityTemplateIn, db: Session = Depends(get_db)):
    data = payload.model_dump()
    lines = data.pop("default_lines", [])
    t = OpportunityTemplate(
        default_lines_json=json.dumps(lines),
        is_active=1 if data.pop("is_active", True) else 0,
        **data,
    )
    db.add(t)
    db.commit()
    db.refresh(t)
    return _serialise(t)


@router.put("/{template_id}", response_model=OpportunityTemplateOut)
def update_template(template_id: int, payload: OpportunityTemplateIn, db: Session = Depends(get_db)):
    t = db.get(OpportunityTemplate, template_id)
    if not t:
        raise HTTPException(404, "Template not found")
    data = payload.model_dump()
    t.default_lines_json = json.dumps(data.pop("default_lines", []))
    t.is_active = 1 if data.pop("is_active", True) else 0
    for k, v in data.items():
        setattr(t, k, v)
    db.commit()
    db.refresh(t)
    return _serialise(t)


@router.delete("/{template_id}")
def delete_template(template_id: int, db: Session = Depends(get_db)):
    t = db.get(OpportunityTemplate, template_id)
    if not t:
        raise HTTPException(404, "Template not found")
    db.delete(t)
    db.commit()
    return {"ok": True}

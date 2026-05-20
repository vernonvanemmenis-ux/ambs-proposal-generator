import json
import shutil
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from ..db import LOGOS_DIR, get_db
from ..models import ProposalTemplate
from ..schemas import TemplateCreate, TemplateOut

router = APIRouter(prefix="/api/templates", tags=["templates"])

ALLOWED_LOGO_EXTS = {".png", ".jpg", ".jpeg", ".gif", ".bmp"}
MAX_LOGO_BYTES = 5 * 1024 * 1024  # 5 MB


def _to_out(t: ProposalTemplate) -> dict:
    try:
        sections = json.loads(t.sections_json or "[]")
    except (ValueError, TypeError):
        sections = []
    return {
        "id": t.id,
        "name": t.name,
        "description": t.description,
        "is_default": bool(t.is_default),
        "brand_company_name": t.brand_company_name,
        "brand_tagline": t.brand_tagline,
        "brand_address_line": t.brand_address_line,
        "brand_contact_line": t.brand_contact_line,
        "brand_primary_color": t.brand_primary_color,
        "brand_accent_color": t.brand_accent_color,
        "logo_filename": t.logo_filename,
        "sections": sections,
        "created_at": t.created_at,
    }


@router.get("", response_model=list[TemplateOut])
def list_templates(db: Session = Depends(get_db)):
    return [
        _to_out(t)
        for t in db.query(ProposalTemplate)
        .order_by(ProposalTemplate.is_default.desc(), ProposalTemplate.name)
        .all()
    ]


@router.get("/{template_id}", response_model=TemplateOut)
def get_template(template_id: int, db: Session = Depends(get_db)):
    t = db.get(ProposalTemplate, template_id)
    if not t:
        raise HTTPException(404, "Template not found")
    return _to_out(t)


@router.post("", response_model=TemplateOut)
def create_template(payload: TemplateCreate, db: Session = Depends(get_db)):
    t = ProposalTemplate(
        name=payload.name,
        description=payload.description,
        is_default=1 if payload.is_default else 0,
        brand_company_name=payload.brand_company_name,
        brand_tagline=payload.brand_tagline,
        brand_address_line=payload.brand_address_line,
        brand_contact_line=payload.brand_contact_line,
        brand_primary_color=payload.brand_primary_color,
        brand_accent_color=payload.brand_accent_color,
        logo_filename=payload.logo_filename,
        sections_json=json.dumps([s.model_dump() for s in payload.sections]),
    )
    if payload.is_default:
        db.query(ProposalTemplate).update({ProposalTemplate.is_default: 0})
    db.add(t)
    db.commit()
    db.refresh(t)
    return _to_out(t)


@router.put("/{template_id}", response_model=TemplateOut)
def update_template(template_id: int, payload: TemplateCreate, db: Session = Depends(get_db)):
    t = db.get(ProposalTemplate, template_id)
    if not t:
        raise HTTPException(404, "Template not found")
    if payload.is_default and not t.is_default:
        db.query(ProposalTemplate).update({ProposalTemplate.is_default: 0})
    t.name = payload.name
    t.description = payload.description
    t.is_default = 1 if payload.is_default else 0
    t.brand_company_name = payload.brand_company_name
    t.brand_tagline = payload.brand_tagline
    t.brand_address_line = payload.brand_address_line
    t.brand_contact_line = payload.brand_contact_line
    t.brand_primary_color = payload.brand_primary_color
    t.brand_accent_color = payload.brand_accent_color
    t.logo_filename = payload.logo_filename
    t.sections_json = json.dumps([s.model_dump() for s in payload.sections])
    db.commit()
    db.refresh(t)
    return _to_out(t)


@router.post("/{template_id}/duplicate", response_model=TemplateOut)
def duplicate_template(template_id: int, db: Session = Depends(get_db)):
    src = db.get(ProposalTemplate, template_id)
    if not src:
        raise HTTPException(404, "Template not found")
    # Copy logo file too so the clone has an independent logo
    cloned_logo = ""
    if src.logo_filename:
        original = LOGOS_DIR / src.logo_filename
        if original.exists():
            cloned_logo = f"tpl-{uuid.uuid4().hex}{original.suffix}"
            shutil.copy2(original, LOGOS_DIR / cloned_logo)
    clone = ProposalTemplate(
        name=f"{src.name} (Copy)",
        description=src.description,
        is_default=0,
        brand_company_name=src.brand_company_name,
        brand_tagline=src.brand_tagline,
        brand_address_line=src.brand_address_line,
        brand_contact_line=src.brand_contact_line,
        brand_primary_color=src.brand_primary_color,
        brand_accent_color=src.brand_accent_color,
        logo_filename=cloned_logo,
        sections_json=src.sections_json,
    )
    db.add(clone)
    db.commit()
    db.refresh(clone)
    return _to_out(clone)


@router.delete("/{template_id}")
def delete_template(template_id: int, db: Session = Depends(get_db)):
    t = db.get(ProposalTemplate, template_id)
    if not t:
        raise HTTPException(404, "Template not found")
    if t.is_default:
        remaining = db.query(ProposalTemplate).filter(ProposalTemplate.id != template_id).count()
        if remaining == 0:
            raise HTTPException(400, "Cannot delete the only template. Create another first.")
        other = db.query(ProposalTemplate).filter(ProposalTemplate.id != template_id).first()
        if other:
            other.is_default = 1
    # Clean up logo file
    if t.logo_filename:
        (LOGOS_DIR / t.logo_filename).unlink(missing_ok=True)
    db.delete(t)
    db.commit()
    return {"ok": True}


# --------------------------------------------------------- Logo upload
@router.post("/{template_id}/logo", response_model=TemplateOut)
async def upload_logo(
    template_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    t = db.get(ProposalTemplate, template_id)
    if not t:
        raise HTTPException(404, "Template not found")

    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in ALLOWED_LOGO_EXTS:
        raise HTTPException(400, f"Unsupported logo extension. Use one of: {sorted(ALLOWED_LOGO_EXTS)}")

    body = await file.read()
    if len(body) > MAX_LOGO_BYTES:
        raise HTTPException(413, f"Logo too large (max {MAX_LOGO_BYTES // (1024 * 1024)} MB).")

    # Remove previous logo if any
    if t.logo_filename:
        (LOGOS_DIR / t.logo_filename).unlink(missing_ok=True)

    new_name = f"tpl-{template_id}-{uuid.uuid4().hex}{suffix}"
    (LOGOS_DIR / new_name).write_bytes(body)
    t.logo_filename = new_name
    db.commit()
    db.refresh(t)
    return _to_out(t)


@router.post("/{template_id}/logo/clear", response_model=TemplateOut)
def clear_logo(template_id: int, db: Session = Depends(get_db)):
    t = db.get(ProposalTemplate, template_id)
    if not t:
        raise HTTPException(404, "Template not found")
    if t.logo_filename:
        (LOGOS_DIR / t.logo_filename).unlink(missing_ok=True)
        t.logo_filename = ""
        db.commit()
        db.refresh(t)
    return _to_out(t)

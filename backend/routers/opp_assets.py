"""Per-opportunity uploaded assets — drawings, photos, PDFs etc.

Rendered by the Appendix section of the generated proposal. Images are
embedded inline; other types are listed by filename.
"""
from __future__ import annotations

import re
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from ..db import OPP_ATTACHMENTS_DIR, get_db
from ..models import Opportunity, OpportunityAsset
from ..schemas import OpportunityAssetOut, OpportunityAssetUpdate

router = APIRouter(prefix="/api/opportunities", tags=["opportunity-assets"])

MAX_ASSET_BYTES = 25 * 1024 * 1024  # 25 MB per file
_SAFE_NAME_RE = re.compile(r"[^A-Za-z0-9._-]+")


def _safe_filename(name: str) -> str:
    return _SAFE_NAME_RE.sub("_", name).strip("._-") or "file"


def _require_opp(db: Session, opp_id: int) -> Opportunity:
    o = db.get(Opportunity, opp_id)
    if not o:
        raise HTTPException(404, "Opportunity not found")
    return o


def _require_asset(db: Session, opp_id: int, asset_id: int) -> OpportunityAsset:
    a = db.get(OpportunityAsset, asset_id)
    if not a or a.opportunity_id != opp_id:
        raise HTTPException(404, "Asset not found")
    return a


@router.get("/{opp_id}/assets", response_model=list[OpportunityAssetOut])
def list_assets(opp_id: int, db: Session = Depends(get_db)):
    _require_opp(db, opp_id)
    return (
        db.query(OpportunityAsset)
        .filter(OpportunityAsset.opportunity_id == opp_id)
        .order_by(OpportunityAsset.sequence, OpportunityAsset.uploaded_at)
        .all()
    )


@router.post("/{opp_id}/assets", response_model=OpportunityAssetOut)
async def upload_asset(
    opp_id: int,
    file: UploadFile = File(...),
    caption: str = Form(""),
    db: Session = Depends(get_db),
):
    _require_opp(db, opp_id)
    body = await file.read()
    if len(body) > MAX_ASSET_BYTES:
        raise HTTPException(413, f"File too large (max {MAX_ASSET_BYTES // (1024 * 1024)} MB).")

    folder = OPP_ATTACHMENTS_DIR / str(opp_id)
    folder.mkdir(parents=True, exist_ok=True)
    safe = _safe_filename(file.filename or "file")
    unique_name = f"{uuid.uuid4().hex[:8]}_{safe}"
    target = folder / unique_name
    target.write_bytes(body)

    # Next sequence index — append to end by default so the user controls order.
    next_seq = (
        db.query(OpportunityAsset)
        .filter(OpportunityAsset.opportunity_id == opp_id)
        .count()
    )

    a = OpportunityAsset(
        opportunity_id=opp_id,
        filename=file.filename or safe,
        content_type=file.content_type or "application/octet-stream",
        size_bytes=len(body),
        stored_path=str(target),
        caption=caption,
        sequence=next_seq,
    )
    db.add(a)
    db.commit()
    db.refresh(a)
    return a


@router.put("/{opp_id}/assets/{asset_id}", response_model=OpportunityAssetOut)
def update_asset(opp_id: int, asset_id: int, payload: OpportunityAssetUpdate, db: Session = Depends(get_db)):
    a = _require_asset(db, opp_id, asset_id)
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(a, k, v)
    db.commit()
    db.refresh(a)
    return a


@router.delete("/{opp_id}/assets/{asset_id}")
def delete_asset(opp_id: int, asset_id: int, db: Session = Depends(get_db)):
    a = _require_asset(db, opp_id, asset_id)
    try:
        Path(a.stored_path).unlink(missing_ok=True)
    except OSError:
        pass
    db.delete(a)
    db.commit()
    return {"ok": True}


@router.get("/{opp_id}/assets/{asset_id}/download")
def download_asset(opp_id: int, asset_id: int, db: Session = Depends(get_db)):
    a = _require_asset(db, opp_id, asset_id)
    p = Path(a.stored_path)
    if not p.exists():
        raise HTTPException(410, "File missing on disk")
    return FileResponse(p, media_type=a.content_type, filename=a.filename)

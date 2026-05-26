from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Salesperson
from ..schemas import SalespersonIn, SalespersonOut

router = APIRouter(prefix="/api/salespeople", tags=["salespeople"])


def _derive_initials(name: str) -> str:
    parts = [p for p in name.split() if p]
    if not parts:
        return ""
    if len(parts) == 1:
        return parts[0][:2].upper()
    return (parts[0][:1] + parts[-1][:1]).upper()


@router.get("", response_model=list[SalespersonOut])
def list_salespeople(
    include_inactive: bool = False,
    db: Session = Depends(get_db),
):
    q = db.query(Salesperson)
    if not include_inactive:
        q = q.filter(Salesperson.active == True)  # noqa: E712
    return q.order_by(Salesperson.name).all()


@router.post("", response_model=SalespersonOut)
def create_salesperson(payload: SalespersonIn, db: Session = Depends(get_db)):
    data = payload.model_dump()
    if not data["initials"]:
        data["initials"] = _derive_initials(data["name"])
    sp = Salesperson(**data)
    db.add(sp)
    db.commit()
    db.refresh(sp)
    return sp


@router.put("/{sp_id}", response_model=SalespersonOut)
def update_salesperson(sp_id: int, payload: SalespersonIn, db: Session = Depends(get_db)):
    sp = db.get(Salesperson, sp_id)
    if not sp:
        raise HTTPException(404, "Salesperson not found")
    data = payload.model_dump()
    if not data["initials"]:
        data["initials"] = _derive_initials(data["name"])
    for k, v in data.items():
        setattr(sp, k, v)
    db.commit()
    db.refresh(sp)
    return sp


@router.delete("/{sp_id}")
def delete_salesperson(sp_id: int, db: Session = Depends(get_db)):
    """Soft-delete: marks the salesperson inactive so historical
    opportunities still show their original owner's name."""
    sp = db.get(Salesperson, sp_id)
    if not sp:
        raise HTTPException(404, "Salesperson not found")
    sp.active = False
    db.commit()
    return {"ok": True, "soft_deleted": True}

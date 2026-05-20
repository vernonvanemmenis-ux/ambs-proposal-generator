from datetime import datetime
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from ..constants import PROPOSAL_STATUS_VALUES
from ..db import get_db, OUTPUT_DIR
from ..models import Opportunity, Proposal, Activity, ProposalTemplate
from ..schemas import ProposalOut, ProposalStatusUpdate
from ..proposal_generator import generate_proposal_docx, next_ref

router = APIRouter(prefix="/api/proposals", tags=["proposals"])


def _resolve_template(db: Session, template_id: int | None) -> ProposalTemplate:
    if template_id:
        t = db.get(ProposalTemplate, template_id)
        if not t:
            raise HTTPException(404, f"Template {template_id} not found")
        return t
    default = db.query(ProposalTemplate).filter(ProposalTemplate.is_default == 1).first()
    if default:
        return default
    any_template = db.query(ProposalTemplate).first()
    if any_template:
        return any_template
    raise HTTPException(500, "No proposal templates exist. Seed a template first.")


@router.get("", response_model=list[ProposalOut])
def list_proposals(db: Session = Depends(get_db)):
    return db.query(Proposal).order_by(Proposal.generated_at.desc()).all()


@router.post("/generate/{opp_id}", response_model=ProposalOut)
def generate(
    opp_id: int,
    template_id: int | None = Query(None),
    db: Session = Depends(get_db),
):
    opp = db.get(Opportunity, opp_id)
    if not opp:
        raise HTTPException(404, "Opportunity not found")

    template = _resolve_template(db, template_id)
    ref = next_ref(db)
    filename = f"{ref}_{opp.client.name.replace(' ', '_').replace('/', '-')}.docx"
    filepath = OUTPUT_DIR / filename
    generate_proposal_docx(opp, filepath, ref, template)

    p = Proposal(
        opportunity_id=opp.id,
        template_id=template.id,
        ref=ref,
        filename=str(filepath),
        channel="offline",
    )
    db.add(p)
    db.add(Activity(
        opportunity_id=opp.id,
        kind="log",
        author="System",
        body=f"Proposal {ref} generated from template '{template.name}'.",
    ))
    db.commit()
    db.refresh(p)
    return p


@router.patch("/{proposal_id}/status", response_model=ProposalOut)
def update_status(proposal_id: int, payload: ProposalStatusUpdate, db: Session = Depends(get_db)):
    """Advance the proposal through draft → sent → viewed → signed → paid.

    Manual today; a PandaDoc webhook can call this in the future to auto-advance.
    """
    if payload.status not in PROPOSAL_STATUS_VALUES:
        raise HTTPException(
            400,
            f"Invalid status '{payload.status}'. Must be one of {PROPOSAL_STATUS_VALUES}.",
        )
    p = db.get(Proposal, proposal_id)
    if not p:
        raise HTTPException(404, "Proposal not found")
    if p.status != payload.status:
        prev = p.status or "draft"
        p.status = payload.status
        p.status_updated_at = datetime.utcnow()
        db.add(Activity(
            opportunity_id=p.opportunity_id,
            kind="log",
            author="System",
            body=f"Proposal {p.ref}: status {prev} → {payload.status}.",
        ))
    db.commit()
    db.refresh(p)
    return p


@router.get("/{proposal_id}/download")
def download(proposal_id: int, db: Session = Depends(get_db)):
    p = db.get(Proposal, proposal_id)
    if not p:
        raise HTTPException(404, "Proposal not found")
    path = Path(p.filename)
    if not path.exists():
        raise HTTPException(410, "File missing on disk")
    return FileResponse(
        path,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        filename=path.name,
    )

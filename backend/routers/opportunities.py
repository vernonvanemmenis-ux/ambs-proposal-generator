from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..constants import DEFAULT_PROJECT_STAGES
from ..db import get_db
from ..models import Opportunity, OpportunityLine, Activity, Project, ProjectStage, Task
from ..schemas import (
    OpportunityCreate,
    OpportunityUpdate,
    OpportunityOut,
    OpportunityLineIn,
    OpportunityLineOut,
    ActivityCreate,
    ActivityOut,
)

router = APIRouter(prefix="/api/opportunities", tags=["opportunities"])


def _bootstrap_project_for_opportunity(db: Session, opp: Opportunity) -> Project:
    """Spin up a construction project once the opportunity is Won.

    Creates the 5 default stages and a single seed task in the first stage.
    Idempotent: if the opportunity already has a project, returns the existing one.
    """
    if opp.project:
        return opp.project
    proj = Project(
        name=opp.title,
        opportunity_id=opp.id,
        client_id=opp.client_id,
        status="active",
        notes="Auto-created on Won.",
    )
    db.add(proj)
    db.flush()
    stages: list[ProjectStage] = []
    for i, st in enumerate(DEFAULT_PROJECT_STAGES):
        s = ProjectStage(project_id=proj.id, name=st["name"], color=st["color"], sequence=i)
        db.add(s)
        stages.append(s)
    db.flush()
    if stages:
        db.add(Task(
            project_id=proj.id,
            stage_id=stages[0].id,
            title="Kickoff meeting",
            assignee="",
            notes="Confirm scope, deliverables, and key dates with the client.",
            sequence=0,
        ))
    db.add(Activity(
        opportunity_id=opp.id,
        kind="log",
        author="System",
        body=f"Project '{proj.name}' created from won opportunity.",
    ))
    return proj


@router.get("", response_model=list[OpportunityOut])
def list_opportunities(db: Session = Depends(get_db)):
    return db.query(Opportunity).order_by(Opportunity.created_at.desc()).all()


@router.get("/{opp_id}", response_model=OpportunityOut)
def get_opportunity(opp_id: int, db: Session = Depends(get_db)):
    o = db.get(Opportunity, opp_id)
    if not o:
        raise HTTPException(404, "Opportunity not found")
    return o


@router.post("", response_model=OpportunityOut)
def create_opportunity(payload: OpportunityCreate, db: Session = Depends(get_db)):
    data = payload.model_dump()
    lines = data.pop("lines", [])
    o = Opportunity(**data)
    db.add(o)
    db.flush()
    for i, ln in enumerate(lines):
        ln["sequence"] = ln.get("sequence", i)
        db.add(OpportunityLine(opportunity_id=o.id, **ln))
    db.commit()
    db.refresh(o)
    return o


@router.put("/{opp_id}", response_model=OpportunityOut)
def update_opportunity(opp_id: int, payload: OpportunityUpdate, db: Session = Depends(get_db)):
    o = db.get(Opportunity, opp_id)
    if not o:
        raise HTTPException(404, "Opportunity not found")
    prev_stage = o.stage
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(o, k, v)
    # Auto-create a construction project the first time this opportunity is Won.
    if o.stage == "won" and prev_stage != "won":
        _bootstrap_project_for_opportunity(db, o)
    db.commit()
    db.refresh(o)
    return o


@router.delete("/{opp_id}")
def delete_opportunity(opp_id: int, db: Session = Depends(get_db)):
    o = db.get(Opportunity, opp_id)
    if not o:
        raise HTTPException(404, "Opportunity not found")
    db.delete(o)
    db.commit()
    return {"ok": True}


# ---------------- Lines ----------------
@router.get("/{opp_id}/lines", response_model=list[OpportunityLineOut])
def list_lines(opp_id: int, db: Session = Depends(get_db)):
    o = db.get(Opportunity, opp_id)
    if not o:
        raise HTTPException(404, "Opportunity not found")
    return o.lines


@router.post("/{opp_id}/lines", response_model=OpportunityLineOut)
def add_line(opp_id: int, payload: OpportunityLineIn, db: Session = Depends(get_db)):
    o = db.get(Opportunity, opp_id)
    if not o:
        raise HTTPException(404, "Opportunity not found")
    data = payload.model_dump()
    if data.get("sequence", 0) == 0:
        data["sequence"] = len(o.lines)
    ln = OpportunityLine(opportunity_id=opp_id, **data)
    db.add(ln)
    db.commit()
    db.refresh(ln)
    return ln


@router.put("/{opp_id}/lines/{line_id}", response_model=OpportunityLineOut)
def update_line(opp_id: int, line_id: int, payload: OpportunityLineIn, db: Session = Depends(get_db)):
    ln = db.get(OpportunityLine, line_id)
    if not ln or ln.opportunity_id != opp_id:
        raise HTTPException(404, "Line not found")
    for k, v in payload.model_dump().items():
        setattr(ln, k, v)
    db.commit()
    db.refresh(ln)
    return ln


@router.delete("/{opp_id}/lines/{line_id}")
def delete_line(opp_id: int, line_id: int, db: Session = Depends(get_db)):
    ln = db.get(OpportunityLine, line_id)
    if not ln or ln.opportunity_id != opp_id:
        raise HTTPException(404, "Line not found")
    db.delete(ln)
    db.commit()
    return {"ok": True}


# ---------------- Activities ----------------
@router.get("/{opp_id}/activities", response_model=list[ActivityOut])
def list_activities(opp_id: int, db: Session = Depends(get_db)):
    return (
        db.query(Activity)
        .filter(Activity.opportunity_id == opp_id)
        .order_by(Activity.created_at.desc())
        .all()
    )


@router.post("/{opp_id}/activities", response_model=ActivityOut)
def add_activity(opp_id: int, payload: ActivityCreate, db: Session = Depends(get_db)):
    o = db.get(Opportunity, opp_id)
    if not o:
        raise HTTPException(404, "Opportunity not found")
    a = Activity(opportunity_id=opp_id, **payload.model_dump())
    db.add(a)
    db.commit()
    db.refresh(a)
    return a

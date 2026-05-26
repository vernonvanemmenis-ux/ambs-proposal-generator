import re
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from ..constants import DEFAULT_PROJECT_STAGES
from ..db import OPP_HEROES_DIR, get_db
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

ALLOWED_HERO_EXTS = {".png", ".jpg", ".jpeg"}
MAX_HERO_BYTES = 8 * 1024 * 1024
_SAFE_NAME_RE = re.compile(r"[^A-Za-z0-9._-]+")


def _safe_filename(name: str) -> str:
    return _SAFE_NAME_RE.sub("_", name).strip("._-") or "hero"

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
    # Best-effort cleanup of the opp's hero folder.
    if o.hero_filename:
        try:
            (OPP_HEROES_DIR / str(o.id) / o.hero_filename).unlink(missing_ok=True)
        except OSError:
            pass
    db.delete(o)
    db.commit()
    return {"ok": True}


# ---------------- Hero image ----------------
@router.post("/{opp_id}/hero", response_model=OpportunityOut)
async def upload_opp_hero(opp_id: int, file: UploadFile = File(...), db: Session = Depends(get_db)):
    o = db.get(Opportunity, opp_id)
    if not o:
        raise HTTPException(404, "Opportunity not found")
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in ALLOWED_HERO_EXTS:
        raise HTTPException(400, f"Unsupported hero extension. Use one of: {sorted(ALLOWED_HERO_EXTS)}")
    body = await file.read()
    if len(body) > MAX_HERO_BYTES:
        raise HTTPException(413, f"Hero too large (max {MAX_HERO_BYTES // (1024 * 1024)} MB).")
    folder = OPP_HEROES_DIR / str(opp_id)
    folder.mkdir(parents=True, exist_ok=True)
    # Remove previous hero file(s) in the folder to avoid orphans.
    if o.hero_filename:
        (folder / o.hero_filename).unlink(missing_ok=True)
    safe = _safe_filename(file.filename or "hero")
    new_name = f"{uuid.uuid4().hex[:8]}_{safe}"
    (folder / new_name).write_bytes(body)
    o.hero_filename = new_name
    db.commit()
    db.refresh(o)
    return o


@router.delete("/{opp_id}/hero", response_model=OpportunityOut)
def delete_opp_hero(opp_id: int, db: Session = Depends(get_db)):
    o = db.get(Opportunity, opp_id)
    if not o:
        raise HTTPException(404, "Opportunity not found")
    if o.hero_filename:
        (OPP_HEROES_DIR / str(opp_id) / o.hero_filename).unlink(missing_ok=True)
        o.hero_filename = ""
        db.commit()
        db.refresh(o)
    return o


@router.get("/{opp_id}/hero")
def get_opp_hero(opp_id: int, db: Session = Depends(get_db)):
    o = db.get(Opportunity, opp_id)
    if not o or not o.hero_filename:
        raise HTTPException(404, "No hero for this opportunity")
    p = OPP_HEROES_DIR / str(opp_id) / o.hero_filename
    if not p.exists():
        raise HTTPException(410, "Hero missing on disk")
    return FileResponse(p)


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

"""Projects / Tasks / Attachments — post-Won construction lifecycle.

Created automatically when an Opportunity is Won (see opportunities.py), but also
manually creatable. Each project has its own stages (so users can rename/add/remove
per project) and a flat task list that the frontend groups by stage_id for kanban
rendering and drag-and-drop.
"""
from __future__ import annotations

import re
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from ..constants import DEFAULT_PROJECT_STAGES
from ..db import DATA_ROOT, get_db
from ..models import Activity, Attachment, Project, ProjectStage, Task
from ..schemas import (
    ActivityCreate,
    ActivityOut,
    ProjectCreate,
    ProjectOut,
    ProjectStageCreate,
    ProjectStageOut,
    ProjectStageUpdate,
    ProjectUpdate,
    TaskCreate,
    TaskMove,
    TaskOut,
    TaskUpdate,
)

router = APIRouter(prefix="/api/projects", tags=["projects"])

ATTACHMENTS_DIR = DATA_ROOT / "attachments"
ATTACHMENTS_DIR.mkdir(parents=True, exist_ok=True)

MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024  # 25 MB per file
_SAFE_NAME_RE = re.compile(r"[^A-Za-z0-9._-]+")


def _safe_filename(name: str) -> str:
    return _SAFE_NAME_RE.sub("_", name).strip("._-") or "file"


def _require_project(db: Session, project_id: int) -> Project:
    p = db.get(Project, project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    return p


def _require_task(db: Session, project_id: int, task_id: int) -> Task:
    t = db.get(Task, task_id)
    if not t or t.project_id != project_id:
        raise HTTPException(404, "Task not found")
    return t


# --------------------------------------------------------- projects
@router.get("", response_model=list[ProjectOut])
def list_projects(status: str | None = None, db: Session = Depends(get_db)):
    q = db.query(Project)
    if status:
        q = q.filter(Project.status == status)
    return q.order_by(Project.created_at.desc()).all()


@router.get("/{project_id}", response_model=ProjectOut)
def get_project(project_id: int, db: Session = Depends(get_db)):
    return _require_project(db, project_id)


@router.post("", response_model=ProjectOut)
def create_project(payload: ProjectCreate, db: Session = Depends(get_db)):
    proj = Project(**payload.model_dump(), status="active")
    db.add(proj)
    db.flush()
    for i, st in enumerate(DEFAULT_PROJECT_STAGES):
        db.add(ProjectStage(project_id=proj.id, name=st["name"], color=st["color"], sequence=i))
    db.commit()
    db.refresh(proj)
    return proj


@router.patch("/{project_id}", response_model=ProjectOut)
def update_project(project_id: int, payload: ProjectUpdate, db: Session = Depends(get_db)):
    proj = _require_project(db, project_id)
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(proj, k, v)
    db.commit()
    db.refresh(proj)
    return proj


@router.delete("/{project_id}")
def delete_project(project_id: int, db: Session = Depends(get_db)):
    proj = _require_project(db, project_id)
    db.delete(proj)
    db.commit()
    return {"ok": True}


# --------------------------------------------------------- stages
@router.get("/{project_id}/stages", response_model=list[ProjectStageOut])
def list_stages(project_id: int, db: Session = Depends(get_db)):
    _require_project(db, project_id)
    return (
        db.query(ProjectStage)
        .filter(ProjectStage.project_id == project_id)
        .order_by(ProjectStage.sequence)
        .all()
    )


@router.post("/{project_id}/stages", response_model=ProjectStageOut)
def create_stage(project_id: int, payload: ProjectStageCreate, db: Session = Depends(get_db)):
    _require_project(db, project_id)
    data = payload.model_dump()
    if data.get("sequence") is None:
        max_seq = (
            db.query(ProjectStage)
            .filter(ProjectStage.project_id == project_id)
            .count()
        )
        data["sequence"] = max_seq
    stage = ProjectStage(project_id=project_id, **data)
    db.add(stage)
    db.commit()
    db.refresh(stage)
    return stage


@router.patch("/{project_id}/stages/{stage_id}", response_model=ProjectStageOut)
def update_stage(project_id: int, stage_id: int, payload: ProjectStageUpdate, db: Session = Depends(get_db)):
    stage = db.get(ProjectStage, stage_id)
    if not stage or stage.project_id != project_id:
        raise HTTPException(404, "Stage not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(stage, k, v)
    db.commit()
    db.refresh(stage)
    return stage


@router.delete("/{project_id}/stages/{stage_id}")
def delete_stage(project_id: int, stage_id: int, db: Session = Depends(get_db)):
    stage = db.get(ProjectStage, stage_id)
    if not stage or stage.project_id != project_id:
        raise HTTPException(404, "Stage not found")
    has_tasks = db.query(Task).filter(Task.stage_id == stage_id).count() > 0
    if has_tasks:
        raise HTTPException(400, "Cannot delete a stage that still has tasks. Move them first.")
    db.delete(stage)
    db.commit()
    return {"ok": True}


# --------------------------------------------------------- tasks
@router.get("/{project_id}/tasks", response_model=list[TaskOut])
def list_tasks(project_id: int, db: Session = Depends(get_db)):
    _require_project(db, project_id)
    return (
        db.query(Task)
        .filter(Task.project_id == project_id)
        .order_by(Task.stage_id, Task.sequence)
        .all()
    )


@router.post("/{project_id}/tasks", response_model=TaskOut)
def create_task(project_id: int, payload: TaskCreate, db: Session = Depends(get_db)):
    _require_project(db, project_id)
    data = payload.model_dump()
    stage_id = data.pop("stage_id", None)
    if stage_id is None:
        first_stage = (
            db.query(ProjectStage)
            .filter(ProjectStage.project_id == project_id)
            .order_by(ProjectStage.sequence)
            .first()
        )
        if not first_stage:
            raise HTTPException(400, "Project has no stages — create one first.")
        stage_id = first_stage.id
    seq = (
        db.query(Task)
        .filter(Task.project_id == project_id, Task.stage_id == stage_id)
        .count()
    )
    task = Task(project_id=project_id, stage_id=stage_id, sequence=seq, **data)
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


@router.patch("/{project_id}/tasks/{task_id}", response_model=TaskOut)
def update_task(project_id: int, task_id: int, payload: TaskUpdate, db: Session = Depends(get_db)):
    task = _require_task(db, project_id, task_id)
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(task, k, v)
    db.commit()
    db.refresh(task)
    return task


@router.patch("/{project_id}/tasks/{task_id}/move", response_model=TaskOut)
def move_task(project_id: int, task_id: int, payload: TaskMove, db: Session = Depends(get_db)):
    """Atomic DnD operation: drop a task into a stage at a given sequence index.
    Re-numbers neighbouring tasks in the destination stage to keep sequences dense.
    """
    task = _require_task(db, project_id, task_id)
    target_stage = db.get(ProjectStage, payload.stage_id)
    if not target_stage or target_stage.project_id != project_id:
        raise HTTPException(404, "Target stage not found")

    old_stage_id = task.stage_id
    task.stage_id = payload.stage_id

    siblings = (
        db.query(Task)
        .filter(Task.project_id == project_id, Task.stage_id == payload.stage_id, Task.id != task.id)
        .order_by(Task.sequence)
        .all()
    )
    insert_at = max(0, min(payload.sequence, len(siblings)))
    siblings.insert(insert_at, task)
    for i, t in enumerate(siblings):
        t.sequence = i

    if old_stage_id != payload.stage_id:
        source = (
            db.query(Task)
            .filter(Task.project_id == project_id, Task.stage_id == old_stage_id)
            .order_by(Task.sequence)
            .all()
        )
        for i, t in enumerate(source):
            t.sequence = i

    db.add(Activity(
        task_id=task.id,
        kind="log",
        author="System",
        body=f"Moved to '{target_stage.name}'.",
    ))
    db.commit()
    db.refresh(task)
    return task


@router.delete("/{project_id}/tasks/{task_id}")
def delete_task(project_id: int, task_id: int, db: Session = Depends(get_db)):
    task = _require_task(db, project_id, task_id)
    db.delete(task)
    db.commit()
    return {"ok": True}


# --------------------------------------------------------- task activities
@router.get("/{project_id}/tasks/{task_id}/activities", response_model=list[ActivityOut])
def list_task_activities(project_id: int, task_id: int, db: Session = Depends(get_db)):
    _require_task(db, project_id, task_id)
    return (
        db.query(Activity)
        .filter(Activity.task_id == task_id)
        .order_by(Activity.created_at.desc())
        .all()
    )


@router.post("/{project_id}/tasks/{task_id}/activities", response_model=ActivityOut)
def add_task_activity(project_id: int, task_id: int, payload: ActivityCreate, db: Session = Depends(get_db)):
    _require_task(db, project_id, task_id)
    a = Activity(task_id=task_id, **payload.model_dump())
    db.add(a)
    db.commit()
    db.refresh(a)
    return a


# --------------------------------------------------------- task attachments
@router.post("/{project_id}/tasks/{task_id}/attachments")
async def upload_attachment(
    project_id: int,
    task_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    task = _require_task(db, project_id, task_id)
    data = await file.read()
    if len(data) > MAX_ATTACHMENT_BYTES:
        raise HTTPException(413, "File exceeds 25 MB limit.")

    folder = ATTACHMENTS_DIR / str(project_id)
    folder.mkdir(parents=True, exist_ok=True)
    safe = _safe_filename(file.filename or "file")
    unique_name = f"{uuid.uuid4().hex[:8]}_{safe}"
    target = folder / unique_name
    target.write_bytes(data)

    att = Attachment(
        task_id=task.id,
        filename=file.filename or safe,
        content_type=file.content_type or "application/octet-stream",
        size_bytes=len(data),
        stored_path=str(target),
    )
    db.add(att)
    db.add(Activity(
        task_id=task.id, kind="log", author="System",
        body=f"Attached file: {att.filename} ({len(data)//1024} KB)",
    ))
    db.commit()
    db.refresh(att)
    return {
        "id": att.id,
        "filename": att.filename,
        "content_type": att.content_type,
        "size_bytes": att.size_bytes,
        "uploaded_at": att.uploaded_at.isoformat(),
    }


@router.get("/{project_id}/tasks/{task_id}/attachments/{att_id}/download")
def download_attachment(project_id: int, task_id: int, att_id: int, db: Session = Depends(get_db)):
    _require_task(db, project_id, task_id)
    att = db.get(Attachment, att_id)
    if not att or att.task_id != task_id:
        raise HTTPException(404, "Attachment not found")
    p = Path(att.stored_path)
    if not p.exists():
        raise HTTPException(410, "File missing on disk")
    return FileResponse(p, media_type=att.content_type, filename=att.filename)


@router.delete("/{project_id}/tasks/{task_id}/attachments/{att_id}")
def delete_attachment(project_id: int, task_id: int, att_id: int, db: Session = Depends(get_db)):
    _require_task(db, project_id, task_id)
    att = db.get(Attachment, att_id)
    if not att or att.task_id != task_id:
        raise HTTPException(404, "Attachment not found")
    try:
        Path(att.stored_path).unlink(missing_ok=True)
    except OSError:
        pass
    db.delete(att)
    db.commit()
    return {"ok": True}

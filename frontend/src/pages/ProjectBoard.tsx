import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, type Project, type ProjectStage, type Task } from "../api";
import KanbanBoard, { type KanbanColumn } from "../components/KanbanBoard";
import Chatter from "../components/Chatter";
import AttachmentList from "../components/AttachmentList";

type TaskCard = Task & { columnId: number };

export default function ProjectBoard() {
  const { id } = useParams();
  const projectId = Number(id);
  const [project, setProject] = useState<Project | null>(null);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [creating, setCreating] = useState<{ stageId: number } | null>(null);

  const load = () => {
    api.projects.get(projectId).then(setProject).catch(() => {});
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [projectId]);

  const columns = useMemo<KanbanColumn[]>(() => {
    if (!project) return [];
    return project.stages.map((s) => {
      const inCol = project.tasks.filter((t) => t.stage_id === s.id);
      return { id: s.id, label: s.name, color: s.color, meta: `${inCol.length} task${inCol.length === 1 ? "" : "s"}` };
    });
  }, [project]);

  const items = useMemo<TaskCard[]>(() => {
    if (!project) return [];
    return project.tasks.map((t) => ({ ...t, columnId: t.stage_id }));
  }, [project]);

  const move = async (t: TaskCard, newStageId: string | number) => {
    if (!project) return;
    const stageId = Number(newStageId);
    if (t.stage_id === stageId) return;
    setProject((p) =>
      p ? { ...p, tasks: p.tasks.map((x) => (x.id === t.id ? { ...x, stage_id: stageId } : x)) } : p
    );
    try {
      await api.projects.tasks.move(projectId, t.id, stageId, 0);
      load();
    } catch (e: any) {
      alert("Move failed: " + (e?.message || e));
      load();
    }
  };

  if (!project) {
    return <div className="p-8 text-slate-500">Loading…</div>;
  }

  return (
    <div className="min-h-[calc(100vh-44px)]">
      <div className="bg-white border-b border-ui-border px-4 py-2 flex items-center gap-3">
        <Link to="/" className="text-[12px] text-slate-500 hover:text-sai-navy">Apps</Link>
        <div className="text-slate-300">/</div>
        <Link to="/projects" className="text-[12px] text-slate-500 hover:text-sai-navy">Projects</Link>
        <div className="text-slate-300">/</div>
        <div className="text-[13px] font-semibold text-sai-navy font-display truncate">{project.name}</div>
        <div className="flex-1" />
        {project.opportunity_id && (
          <Link
            to={`/proposals/${project.opportunity_id}`}
            className="text-[11px] border border-ui-border text-slate-600 px-3 py-1.5 rounded font-semibold hover:bg-slate-50"
          >
            ← Source opportunity
          </Link>
        )}
        <button
          onClick={() => {
            const firstStage = project.stages[0];
            if (firstStage) setCreating({ stageId: firstStage.id });
          }}
          className="text-[11px] bg-sai-blue text-white px-3 py-1.5 rounded font-semibold hover:opacity-90"
        >
          + New Task
        </button>
      </div>

      <div className="px-4 pt-2 text-[10px] text-slate-400 italic">
        Tip: drag a task between columns to move it through construction stages. Click a card to open task details, post messages, and attach files.
      </div>

      <KanbanBoard<TaskCard>
        columns={columns}
        items={items}
        renderCard={(t) => <TaskCardBody task={t} />}
        onMove={move}
        onCardClick={(t) => setActiveTask(t)}
        emptyHint="No tasks here yet"
      />

      {activeTask && (
        <TaskDrawer
          projectId={projectId}
          task={activeTask}
          stages={project.stages}
          onClose={() => setActiveTask(null)}
          onUpdated={() => {
            api.projects.get(projectId).then((p) => {
              const fresh = p.tasks.find((x) => x.id === activeTask.id);
              setActiveTask(fresh ?? null);
              setProject(p);
            });
          }}
        />
      )}

      {creating && (
        <NewTaskModal
          projectId={projectId}
          stageId={creating.stageId}
          stages={project.stages}
          onClose={() => setCreating(null)}
          onCreated={() => { setCreating(null); load(); }}
        />
      )}
    </div>
  );
}

function TaskCardBody({ task }: { task: Task }) {
  const overdue = isOverdue(task.target_date);
  return (
    <div className="kanban-card relative">
      <div className="text-[13px] font-semibold text-sai-navy leading-tight">{task.title}</div>
      {task.assignee && (
        <div className="text-[11px] text-slate-500 mt-0.5">{task.assignee}</div>
      )}
      <div className="mt-2 flex items-center gap-1 flex-wrap">
        {task.target_date && (
          <span
            className={`text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded font-semibold ${
              overdue ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-600"
            }`}
          >
            {overdue ? "Overdue " : ""}
            {new Date(task.target_date).toLocaleDateString()}
          </span>
        )}
        {task.attachments?.length > 0 && (
          <span
            className="text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 font-semibold"
            title={`${task.attachments.length} attachment(s)`}
          >
            📎 {task.attachments.length}
          </span>
        )}
      </div>
    </div>
  );
}

function isOverdue(d: string | null): boolean {
  if (!d) return false;
  const target = new Date(d);
  if (Number.isNaN(target.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return target < today;
}

function TaskDrawer({
  projectId,
  task,
  stages,
  onClose,
  onUpdated,
}: {
  projectId: number;
  task: Task;
  stages: ProjectStage[];
  onClose: () => void;
  onUpdated: () => void;
}) {
  const [draft, setDraft] = useState({
    title: task.title,
    assignee: task.assignee,
    target_date: task.target_date,
    notes: task.notes,
    stage_id: task.stage_id,
  });
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setDraft({
      title: task.title,
      assignee: task.assignee,
      target_date: task.target_date,
      notes: task.notes,
      stage_id: task.stage_id,
    });
    setDirty(false);
  }, [task.id, task.stage_id, task.title, task.notes, task.assignee, task.target_date]);

  const update = <K extends keyof typeof draft>(k: K, v: (typeof draft)[K]) => {
    setDraft((d) => ({ ...d, [k]: v }));
    setDirty(true);
  };

  const save = async () => {
    setBusy(true);
    try {
      await api.projects.tasks.update(projectId, task.id, draft as Partial<Task>);
      setDirty(false);
      onUpdated();
    } catch (e: any) {
      alert("Save failed: " + (e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!confirm(`Delete task "${task.title}"?`)) return;
    await api.projects.tasks.delete(projectId, task.id);
    onClose();
    onUpdated();
  };

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex justify-end" onClick={onClose}>
      <div
        className="bg-white w-[640px] h-full shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-3 border-b border-ui-border flex items-center">
          <div className="text-[14px] font-display font-bold text-sai-navy">Task details</div>
          <div className="flex-1" />
          <button
            onClick={save}
            disabled={!dirty || busy}
            className="text-[11px] bg-sai-blue text-white px-3 py-1.5 rounded font-semibold disabled:opacity-40 hover:opacity-90 mr-2"
          >
            {busy ? "Saving…" : dirty ? "Save" : "Saved"}
          </button>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-lg leading-none px-1">×</button>
        </div>

        <div className="flex-1 overflow-y-auto scroll-thin px-5 py-4 space-y-4">
          <div>
            <div className="field-label">Title</div>
            <input
              className="field-value text-[15px] font-semibold"
              value={draft.title}
              onChange={(e) => update("title", e.target.value)}
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <div className="field-label">Stage</div>
              <select
                className="field-value"
                value={draft.stage_id}
                onChange={(e) => update("stage_id", Number(e.target.value))}
              >
                {stages.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <div className="field-label">Assignee</div>
              <input
                className="field-value"
                value={draft.assignee}
                onChange={(e) => update("assignee", e.target.value)}
              />
            </div>
            <div>
              <div className="field-label">Target date</div>
              <input
                type="date"
                className="field-value"
                value={draft.target_date ?? ""}
                onChange={(e) => update("target_date", e.target.value || null)}
              />
            </div>
          </div>

          <div>
            <div className="field-label">Notes</div>
            <textarea
              className="field-value min-h-[80px] resize-y"
              value={draft.notes}
              onChange={(e) => update("notes", e.target.value)}
            />
          </div>

          <AttachmentList
            projectId={projectId}
            taskId={task.id}
            attachments={task.attachments ?? []}
            onChanged={onUpdated}
          />

          <Chatter
            refreshKey={task.id}
            listActivities={() => api.projects.tasks.activities(projectId, task.id)}
            postActivity={(b) => api.projects.tasks.addActivity(projectId, task.id, b)}
          />
        </div>

        <div className="px-5 py-3 border-t border-ui-border flex justify-between">
          <button
            onClick={remove}
            className="text-[11px] text-red-500 hover:text-red-700 font-semibold"
          >
            Delete task
          </button>
          <div className="text-[10px] text-slate-400 self-center">
            Created {new Date(task.created_at).toLocaleString()}
          </div>
        </div>
      </div>
    </div>
  );
}

function NewTaskModal({
  projectId,
  stageId,
  stages,
  onClose,
  onCreated,
}: {
  projectId: number;
  stageId: number;
  stages: ProjectStage[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [draft, setDraft] = useState({
    title: "",
    stage_id: stageId,
    assignee: "",
    target_date: "" as string | null,
    notes: "",
  });
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!draft.title.trim()) return;
    setBusy(true);
    try {
      await api.projects.tasks.create(projectId, {
        title: draft.title,
        stage_id: draft.stage_id,
        assignee: draft.assignee,
        target_date: draft.target_date || null,
        notes: draft.notes,
      });
      onCreated();
    } catch (e: any) {
      alert("Create failed: " + (e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex justify-center items-start pt-20" onClick={onClose}>
      <div
        className="bg-white w-[520px] rounded-md shadow-2xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-[14px] font-display font-bold text-sai-navy mb-3">New Task</div>
        <div className="space-y-3">
          <div>
            <div className="field-label">Title</div>
            <input
              className="field-value"
              autoFocus
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              placeholder="e.g. Confirm foundation drawings"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="field-label">Stage</div>
              <select
                className="field-value"
                value={draft.stage_id}
                onChange={(e) => setDraft({ ...draft, stage_id: Number(e.target.value) })}
              >
                {stages.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <div className="field-label">Assignee</div>
              <input
                className="field-value"
                value={draft.assignee}
                onChange={(e) => setDraft({ ...draft, assignee: e.target.value })}
              />
            </div>
          </div>
          <div>
            <div className="field-label">Target date</div>
            <input
              type="date"
              className="field-value"
              value={draft.target_date ?? ""}
              onChange={(e) => setDraft({ ...draft, target_date: e.target.value || null })}
            />
          </div>
          <div>
            <div className="field-label">Notes</div>
            <textarea
              className="field-value min-h-[60px] resize-y"
              value={draft.notes}
              onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
            />
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="text-[12px] text-slate-500 hover:text-slate-800 px-3 py-1.5">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!draft.title.trim() || busy}
            className="text-[12px] bg-sai-blue text-white px-4 py-1.5 rounded font-semibold hover:opacity-90 disabled:opacity-40"
          >
            {busy ? "Creating…" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}

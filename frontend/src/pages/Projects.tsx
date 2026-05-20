import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type Project } from "../api";

export default function Projects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [busy, setBusy] = useState(false);

  const reload = () => {
    setBusy(true);
    api.projects
      .list()
      .then(setProjects)
      .catch(() => {})
      .finally(() => setBusy(false));
  };
  useEffect(reload, []);

  const createBlank = async () => {
    const name = prompt("Project name?");
    if (!name) return;
    try {
      const p = await api.projects.create({ name });
      setProjects((xs) => [p, ...xs]);
    } catch (e: any) {
      alert("Could not create: " + (e?.message || e));
    }
  };

  const archive = async (p: Project) => {
    if (!confirm(`Archive project "${p.name}"?`)) return;
    await api.projects.update(p.id, { status: "archived" });
    reload();
  };
  const unarchive = async (p: Project) => {
    await api.projects.update(p.id, { status: "active" });
    reload();
  };

  const active = projects.filter((p) => p.status === "active");
  const archived = projects.filter((p) => p.status === "archived");

  return (
    <div className="min-h-[calc(100vh-44px)]">
      <div className="bg-white border-b border-ui-border px-4 py-2 flex items-center gap-3">
        <Link to="/" className="text-[12px] text-slate-500 hover:text-sai-navy">← Apps</Link>
        <div className="text-slate-300">/</div>
        <div className="text-[13px] font-semibold text-sai-navy font-display">Projects</div>
        <div className="flex-1" />
        <button
          onClick={createBlank}
          className="text-[11px] bg-sai-blue text-white px-3 py-1.5 rounded font-semibold hover:opacity-90"
        >
          + New Project
        </button>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">
        <Section title="Active" projects={active} onArchive={archive} archived={false} />
        {archived.length > 0 && (
          <Section title="Archived" projects={archived} onArchive={unarchive} archived={true} />
        )}
        {projects.length === 0 && !busy && (
          <div className="bg-white border border-ui-border rounded-md p-10 text-center">
            <div className="text-[15px] font-display font-bold text-sai-navy">No projects yet</div>
            <div className="text-[12px] text-slate-500 mt-1">
              Drag an opportunity to <span className="font-semibold text-emerald-600">Won</span> in the pipeline
              and a construction project will be created automatically. Or click <span className="font-semibold">+ New Project</span> to start one by hand.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Section({
  title,
  projects,
  onArchive,
  archived,
}: {
  title: string;
  projects: Project[];
  onArchive: (p: Project) => void;
  archived: boolean;
}) {
  if (projects.length === 0) return null;
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider font-semibold text-slate-500 mb-2">
        {title}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        {projects.map((p) => {
          const taskCount = p.tasks?.length ?? 0;
          const stages = p.stages ?? [];
          return (
            <div
              key={p.id}
              className={`bg-white border border-ui-border rounded-md p-4 shadow-card hover:shadow-kanban transition ${
                archived ? "opacity-70" : ""
              }`}
            >
              <Link to={`/projects/${p.id}`} className="block">
                <div className="text-[14px] font-display font-bold text-sai-navy leading-tight">
                  {p.name}
                </div>
                {p.client && (
                  <div className="text-[11px] text-slate-500 mt-0.5">{p.client.name}</div>
                )}
                <div className="text-[11px] text-slate-400 mt-1">
                  {stages.length} stage{stages.length === 1 ? "" : "s"} · {taskCount} task{taskCount === 1 ? "" : "s"}
                </div>
                <div className="mt-3 flex items-center gap-1 flex-wrap">
                  {stages.slice(0, 5).map((s) => (
                    <span
                      key={s.id}
                      className="text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded text-white font-semibold"
                      style={{ background: s.color }}
                    >
                      {s.name}
                    </span>
                  ))}
                </div>
              </Link>
              <div className="mt-3 pt-3 border-t border-ui-border flex justify-end gap-2">
                <button
                  onClick={() => onArchive(p)}
                  className="text-[10px] text-slate-500 hover:text-slate-800"
                >
                  {archived ? "Restore" : "Archive"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, type WorkCenter } from "../api";
import PageRenderer from "../components/PageRenderer";
import RightDrawer, { DrawerCloseButton } from "../components/RightDrawer";
import { workCentersRegistry, type WorkCentersCtx } from "../blocks/work_centers";


export default function WorkCenters() {
  const [wcs, setWcs] = useState<WorkCenter[]>([]);
  const [editing, setEditing] = useState<Partial<WorkCenter> | null>(null);

  const load = () => { api.manufacturing.workCenters.list(true).then(setWcs).catch(() => {}); };
  useEffect(load, []);

  const ctx: WorkCentersCtx = useMemo(
    () => ({
      workCenters: wcs,
      onEdit: (w) => setEditing(w ? { ...w } : { name: "", code: "", capacity_units_per_hour: 1, cost_per_hour: 0, active: true, notes: "" }),
    }),
    [wcs],
  );

  return (
    <div className="min-h-[calc(100vh-44px)]">
      <div className="bg-white border-b border-ui-border px-4 py-2 flex items-center gap-3">
        <Link to="/" className="text-[12px] text-slate-500 hover:text-sai-navy">← Apps</Link>
        <div className="text-slate-300">/</div>
        <Link to="/manufacturing-orders" className="text-[12px] text-slate-500 hover:text-sai-navy">Manufacturing</Link>
        <div className="text-slate-300">/</div>
        <div className="text-[13px] font-semibold text-sai-navy font-display">Work Centers</div>
        <div className="flex-1" />
        <button onClick={() => ctx.onEdit(null)}
          className="text-[11px] bg-sai-blue text-white px-3 py-1.5 rounded font-semibold hover:opacity-90">
          + New work center
        </button>
      </div>
      <PageRenderer<WorkCentersCtx>
        pageKey="work_centers"
        registry={workCentersRegistry}
        ctx={ctx}
      />
      {editing && <WCDrawer draft={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </div>
  );
}


function WCDrawer({ draft, onClose, onSaved }: { draft: Partial<WorkCenter>; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(draft.name ?? "");
  const [code, setCode] = useState(draft.code ?? "");
  const [capacity, setCapacity] = useState(Number(draft.capacity_units_per_hour ?? 1));
  const [cost, setCost] = useState(Number(draft.cost_per_hour ?? 0));
  const [active, setActive] = useState(draft.active ?? true);
  const [notes, setNotes] = useState(draft.notes ?? "");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const body = { name, code, capacity_units_per_hour: capacity, cost_per_hour: cost, active, notes };
      if (draft.id) await api.manufacturing.workCenters.update(draft.id, body);
      else await api.manufacturing.workCenters.create(body);
      onSaved();
    } catch (e: any) { alert("Save failed: " + (e?.message || e)); }
    finally { setBusy(false); }
  };

  const remove = async () => {
    if (!draft.id) return;
    if (!confirm("Mark this work center inactive?")) return;
    setBusy(true);
    try { await api.manufacturing.workCenters.delete(draft.id); onSaved(); }
    catch (e: any) { alert("Delete failed: " + (e?.message || e)); }
    finally { setBusy(false); }
  };

  return (
    <RightDrawer drawerKey="wc-editor" defaultWidth={420} minWidth={360} closeOnBackdropClick={false} onClose={onClose}>
      <div className="px-5 py-3 border-b border-ui-border flex items-center">
        <div className="text-[14px] font-display font-bold text-sai-navy">{draft.id ? "Edit work center" : "New work center"}</div>
        <div className="flex-1" />
        <DrawerCloseButton onClose={onClose} />
      </div>
      <div className="flex-1 overflow-y-auto scroll-thin px-5 py-4 space-y-3">
        <div><div className="field-label">Name *</div>
          <input className="field-value" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div><div className="field-label">Code</div>
          <input className="field-value font-mono uppercase" value={code} onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 20))} /></div>
        <div className="grid grid-cols-2 gap-2">
          <div><div className="field-label">Capacity (units/hour)</div>
            <input type="number" min={0} step={0.01} className="field-value" value={capacity} onChange={(e) => setCapacity(Number(e.target.value) || 0)} /></div>
          <div><div className="field-label">Cost (R/hour)</div>
            <input type="number" min={0} step={0.01} className="field-value" value={cost} onChange={(e) => setCost(Number(e.target.value) || 0)} /></div>
        </div>
        <div><div className="field-label">Notes</div>
          <textarea className="field-value min-h-[60px] resize-y" value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        <label className="flex items-center gap-2 text-[12px] text-slate-700">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          Active
        </label>
      </div>
      <div className="px-5 py-3 border-t border-ui-border flex items-center gap-2">
        {draft.id && active && (
          <button onClick={remove} disabled={busy} className="text-[11px] text-red-600 hover:text-red-700 underline disabled:opacity-40">
            Mark inactive
          </button>
        )}
        <div className="flex-1" />
        <button onClick={onClose} className="text-[12px] px-3 py-1.5 text-slate-500 hover:text-slate-800">Cancel</button>
        <button onClick={save} disabled={busy || !name.trim()}
          className="text-[12px] bg-sai-blue text-white px-4 py-1.5 rounded font-semibold hover:opacity-90 disabled:opacity-40">
          {busy ? "Saving…" : draft.id ? "Save" : "Create"}
        </button>
      </div>
    </RightDrawer>
  );
}

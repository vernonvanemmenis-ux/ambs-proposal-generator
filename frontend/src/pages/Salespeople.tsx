import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type Salesperson } from "../api";
import RightDrawer, { DrawerCloseButton } from "../components/RightDrawer";

type Draft = Partial<Salesperson> & { id?: number };

export default function Salespeople() {
  const [people, setPeople] = useState<Salesperson[]>([]);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => {
    api.salespeople.list(includeInactive).then(setPeople).catch(() => setPeople([]));
  };
  useEffect(load, [includeInactive]);

  const filtered = people.filter((p) => {
    if (!q.trim()) return true;
    const hay = `${p.name} ${p.email} ${p.role} ${p.initials}`.toLowerCase();
    return hay.includes(q.trim().toLowerCase());
  });

  const save = async () => {
    if (!editing) return;
    setBusy(true);
    try {
      if (editing.id) {
        await api.salespeople.update(editing.id, editing);
      } else {
        await api.salespeople.create(editing);
      }
      setEditing(null);
      load();
    } catch (e: any) {
      alert("Save failed: " + (e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (sp: Salesperson) => {
    if (!confirm(`Remove ${sp.name} from the team? They'll be marked inactive — opportunities they own stay attributed to them.`)) return;
    await api.salespeople.delete(sp.id);
    load();
  };

  return (
    <div className="min-h-[calc(100vh-44px)]">
      <div className="bg-white border-b border-ui-border px-4 py-2 flex items-center gap-3">
        <Link to="/" className="text-[12px] text-slate-500 hover:text-sai-navy">Apps</Link>
        <div className="text-slate-300">/</div>
        <div className="text-[13px] font-semibold text-sai-navy font-display">HR · Sales Team</div>
        <div className="flex-1" />
        <button
          onClick={() => setEditing({ name: "", active: true })}
          className="text-[11px] bg-sai-blue text-white px-3 py-1.5 rounded font-semibold hover:opacity-90"
        >
          + New salesperson
        </button>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-6">
        <div className="bg-white border border-ui-border rounded-md p-4">
          <div className="flex items-center gap-3 mb-3">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by name, email, role…"
              className="flex-1 text-[13px] border border-ui-border rounded px-3 py-1.5 outline-none focus:border-sai-blue"
            />
            <label className="flex items-center gap-1.5 text-[11px] text-slate-600">
              <input
                type="checkbox"
                checked={includeInactive}
                onChange={(e) => setIncludeInactive(e.target.checked)}
              />
              Show inactive
            </label>
          </div>

          <table className="w-full text-[12px]">
            <thead className="text-[10px] uppercase tracking-wider text-slate-500 border-b border-ui-border">
              <tr>
                <th className="text-left px-2 py-2 w-10"></th>
                <th className="text-left px-2 py-2">Name</th>
                <th className="text-left px-2 py-2">Role</th>
                <th className="text-left px-2 py-2">Email</th>
                <th className="text-left px-2 py-2">Phone</th>
                <th className="text-center px-2 py-2">Status</th>
                <th className="px-2 py-2 w-12"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} className="border-b border-ui-border last:border-0 hover:bg-ui-rowhover cursor-pointer"
                    onClick={() => setEditing(p)}>
                  <td className="px-2 py-2">
                    <div className="h-7 w-7 rounded-full bg-sai-blue text-white text-[10px] font-bold flex items-center justify-center">
                      {p.initials || p.name.slice(0, 2).toUpperCase()}
                    </div>
                  </td>
                  <td className="px-2 py-2 font-semibold text-sai-navy">{p.name}</td>
                  <td className="px-2 py-2 text-slate-600">{p.role || <span className="italic text-slate-400">—</span>}</td>
                  <td className="px-2 py-2 text-slate-600">{p.email || <span className="italic text-slate-400">—</span>}</td>
                  <td className="px-2 py-2 text-slate-600">{p.phone || <span className="italic text-slate-400">—</span>}</td>
                  <td className="px-2 py-2 text-center">
                    {p.active ? (
                      <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-semibold">Active</span>
                    ) : (
                      <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-200 text-slate-500 font-semibold">Inactive</span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                    {p.active && (
                      <button onClick={() => remove(p)}
                              title="Mark inactive"
                              className="text-slate-300 hover:text-red-500 text-[14px] leading-none">×</button>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="px-2 py-10 text-center text-[12px] text-slate-400 italic">
                  No salespeople yet. Click + New salesperson to add one.
                </td></tr>
              )}
            </tbody>
          </table>
          <div className="mt-3 text-[11px] text-slate-400">
            {filtered.length} of {people.length} salesperson{people.length === 1 ? "" : "s"}
          </div>
        </div>
      </div>

      {editing && (
        <RightDrawer
          drawerKey="salesperson-editor"
          defaultWidth={460}
          minWidth={400}
          closeOnBackdropClick={false}
          onClose={() => setEditing(null)}
        >
          <div className="px-5 py-3 border-b border-ui-border flex items-center">
            <div className="text-[14px] font-display font-bold text-sai-navy">
              {editing.id ? "Edit Salesperson" : "New Salesperson"}
            </div>
            <div className="flex-1" />
            <DrawerCloseButton onClose={() => setEditing(null)} />
          </div>
          <div className="flex-1 overflow-y-auto scroll-thin px-5 py-4 space-y-3">
            <SField label="Name *" value={editing.name ?? ""} onChange={(v) => setEditing({ ...editing, name: v })} placeholder="e.g. Vernon van Emmenis" />
            <SField label="Role" value={editing.role ?? ""} onChange={(v) => setEditing({ ...editing, role: v })} placeholder="e.g. Senior Account Manager" />
            <SField label="Email" value={editing.email ?? ""} onChange={(v) => setEditing({ ...editing, email: v })} placeholder="e.g. vernon@ambs.co.za" />
            <SField label="Phone" value={editing.phone ?? ""} onChange={(v) => setEditing({ ...editing, phone: v })} placeholder="e.g. +27 11 555 0123" />
            <SField label="Initials (optional — auto if blank)" value={editing.initials ?? ""} onChange={(v) => setEditing({ ...editing, initials: v.toUpperCase().slice(0, 4) })} placeholder="e.g. VV" />
            <label className="flex items-center gap-2 text-[12px] pt-2">
              <input type="checkbox" checked={editing.active ?? true} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} />
              Active (shown in opportunity dropdowns)
            </label>
          </div>
          <div className="px-5 py-3 border-t border-ui-border flex justify-end gap-2">
            <button onClick={() => setEditing(null)} className="text-[12px] px-3 py-1.5 text-slate-500 hover:text-slate-800">
              Cancel
            </button>
            <button
              onClick={save}
              disabled={busy || !editing.name?.trim()}
              className="text-[12px] bg-sai-blue text-white px-4 py-1.5 rounded font-semibold hover:opacity-90 disabled:opacity-40"
            >
              {busy ? "Saving…" : editing.id ? "Save" : "Create"}
            </button>
          </div>
        </RightDrawer>
      )}
    </div>
  );
}

function SField({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <div>
      <div className="field-label">{label}</div>
      <input className="field-value" value={value} placeholder={placeholder}
             onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

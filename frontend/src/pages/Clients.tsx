import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, type Client, type Opportunity } from "../api";

type Draft = Partial<Client> & { id?: number };

export default function Clients() {
  const [clients, setClients] = useState<Client[]>([]);
  const [opps, setOpps] = useState<Opportunity[]>([]);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => {
    api.clients.list().then(setClients).catch(() => {});
    api.opportunities.list().then(setOpps).catch(() => {});
  };

  useEffect(load, []);

  const oppCount = useMemo(() => {
    const m: Record<number, number> = {};
    const v: Record<number, number> = {};
    for (const o of opps) {
      m[o.client_id] = (m[o.client_id] ?? 0) + 1;
      v[o.client_id] = (v[o.client_id] ?? 0) + o.amount;
    }
    return { m, v };
  }, [opps]);

  const rows = useMemo(() => {
    const ql = q.trim().toLowerCase();
    if (!ql) return clients;
    return clients.filter(
      (c) =>
        c.name.toLowerCase().includes(ql) ||
        c.industry.toLowerCase().includes(ql) ||
        c.contact_person.toLowerCase().includes(ql) ||
        c.site_location.toLowerCase().includes(ql)
    );
  }, [clients, q]);

  const save = async () => {
    if (!editing || !editing.name) return;
    setBusy(true);
    try {
      if (editing.id) {
        await api.clients.update(editing.id, editing);
      } else {
        await api.clients.create(editing);
      }
      setEditing(null);
      load();
    } catch (e: any) {
      alert("Save failed: " + (e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-44px)]">
      {/* Sub-toolbar */}
      <div className="bg-white border-b border-ui-border px-4 py-2 flex items-center gap-3">
        <Link to="/" className="text-[12px] text-slate-500 hover:text-sai-navy">← Apps</Link>
        <div className="text-slate-300">/</div>
        <div className="text-[13px] font-semibold text-sai-navy font-display">Clients</div>
        <div className="flex-1" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, industry, contact, location…"
          className="text-[12px] border border-ui-border rounded px-2 py-1.5 w-72 outline-none focus:border-sai-blue"
        />
        <button
          onClick={() =>
            setEditing({ name: "", industry: "", contact_person: "", email: "", phone: "", site_location: "" })
          }
          className="text-[11px] bg-sai-blue text-white px-3 py-1.5 rounded font-semibold hover:opacity-90"
        >
          + New Client
        </button>
      </div>

      {/* List view */}
      <div className="px-4 py-4">
        <div className="bg-white border border-ui-border rounded-md overflow-hidden shadow-card">
          <table className="w-full text-[13px]">
            <thead className="bg-slate-50 border-b border-ui-border">
              <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500">
                <th className="px-3 py-2 font-semibold">Client</th>
                <th className="px-3 py-2 font-semibold">Industry</th>
                <th className="px-3 py-2 font-semibold">Contact</th>
                <th className="px-3 py-2 font-semibold">Email</th>
                <th className="px-3 py-2 font-semibold">Phone</th>
                <th className="px-3 py-2 font-semibold">Site Location</th>
                <th className="px-3 py-2 font-semibold text-right">Opportunities</th>
                <th className="px-3 py-2 font-semibold text-right">Total Value</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => setEditing({ ...c })}
                  className="border-b border-ui-border last:border-0 hover:bg-ui-rowhover cursor-pointer"
                >
                  <td className="px-3 py-2.5">
                    <div className="font-semibold text-sai-navy">{c.name}</div>
                  </td>
                  <td className="px-3 py-2.5 text-slate-600">{c.industry || "—"}</td>
                  <td className="px-3 py-2.5 text-slate-600">{c.contact_person || "—"}</td>
                  <td className="px-3 py-2.5 text-slate-600">{c.email || "—"}</td>
                  <td className="px-3 py-2.5 text-slate-600">{c.phone || "—"}</td>
                  <td className="px-3 py-2.5 text-slate-600">{c.site_location || "—"}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{oppCount.m[c.id] ?? 0}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-sai-blue">
                    {oppCount.v[c.id]
                      ? "R " + oppCount.v[c.id].toLocaleString("en-ZA", { maximumFractionDigits: 0 })
                      : "—"}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-10 text-center text-slate-400 italic text-[12px]">
                    {q ? "No clients match your search." : "No clients yet. Click + New Client to get started."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-3 text-[11px] text-slate-400">
          {rows.length} of {clients.length} client{clients.length === 1 ? "" : "s"}
        </div>
      </div>

      {/* Edit drawer */}
      {editing && (
        <div
          className="fixed inset-0 bg-black/30 z-50 flex justify-end"
          onClick={() => setEditing(null)}
        >
          <div
            className="bg-white w-[460px] h-full shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-3 border-b border-ui-border flex items-center">
              <div className="text-[14px] font-display font-bold text-sai-navy">
                {editing.id ? "Edit Client" : "New Client"}
              </div>
              <div className="flex-1" />
              <button
                onClick={() => setEditing(null)}
                className="text-slate-400 hover:text-slate-700 text-lg leading-none px-1"
              >
                ×
              </button>
            </div>
            <div className="flex-1 overflow-y-auto scroll-thin px-5 py-4 space-y-3">
              <DField label="Name" value={editing.name ?? ""} onChange={(v) => setEditing({ ...editing, name: v })} />
              <DField label="Industry" value={editing.industry ?? ""} onChange={(v) => setEditing({ ...editing, industry: v })} />
              <DField label="Contact Person" value={editing.contact_person ?? ""} onChange={(v) => setEditing({ ...editing, contact_person: v })} />
              <DField label="Email" value={editing.email ?? ""} onChange={(v) => setEditing({ ...editing, email: v })} />
              <DField label="Phone" value={editing.phone ?? ""} onChange={(v) => setEditing({ ...editing, phone: v })} />
              <DField label="Site Location" value={editing.site_location ?? ""} onChange={(v) => setEditing({ ...editing, site_location: v })} />

              {editing.id && (
                <div className="pt-4 border-t border-ui-border">
                  <div className="field-label">Related Opportunities</div>
                  <div className="mt-1 space-y-1">
                    {opps
                      .filter((o) => o.client_id === editing.id)
                      .map((o) => (
                        <Link
                          key={o.id}
                          to={`/proposals/${o.id}`}
                          className="block text-[12px] px-2 py-1.5 rounded hover:bg-ui-rowhover border border-ui-border"
                        >
                          <div className="font-semibold text-sai-navy">{o.title}</div>
                          <div className="text-[11px] text-slate-500">
                            {o.stage.toUpperCase()} · R{" "}
                            {o.amount.toLocaleString("en-ZA", { maximumFractionDigits: 0 })}
                          </div>
                        </Link>
                      ))}
                    {opps.filter((o) => o.client_id === editing.id).length === 0 && (
                      <div className="text-[11px] text-slate-400 italic">No opportunities yet.</div>
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className="px-5 py-3 border-t border-ui-border flex justify-end gap-2">
              <button
                onClick={() => setEditing(null)}
                className="text-[12px] px-3 py-1.5 text-slate-500 hover:text-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={save}
                disabled={busy || !editing.name}
                className="text-[12px] bg-sai-blue text-white px-4 py-1.5 rounded font-semibold hover:opacity-90 disabled:opacity-40"
              >
                {busy ? "Saving…" : editing.id ? "Save" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <div className="field-label">{label}</div>
      <input
        className="field-value"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

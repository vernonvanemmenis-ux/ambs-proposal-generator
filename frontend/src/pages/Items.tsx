import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, type Catalogue, type Item } from "../api";

type Draft = Partial<Item> & { id?: number };

const CATEGORIES = ["Structure", "Component", "Service"] as const;

export default function Items() {
  const [items, setItems] = useState<Item[]>([]);
  const [catalogue, setCatalogue] = useState<Catalogue | null>(null);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>("");
  const [editing, setEditing] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => api.items.list().then(setItems).catch(() => {});
  useEffect(() => {
    load();
    api.catalogue().then(setCatalogue).catch(() => {});
  }, []);

  const rows = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return items.filter((i) => {
      if (cat && i.category !== cat) return false;
      if (!ql) return true;
      return (
        i.code.toLowerCase().includes(ql) ||
        i.name.toLowerCase().includes(ql) ||
        i.description.toLowerCase().includes(ql) ||
        i.product_line.toLowerCase().includes(ql)
      );
    });
  }, [items, q, cat]);

  const save = async () => {
    if (!editing?.code?.trim() || !editing?.name?.trim()) return;
    setBusy(true);
    try {
      const payload = {
        code: editing.code!,
        name: editing.name!,
        category: editing.category || "Component",
        product_line: editing.product_line || "",
        structure_type: editing.structure_type || "",
        unit_of_measure: editing.unit_of_measure || "each",
        default_rate: editing.default_rate ?? 0,
        description: editing.description || "",
      };
      if (editing.id) {
        await api.items.update(editing.id, payload);
      } else {
        await api.items.create(payload);
      }
      setEditing(null);
      load();
    } catch (e: any) {
      alert("Save failed: " + (e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (it: Item) => {
    if (!confirm(`Delete item '${it.code} · ${it.name}'?`)) return;
    await api.items.delete(it.id);
    load();
  };

  const money = (v: number) =>
    "R " + v.toLocaleString("en-ZA", { maximumFractionDigits: 2 });

  const catColor = (c: string) =>
    c === "Structure" ? "bg-blue-100 text-blue-700" :
    c === "Service" ? "bg-amber-100 text-amber-700" :
    "bg-emerald-100 text-emerald-700";

  return (
    <div className="min-h-[calc(100vh-44px)]">
      <div className="bg-white border-b border-ui-border px-4 py-2 flex items-center gap-3">
        <Link to="/" className="text-[12px] text-slate-500 hover:text-sai-navy">← Apps</Link>
        <div className="text-slate-300">/</div>
        <div className="text-[13px] font-semibold text-sai-navy font-display">Items Catalogue</div>
        <div className="flex-1" />
        <select
          value={cat}
          onChange={(e) => setCat(e.target.value)}
          className="text-[12px] border border-ui-border rounded px-2 py-1.5 outline-none focus:border-sai-blue"
        >
          <option value="">All categories</option>
          {CATEGORIES.map((c) => (<option key={c} value={c}>{c}</option>))}
        </select>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search code, name, description…"
          className="text-[12px] border border-ui-border rounded px-2 py-1.5 w-72 outline-none focus:border-sai-blue"
        />
        <button
          onClick={() => setEditing({ category: "Component", unit_of_measure: "each", default_rate: 0 })}
          className="text-[11px] bg-sai-blue text-white px-3 py-1.5 rounded font-semibold hover:opacity-90"
        >
          + New Item
        </button>
      </div>

      <div className="px-4 py-4">
        <div className="bg-white border border-ui-border rounded-md overflow-hidden shadow-card">
          <table className="w-full text-[12px]">
            <thead className="bg-slate-50 border-b border-ui-border">
              <tr className="text-left text-[10px] uppercase tracking-wider text-slate-500">
                <th className="px-3 py-2 font-semibold">Code</th>
                <th className="px-3 py-2 font-semibold">Name</th>
                <th className="px-3 py-2 font-semibold">Category</th>
                <th className="px-3 py-2 font-semibold">Product Line</th>
                <th className="px-3 py-2 font-semibold">UoM</th>
                <th className="px-3 py-2 font-semibold text-right">Default Rate</th>
                <th className="px-3 py-2 font-semibold w-16"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((i) => (
                <tr key={i.id} className="border-b border-ui-border last:border-0 hover:bg-ui-rowhover">
                  <td className="px-3 py-2 font-mono text-[11px] text-slate-600 cursor-pointer" onClick={() => setEditing({ ...i })}>
                    {i.code}
                  </td>
                  <td className="px-3 py-2 cursor-pointer" onClick={() => setEditing({ ...i })}>
                    <div className="font-semibold text-sai-navy">{i.name}</div>
                    {i.description && <div className="text-[10px] text-slate-500 mt-0.5 truncate max-w-[380px]">{i.description}</div>}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded font-semibold ${catColor(i.category)}`}>
                      {i.category}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-slate-600 truncate max-w-[220px]" title={i.product_line}>
                    {i.product_line || "—"}
                  </td>
                  <td className="px-3 py-2 text-slate-600">{i.unit_of_measure}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold text-sai-blue">
                    {money(i.default_rate)}
                  </td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() => remove(i)}
                      title="Delete"
                      className="text-slate-300 hover:text-red-500 text-[14px] leading-none"
                    >×</button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center text-slate-400 italic text-[12px]">
                    {q || cat ? "No items match your filter." : "No items yet. Click + New Item to get started."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="mt-3 text-[11px] text-slate-400">
          {rows.length} of {items.length} item{items.length === 1 ? "" : "s"}
        </div>
      </div>

      {editing && (
        <div className="fixed inset-0 bg-black/30 z-50 flex justify-end" onClick={() => setEditing(null)}>
          <div className="bg-white w-[500px] h-full shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-3 border-b border-ui-border flex items-center">
              <div className="text-[14px] font-display font-bold text-sai-navy">
                {editing.id ? "Edit Item" : "New Item"}
              </div>
              <div className="flex-1" />
              <button onClick={() => setEditing(null)} className="text-slate-400 hover:text-slate-700 text-lg leading-none px-1">×</button>
            </div>
            <div className="flex-1 overflow-y-auto scroll-thin px-5 py-4 space-y-3">
              <Field label="Code">
                <input className="field-value font-mono" value={editing.code ?? ""}
                       onChange={(e) => setEditing({ ...editing, code: e.target.value })} />
              </Field>
              <Field label="Name">
                <input className="field-value" value={editing.name ?? ""}
                       onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
              </Field>
              <Field label="Description">
                <textarea className="field-value min-h-[60px] resize-y" value={editing.description ?? ""}
                          onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Category">
                  <select className="field-value" value={editing.category ?? "Component"}
                          onChange={(e) => setEditing({ ...editing, category: e.target.value })}>
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </Field>
                <Field label="Unit of Measure">
                  <select className="field-value" value={editing.unit_of_measure ?? "each"}
                          onChange={(e) => setEditing({ ...editing, unit_of_measure: e.target.value })}>
                    {(catalogue?.units_of_measure ?? ["each"]).map((u) => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field label="Default Rate (R)">
                <input type="number" step="0.01" className="field-value" value={editing.default_rate ?? 0}
                       onChange={(e) => setEditing({ ...editing, default_rate: Number(e.target.value) || 0 })} />
              </Field>
              <Field label="Product Line (optional)">
                <select className="field-value" value={editing.product_line ?? ""}
                        onChange={(e) => setEditing({ ...editing, product_line: e.target.value })}>
                  <option value="">—</option>
                  {catalogue?.product_lines.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </Field>
              <Field label="Structure Type (optional)">
                <select className="field-value" value={editing.structure_type ?? ""}
                        onChange={(e) => setEditing({ ...editing, structure_type: e.target.value })}>
                  <option value="">—</option>
                  {catalogue?.structure_types.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
            </div>
            <div className="px-5 py-3 border-t border-ui-border flex justify-end gap-2">
              <button onClick={() => setEditing(null)} className="text-[12px] px-3 py-1.5 text-slate-500 hover:text-slate-800">
                Cancel
              </button>
              <button
                onClick={save}
                disabled={busy || !editing.code?.trim() || !editing.name?.trim()}
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="field-label">{label}</div>
      {children}
    </div>
  );
}

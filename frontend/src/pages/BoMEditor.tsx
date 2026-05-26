/**
 * BoM editor — create or edit a Bill of Materials.
 *
 * Header (finished item + code + version + qty_produced + active),
 * components table (add/remove/reorder), operations table.
 */

import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, type BoM, type Item, type WorkCenter } from "../api";


type LineRow = {
  id?: number;
  item_id: number;
  sequence: number;
  qty_required: number;
  unit_of_measure: string;
  scrap_pct: number;
};

type OpRow = {
  id?: number;
  work_center_id: number;
  name: string;
  sequence: number;
  duration_min: number;
  notes: string;
};


export default function BoMEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNew = id === "new";
  const bomId = isNew ? null : Number(id);

  const [items, setItems] = useState<Item[]>([]);
  const [workCenters, setWorkCenters] = useState<WorkCenter[]>([]);
  const [loading, setLoading] = useState(!isNew);

  const [itemId, setItemId] = useState<number | "">("");
  const [code, setCode] = useState("");
  const [version, setVersion] = useState("1.0");
  const [qtyProduced, setQtyProduced] = useState(1);
  const [active, setActive] = useState(true);
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineRow[]>([]);
  const [ops, setOps] = useState<OpRow[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.items.list().then(setItems).catch(() => {});
    api.manufacturing.workCenters.list().then(setWorkCenters).catch(() => {});
  }, []);

  useEffect(() => {
    if (isNew || !bomId || Number.isNaN(bomId)) return;
    setLoading(true);
    api.manufacturing.boms.get(bomId).then((b: BoM) => {
      setItemId(b.item_id);
      setCode(b.code);
      setVersion(b.version);
      setQtyProduced(b.qty_produced);
      setActive(b.active);
      setNotes(b.notes);
      setLines(b.lines.map((l) => ({ ...l })));
      setOps(b.operations.map((o) => ({ ...o })));
    }).finally(() => setLoading(false));
  }, [isNew, bomId]);

  const itemById = useMemo(() => {
    const m: Record<number, Item> = {};
    for (const it of items) m[it.id] = it;
    return m;
  }, [items]);

  const addLine = () => {
    setLines((ls) => [...ls, {
      item_id: items[0]?.id ?? 0,
      sequence: ls.length,
      qty_required: 1,
      unit_of_measure: "each",
      scrap_pct: 0,
    }]);
  };
  const updateLine = (i: number, patch: Partial<LineRow>) => {
    setLines((ls) => ls.map((l, idx) => idx === i ? { ...l, ...patch } : l));
  };
  const removeLine = (i: number) => setLines((ls) => ls.filter((_, idx) => idx !== i));
  const moveLine = (i: number, dir: -1 | 1) => {
    setLines((ls) => {
      const j = i + dir;
      if (j < 0 || j >= ls.length) return ls;
      const copy = ls.slice();
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy.map((l, idx) => ({ ...l, sequence: idx }));
    });
  };

  const addOp = () => {
    setOps((os) => [...os, {
      work_center_id: workCenters[0]?.id ?? 0,
      name: "",
      sequence: os.length,
      duration_min: 0,
      notes: "",
    }]);
  };
  const updateOp = (i: number, patch: Partial<OpRow>) => {
    setOps((os) => os.map((o, idx) => idx === i ? { ...o, ...patch } : o));
  };
  const removeOp = (i: number) => setOps((os) => os.filter((_, idx) => idx !== i));
  const moveOp = (i: number, dir: -1 | 1) => {
    setOps((os) => {
      const j = i + dir;
      if (j < 0 || j >= os.length) return os;
      const copy = os.slice();
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy.map((o, idx) => ({ ...o, sequence: idx }));
    });
  };

  const save = async () => {
    if (itemId === "" || qtyProduced <= 0) {
      alert("Pick a finished item and set qty_produced > 0");
      return;
    }
    setBusy(true);
    try {
      const body = {
        item_id: Number(itemId),
        code, version, qty_produced: qtyProduced, active, notes,
        lines: lines.map((l, i) => ({
          item_id: l.item_id, sequence: i,
          qty_required: Number(l.qty_required) || 0,
          unit_of_measure: l.unit_of_measure || "each",
          scrap_pct: Number(l.scrap_pct) || 0,
        })),
        operations: ops.map((o, i) => ({
          work_center_id: o.work_center_id,
          name: o.name, sequence: i,
          duration_min: Number(o.duration_min) || 0,
          notes: o.notes,
        })),
      };
      if (isNew) {
        const created = await api.manufacturing.boms.create(body);
        navigate(`/bills-of-materials/${created.id}`, { replace: true });
      } else if (bomId) {
        await api.manufacturing.boms.update(bomId, body);
      }
    } catch (e: any) {
      alert("Save failed: " + (e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!bomId) return;
    if (!confirm("Delete this BoM? (will soft-delete if any MO has used it)")) return;
    setBusy(true);
    try {
      await api.manufacturing.boms.delete(bomId);
      navigate("/bills-of-materials", { replace: true });
    } catch (e: any) {
      alert("Delete failed: " + (e?.message || e));
    } finally { setBusy(false); }
  };

  if (loading) return <div className="px-4 py-8 text-[12px] text-slate-400 italic">Loading…</div>;

  return (
    <div className="min-h-[calc(100vh-44px)]">
      <div className="bg-white border-b border-ui-border px-4 py-2 flex items-center gap-3">
        <Link to="/" className="text-[12px] text-slate-500 hover:text-sai-navy">← Apps</Link>
        <div className="text-slate-300">/</div>
        <Link to="/bills-of-materials" className="text-[12px] text-slate-500 hover:text-sai-navy">BoMs</Link>
        <div className="text-slate-300">/</div>
        <div className="text-[13px] font-semibold text-sai-navy font-display">
          {isNew ? "New BoM" : code || `BoM #${bomId}`}
        </div>
        <div className="flex-1" />
        {!isNew && (
          <button onClick={remove} disabled={busy} className="text-[11px] text-red-600 hover:text-red-700 underline disabled:opacity-40">
            Delete
          </button>
        )}
        <button onClick={save} disabled={busy || itemId === ""}
          className="text-[11px] bg-sai-blue text-white px-3 py-1 rounded font-semibold hover:opacity-90 disabled:opacity-40">
          {busy ? "Saving…" : isNew ? "Create" : "Save"}
        </button>
      </div>

      <div className="px-4 py-4 max-w-5xl mx-auto space-y-4">
        {/* Header */}
        <div className="bg-white border border-ui-border rounded-md p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <div className="field-label">Finished item *</div>
            <select className="field-value" value={itemId} onChange={(e) => setItemId(Number(e.target.value))}>
              <option value="">—</option>
              {items.map((it) => <option key={it.id} value={it.id}>{it.code} · {it.name}</option>)}
            </select>
          </div>
          <div>
            <div className="field-label">Code</div>
            <input className="field-value font-mono uppercase" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
          </div>
          <div>
            <div className="field-label">Version</div>
            <input className="field-value font-mono" value={version} onChange={(e) => setVersion(e.target.value)} />
          </div>
          <div>
            <div className="field-label">Qty produced per batch</div>
            <input type="number" min={0} step={0.01} className="field-value" value={qtyProduced} onChange={(e) => setQtyProduced(Number(e.target.value) || 0)} />
          </div>
          <div className="md:col-span-2 flex items-end">
            <label className="flex items-center gap-2 text-[12px] text-slate-700">
              <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
              Active
            </label>
          </div>
          <div className="md:col-span-3">
            <div className="field-label">Notes</div>
            <textarea className="field-value min-h-[40px] resize-y" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

        {/* Components */}
        <div className="bg-white border border-ui-border rounded-md">
          <div className="px-3 py-2 border-b border-ui-border flex items-center">
            <div className="text-[13px] font-semibold text-sai-navy">Components</div>
            <div className="text-[11px] text-slate-500 ml-2">{lines.length} line{lines.length === 1 ? "" : "s"}</div>
            <div className="flex-1" />
            <button onClick={addLine} disabled={items.length === 0}
              className="text-[11px] text-sai-blue hover:underline font-semibold disabled:opacity-40">+ Add component</button>
          </div>
          {lines.length === 0 ? (
            <div className="px-3 py-6 text-center text-[12px] text-slate-400 italic">No components yet.</div>
          ) : (
            <table className="w-full text-[12px]">
              <thead className="bg-slate-50 border-b border-ui-border text-left text-[10px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-2 py-1.5 font-semibold w-8"></th>
                  <th className="px-2 py-1.5 font-semibold">Item</th>
                  <th className="px-2 py-1.5 font-semibold text-right">Qty required</th>
                  <th className="px-2 py-1.5 font-semibold">UoM</th>
                  <th className="px-2 py-1.5 font-semibold text-right">Scrap %</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={i} className="border-b border-ui-border last:border-0">
                    <td className="px-2 py-1 text-center">
                      <div className="flex flex-col gap-0.5">
                        <button onClick={() => moveLine(i, -1)} disabled={i === 0}
                          className="text-[9px] text-slate-400 hover:text-sai-blue disabled:opacity-30">↑</button>
                        <button onClick={() => moveLine(i, 1)} disabled={i === lines.length - 1}
                          className="text-[9px] text-slate-400 hover:text-sai-blue disabled:opacity-30">↓</button>
                      </div>
                    </td>
                    <td className="px-2 py-1">
                      <select value={l.item_id} onChange={(e) => updateLine(i, { item_id: Number(e.target.value) })}
                        className="w-full text-[11px] border border-ui-border rounded px-1 py-0.5">
                        {items.map((it) => <option key={it.id} value={it.id}>{it.code} · {it.name}</option>)}
                      </select>
                    </td>
                    <td className="px-2 py-1 text-right">
                      <input type="number" min={0} step={0.01} value={l.qty_required} onChange={(e) => updateLine(i, { qty_required: Number(e.target.value) })}
                        className="w-24 text-right text-[11px] border border-ui-border rounded px-1 py-0.5" />
                    </td>
                    <td className="px-2 py-1">
                      <input value={l.unit_of_measure} onChange={(e) => updateLine(i, { unit_of_measure: e.target.value })}
                        className="w-20 text-[11px] border border-ui-border rounded px-1 py-0.5" />
                    </td>
                    <td className="px-2 py-1 text-right">
                      <input type="number" min={0} step={0.01} value={l.scrap_pct} onChange={(e) => updateLine(i, { scrap_pct: Number(e.target.value) })}
                        className="w-20 text-right text-[11px] border border-ui-border rounded px-1 py-0.5" />
                    </td>
                    <td className="px-2 py-1 text-right">
                      <button onClick={() => removeLine(i)} className="text-slate-400 hover:text-red-600">×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Operations */}
        <div className="bg-white border border-ui-border rounded-md">
          <div className="px-3 py-2 border-b border-ui-border flex items-center">
            <div className="text-[13px] font-semibold text-sai-navy">Operations</div>
            <div className="text-[11px] text-slate-500 ml-2">{ops.length} step{ops.length === 1 ? "" : "s"}</div>
            <div className="flex-1" />
            <button onClick={addOp} disabled={workCenters.length === 0}
              className="text-[11px] text-sai-blue hover:underline font-semibold disabled:opacity-40"
              title={workCenters.length === 0 ? "Create a work center first" : "Add operation"}>
              + Add operation
            </button>
          </div>
          {ops.length === 0 ? (
            <div className="px-3 py-6 text-center text-[12px] text-slate-400 italic">
              No operations. Add at least one if you want work orders spawned when an MO confirms.
            </div>
          ) : (
            <table className="w-full text-[12px]">
              <thead className="bg-slate-50 border-b border-ui-border text-left text-[10px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-2 py-1.5 font-semibold w-8"></th>
                  <th className="px-2 py-1.5 font-semibold">Name</th>
                  <th className="px-2 py-1.5 font-semibold">Work center</th>
                  <th className="px-2 py-1.5 font-semibold text-right">Duration (min)</th>
                  <th className="px-2 py-1.5 font-semibold">Notes</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {ops.map((o, i) => (
                  <tr key={i} className="border-b border-ui-border last:border-0">
                    <td className="px-2 py-1 text-center">
                      <div className="flex flex-col gap-0.5">
                        <button onClick={() => moveOp(i, -1)} disabled={i === 0}
                          className="text-[9px] text-slate-400 hover:text-sai-blue disabled:opacity-30">↑</button>
                        <button onClick={() => moveOp(i, 1)} disabled={i === ops.length - 1}
                          className="text-[9px] text-slate-400 hover:text-sai-blue disabled:opacity-30">↓</button>
                      </div>
                    </td>
                    <td className="px-2 py-1">
                      <input value={o.name} onChange={(e) => updateOp(i, { name: e.target.value })}
                        placeholder="Step name"
                        className="w-full text-[11px] border border-ui-border rounded px-1 py-0.5" />
                    </td>
                    <td className="px-2 py-1">
                      <select value={o.work_center_id} onChange={(e) => updateOp(i, { work_center_id: Number(e.target.value) })}
                        className="w-full text-[11px] border border-ui-border rounded px-1 py-0.5">
                        {workCenters.map((wc) => <option key={wc.id} value={wc.id}>{wc.name}</option>)}
                      </select>
                    </td>
                    <td className="px-2 py-1 text-right">
                      <input type="number" min={0} step={1} value={o.duration_min} onChange={(e) => updateOp(i, { duration_min: Number(e.target.value) })}
                        className="w-24 text-right text-[11px] border border-ui-border rounded px-1 py-0.5" />
                    </td>
                    <td className="px-2 py-1">
                      <input value={o.notes} onChange={(e) => updateOp(i, { notes: e.target.value })}
                        className="w-full text-[11px] border border-ui-border rounded px-1 py-0.5" />
                    </td>
                    <td className="px-2 py-1 text-right">
                      <button onClick={() => removeOp(i)} className="text-slate-400 hover:text-red-600">×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

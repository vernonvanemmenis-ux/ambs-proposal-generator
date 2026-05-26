/**
 * Manufacturing Order workspace.
 *
 * - /manufacturing-orders/new : draft form (BoM + qty + locations)
 * - /manufacturing-orders/:id : full workspace with lifecycle actions
 *   (confirm / start / finish / cancel), WO panel, QC panel.
 */

import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  api,
  type BoM,
  type Item,
  type ManufacturingOrder,
  type QualityCheck,
  type QualityCheckKind,
  type QualityResult,
  type StockLocation,
  type WorkCenter,
  type WorkOrder,
} from "../api";


export default function ManufacturingOrderForm() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNew = id === "new";
  const moId = isNew ? null : Number(id);

  const [mo, setMo] = useState<ManufacturingOrder | null>(null);
  const [boms, setBoms] = useState<BoM[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [workCenters, setWorkCenters] = useState<WorkCenter[]>([]);
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [busy, setBusy] = useState(false);

  // Draft form state
  const [bomId, setBomId] = useState<number | "">("");
  const [qty, setQty] = useState<number>(1);
  const [srcLocId, setSrcLocId] = useState<number | "">("");
  const [dstLocId, setDstLocId] = useState<number | "">("");
  const [notes, setNotes] = useState("");

  const reload = async () => {
    if (!moId || Number.isNaN(moId)) return;
    setLoading(true);
    try {
      const fresh = await api.manufacturing.orders.get(moId);
      setMo(fresh);
      setBomId(fresh.bom_id);
      setQty(fresh.qty_to_produce);
      setSrcLocId(fresh.source_location_id ?? "");
      setDstLocId(fresh.dest_location_id ?? "");
      setNotes(fresh.notes);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    api.manufacturing.boms.list().then(setBoms).catch(() => {});
    api.items.list().then(setItems).catch(() => {});
    api.manufacturing.workCenters.list().then(setWorkCenters).catch(() => {});
    api.inventory.locations.list({ include_inactive: false }).then(setLocations).catch(() => {});
  }, []);

  useEffect(() => { reload(); }, [moId]);

  const itemById = useMemo(() => {
    const m: Record<number, Item> = {};
    for (const it of items) m[it.id] = it;
    return m;
  }, [items]);
  const bomById = useMemo(() => {
    const m: Record<number, BoM> = {};
    for (const b of boms) m[b.id] = b;
    return m;
  }, [boms]);
  const wcById = useMemo(() => {
    const m: Record<number, WorkCenter> = {};
    for (const w of workCenters) m[w.id] = w;
    return m;
  }, [workCenters]);
  const locById = useMemo(() => {
    const m: Record<number, StockLocation> = {};
    for (const l of locations) m[l.id] = l;
    return m;
  }, [locations]);

  const editable = !mo || mo.state === "draft";

  const save = async () => {
    if (bomId === "" || qty <= 0) {
      alert("Pick a BoM and qty > 0");
      return;
    }
    setBusy(true);
    try {
      if (isNew) {
        const created = await api.manufacturing.orders.create({
          bom_id: Number(bomId),
          qty_to_produce: Number(qty),
          source_location_id: srcLocId === "" ? null : Number(srcLocId),
          dest_location_id: dstLocId === "" ? null : Number(dstLocId),
          notes,
        });
        navigate(`/manufacturing-orders/${created.id}`, { replace: true });
      } else if (moId) {
        await api.manufacturing.orders.update(moId, {
          qty_to_produce: Number(qty),
          source_location_id: srcLocId === "" ? null : Number(srcLocId),
          dest_location_id: dstLocId === "" ? null : Number(dstLocId),
          notes,
        });
        await reload();
      }
    } catch (e: any) {
      alert("Save failed: " + (e?.message || e));
    } finally { setBusy(false); }
  };

  const lifecycle = async (action: "confirm" | "start" | "finish" | "cancel") => {
    if (!mo) return;
    const confirms: Record<string, string> = {
      confirm: `Confirm ${mo.ref}? This reserves components and spawns work orders.`,
      start: `Start ${mo.ref}?`,
      finish: `Finish ${mo.ref}? Consumes components and produces ${mo.qty_to_produce} finished units.`,
      cancel: `Cancel ${mo.ref}? Reservations and open work orders will be released.`,
    };
    if (!confirm(confirms[action])) return;
    setBusy(true);
    try {
      const fn = api.manufacturing.orders[action];
      await fn(mo.id);
      await reload();
    } catch (e: any) {
      alert(`${action} failed: ` + (e?.message || e));
    } finally { setBusy(false); }
  };

  const remove = async () => {
    if (!mo) return;
    if (!confirm(`Delete ${mo.ref}?`)) return;
    setBusy(true);
    try {
      await api.manufacturing.orders.delete(mo.id);
      navigate("/manufacturing-orders", { replace: true });
    } catch (e: any) { alert("Delete failed: " + (e?.message || e)); }
    finally { setBusy(false); }
  };

  if (loading) return <div className="px-4 py-8 text-[12px] text-slate-400 italic">Loading…</div>;

  const stateBadge: Record<string, string> = {
    draft:       "bg-slate-200 text-slate-700",
    confirmed:   "bg-blue-100 text-blue-700",
    in_progress: "bg-amber-100 text-amber-700",
    done:        "bg-emerald-100 text-emerald-700",
    cancelled:   "bg-red-100 text-red-700",
  };

  const bom = mo ? bomById[mo.bom_id] : (bomId !== "" ? bomById[Number(bomId)] : undefined);

  return (
    <div className="min-h-[calc(100vh-44px)]">
      <div className="bg-white border-b border-ui-border px-4 py-2 flex items-center gap-3">
        <Link to="/" className="text-[12px] text-slate-500 hover:text-sai-navy">← Apps</Link>
        <div className="text-slate-300">/</div>
        <Link to="/manufacturing-orders" className="text-[12px] text-slate-500 hover:text-sai-navy">Manufacturing</Link>
        <div className="text-slate-300">/</div>
        <div className="text-[13px] font-semibold text-sai-navy font-display">{isNew ? "New MO" : mo?.ref ?? "MO"}</div>
        {mo && (
          <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded font-semibold ${stateBadge[mo.state]}`}>{mo.state.replace("_", " ")}</span>
        )}
        <div className="flex-1" />
        {mo?.state === "draft" && (
          <>
            <button onClick={remove} disabled={busy} className="text-[11px] text-red-600 hover:text-red-700 underline disabled:opacity-40">Delete</button>
            <button onClick={() => lifecycle("confirm")} disabled={busy}
              className="text-[11px] border border-sai-blue text-sai-blue px-3 py-1 rounded font-semibold hover:bg-sai-bluepale disabled:opacity-40">
              Confirm + reserve
            </button>
          </>
        )}
        {mo?.state === "confirmed" && (
          <button onClick={() => lifecycle("start")} disabled={busy}
            className="text-[11px] border border-sai-blue text-sai-blue px-3 py-1 rounded font-semibold hover:bg-sai-bluepale disabled:opacity-40">
            Start
          </button>
        )}
        {mo && (mo.state === "confirmed" || mo.state === "in_progress") && (
          <button onClick={() => lifecycle("finish")} disabled={busy}
            className="text-[11px] bg-emerald-600 text-white px-3 py-1 rounded font-semibold hover:opacity-90 disabled:opacity-40">
            Finish
          </button>
        )}
        {mo && mo.state !== "done" && mo.state !== "cancelled" && (
          <button onClick={() => lifecycle("cancel")} disabled={busy}
            className="text-[11px] text-red-600 hover:text-red-700 underline disabled:opacity-40">
            Cancel MO
          </button>
        )}
        {editable && (
          <button onClick={save} disabled={busy || bomId === "" || qty <= 0}
            className="text-[11px] bg-sai-blue text-white px-3 py-1 rounded font-semibold hover:opacity-90 disabled:opacity-40">
            {busy ? "Saving…" : isNew ? "Create" : "Save"}
          </button>
        )}
      </div>

      <div className="px-4 py-4 max-w-6xl mx-auto space-y-4">
        {/* Header */}
        <div className="bg-white border border-ui-border rounded-md p-4 grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <div className="field-label">BoM *</div>
            <select className="field-value" value={bomId} onChange={(e) => setBomId(Number(e.target.value))} disabled={!editable}>
              <option value="">—</option>
              {boms.map((b) => {
                const it = itemById[b.item_id];
                return <option key={b.id} value={b.id}>{b.code || `BoM #${b.id}`} ({it?.name ?? "?"}, v{b.version})</option>;
              })}
            </select>
          </div>
          <div>
            <div className="field-label">Qty to produce *</div>
            <input type="number" min={0} step={0.01} className="field-value" value={qty} onChange={(e) => setQty(Number(e.target.value) || 0)} disabled={!editable} />
          </div>
          <div>
            <div className="field-label">Source location</div>
            <select className="field-value" value={srcLocId} onChange={(e) => setSrcLocId(Number(e.target.value))} disabled={!editable}>
              <option value="">— default internal —</option>
              {locations.filter((l) => l.kind === "internal").map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </div>
          <div>
            <div className="field-label">Dest. location</div>
            <select className="field-value" value={dstLocId} onChange={(e) => setDstLocId(Number(e.target.value))} disabled={!editable}>
              <option value="">— same as source —</option>
              {locations.filter((l) => l.kind === "internal").map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </div>
          <div className="md:col-span-4">
            <div className="field-label">Notes</div>
            <textarea className="field-value min-h-[40px] resize-y" value={notes} onChange={(e) => setNotes(e.target.value)} disabled={!editable} />
          </div>
        </div>

        {/* BoM preview */}
        {bom && (
          <div className="bg-white border border-ui-border rounded-md">
            <div className="px-3 py-2 border-b border-ui-border text-[13px] font-semibold text-sai-navy">
              Components needed
              <span className="text-[11px] text-slate-500 ml-2">
                for {qty} × {itemById[bom.item_id]?.name ?? "finished"} (BoM produces {bom.qty_produced}/batch)
              </span>
            </div>
            <table className="w-full text-[12px]">
              <thead className="bg-slate-50 border-b border-ui-border text-left text-[10px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-3 py-1.5 font-semibold">Item</th>
                  <th className="px-3 py-1.5 font-semibold text-right">Per batch</th>
                  <th className="px-3 py-1.5 font-semibold text-right">Scrap %</th>
                  <th className="px-3 py-1.5 font-semibold text-right">Required</th>
                </tr>
              </thead>
              <tbody>
                {bom.lines.map((l) => {
                  const base = (l.qty_required * qty) / (bom.qty_produced || 1);
                  const total = base * (1 + (l.scrap_pct || 0) / 100);
                  return (
                    <tr key={l.id} className="border-b border-ui-border last:border-0">
                      <td className="px-3 py-1.5">
                        {itemById[l.item_id] ? <><span className="font-mono text-[10px] text-slate-400">{itemById[l.item_id].code}</span> {itemById[l.item_id].name}</> : `Item #${l.item_id}`}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{l.qty_required}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{l.scrap_pct}%</td>
                      <td className="px-3 py-1.5 text-right tabular-nums font-semibold text-sai-blue">
                        {total.toLocaleString("en-ZA", { maximumFractionDigits: 2 })} {l.unit_of_measure}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Work orders */}
        {mo && mo.work_orders.length > 0 && (
          <WorkOrdersPanel mo={mo} wcById={wcById} onChange={reload} />
        )}

        {/* Quality checks */}
        {mo && (mo.state === "confirmed" || mo.state === "in_progress" || mo.state === "done" || mo.quality_checks.length > 0) && (
          <QualityChecksPanel mo={mo} onChange={reload} />
        )}
      </div>
    </div>
  );
}


function WorkOrdersPanel({ mo, wcById, onChange }: {
  mo: ManufacturingOrder;
  wcById: Record<number, WorkCenter>;
  onChange: () => void | Promise<void>;
}) {
  const stateBadge: Record<string, string> = {
    pending:     "bg-slate-200 text-slate-700",
    in_progress: "bg-amber-100 text-amber-700",
    done:        "bg-emerald-100 text-emerald-700",
    cancelled:   "bg-red-100 text-red-700",
  };

  const [busyId, setBusyId] = useState<number | null>(null);
  const run = async (wo: WorkOrder, action: "start" | "finish" | "cancel") => {
    setBusyId(wo.id);
    try {
      const fn = api.manufacturing.workOrders[action];
      await fn(wo.id);
      await onChange();
    } catch (e: any) { alert(`${action} failed: ` + (e?.message || e)); }
    finally { setBusyId(null); }
  };

  return (
    <div className="bg-white border border-ui-border rounded-md">
      <div className="px-3 py-2 border-b border-ui-border text-[13px] font-semibold text-sai-navy">
        Work orders <span className="text-[11px] text-slate-500 ml-2">{mo.work_orders.length} step{mo.work_orders.length === 1 ? "" : "s"}</span>
      </div>
      <table className="w-full text-[12px]">
        <thead className="bg-slate-50 border-b border-ui-border text-left text-[10px] uppercase tracking-wider text-slate-500">
          <tr>
            <th className="px-3 py-1.5 font-semibold">#</th>
            <th className="px-3 py-1.5 font-semibold">Operation</th>
            <th className="px-3 py-1.5 font-semibold">Work center</th>
            <th className="px-3 py-1.5 font-semibold">Operator</th>
            <th className="px-3 py-1.5 font-semibold">State</th>
            <th className="px-3 py-1.5 font-semibold text-right">Duration (min)</th>
            <th className="px-3 py-1.5 font-semibold">Actions</th>
          </tr>
        </thead>
        <tbody>
          {mo.work_orders.map((wo) => (
            <tr key={wo.id} className="border-b border-ui-border last:border-0">
              <td className="px-3 py-1.5 text-slate-400 font-mono text-[10px]">{wo.sequence + 1}</td>
              <td className="px-3 py-1.5 font-semibold text-sai-navy">{wo.name}</td>
              <td className="px-3 py-1.5 text-slate-600">{wcById[wo.work_center_id]?.name ?? `WC #${wo.work_center_id}`}</td>
              <td className="px-3 py-1.5 text-slate-600">{wo.operator || "—"}</td>
              <td className="px-3 py-1.5">
                <span className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded font-semibold ${stateBadge[wo.state]}`}>
                  {wo.state.replace("_", " ")}
                </span>
              </td>
              <td className="px-3 py-1.5 text-right tabular-nums text-slate-600">
                {wo.actual_duration_min ? wo.actual_duration_min.toFixed(0) : "—"}
              </td>
              <td className="px-3 py-1.5">
                <div className="flex items-center gap-1">
                  {wo.state === "pending" && (
                    <button onClick={() => run(wo, "start")} disabled={busyId === wo.id}
                      className="text-[10px] border border-sai-blue text-sai-blue px-2 py-0.5 rounded font-semibold hover:bg-sai-bluepale disabled:opacity-40">
                      Start
                    </button>
                  )}
                  {(wo.state === "pending" || wo.state === "in_progress") && (
                    <button onClick={() => run(wo, "finish")} disabled={busyId === wo.id}
                      className="text-[10px] bg-sai-blue text-white px-2 py-0.5 rounded font-semibold hover:opacity-90 disabled:opacity-40">
                      Done
                    </button>
                  )}
                  {wo.state !== "done" && wo.state !== "cancelled" && (
                    <button onClick={() => run(wo, "cancel")} disabled={busyId === wo.id}
                      className="text-[10px] text-red-600 hover:text-red-700 underline disabled:opacity-40">
                      Cancel
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}


function QualityChecksPanel({ mo, onChange }: {
  mo: ManufacturingOrder;
  onChange: () => void | Promise<void>;
}) {
  const [newName, setNewName] = useState("");
  const [newKind, setNewKind] = useState<QualityCheckKind>("pass_fail");
  const [adding, setAdding] = useState(false);

  const add = async () => {
    if (!newName.trim()) return;
    setAdding(true);
    try {
      await api.manufacturing.qc.create({ mo_id: mo.id, name: newName, kind: newKind });
      setNewName("");
      await onChange();
    } catch (e: any) { alert("Add QC failed: " + (e?.message || e)); }
    finally { setAdding(false); }
  };

  const failed = mo.quality_checks.filter((q) => q.result === "fail");

  return (
    <div className="bg-white border border-ui-border rounded-md">
      <div className="px-3 py-2 border-b border-ui-border flex items-center">
        <div className="text-[13px] font-semibold text-sai-navy">Quality checks</div>
        <div className="text-[11px] text-slate-500 ml-2">
          {mo.quality_checks.length} total · {mo.quality_checks.filter((q) => q.result === "pass").length} pass · {failed.length} fail
        </div>
        {failed.length > 0 && (
          <span className="ml-2 text-[10px] uppercase tracking-wider bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-semibold">
            blocks finish
          </span>
        )}
        <div className="flex-1" />
      </div>
      <div className="px-3 py-2">
        {mo.quality_checks.length === 0 && (
          <div className="text-[11px] text-slate-400 italic py-2">
            No checks yet. Add one to require pass-before-finish.
          </div>
        )}
        <ul className="divide-y divide-ui-border">
          {mo.quality_checks.map((qc) => (
            <QCRow key={qc.id} qc={qc} onChange={onChange} />
          ))}
        </ul>
      </div>
      <div className="px-3 py-2 border-t border-ui-border flex items-center gap-2">
        <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New check name (e.g. Visual inspection)"
          className="flex-1 text-[12px] border border-ui-border rounded px-2 py-1 outline-none focus:border-sai-blue" />
        <select value={newKind} onChange={(e) => setNewKind(e.target.value as QualityCheckKind)}
          className="text-[12px] border border-ui-border rounded px-2 py-1">
          <option value="pass_fail">Pass / Fail</option>
          <option value="measure">Measure</option>
          <option value="visual">Visual</option>
        </select>
        <button onClick={add} disabled={adding || !newName.trim()}
          className="text-[11px] bg-sai-blue text-white px-3 py-1 rounded font-semibold hover:opacity-90 disabled:opacity-40">
          + Add check
        </button>
      </div>
    </div>
  );
}


function QCRow({ qc, onChange }: { qc: QualityCheck; onChange: () => void | Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const update = async (patch: Partial<{ result: QualityResult; measured_value: string; notes: string; performed_by: string }>) => {
    setBusy(true);
    try { await api.manufacturing.qc.update(qc.id, patch); await onChange(); }
    catch (e: any) { alert("Update failed: " + (e?.message || e)); }
    finally { setBusy(false); }
  };
  const del = async () => {
    if (!confirm(`Delete QC "${qc.name}"?`)) return;
    setBusy(true);
    try { await api.manufacturing.qc.delete(qc.id); await onChange(); }
    catch (e: any) { alert("Delete failed: " + (e?.message || e)); }
    finally { setBusy(false); }
  };

  const resultBadge: Record<string, string> = {
    "":     "bg-slate-100 text-slate-500",
    pass:   "bg-emerald-100 text-emerald-700",
    fail:   "bg-red-100 text-red-700",
  };

  return (
    <li className="py-2 flex items-center gap-2 text-[12px]">
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-sai-navy truncate">{qc.name}</div>
        <div className="text-[10px] text-slate-500">
          {qc.kind.replace("_", " ")}{qc.performed_by ? ` · by ${qc.performed_by}` : ""}{qc.performed_at ? ` · ${new Date(qc.performed_at).toLocaleDateString("en-ZA")}` : ""}
        </div>
      </div>
      {qc.kind === "measure" && (
        <input value={qc.measured_value} onChange={(e) => update({ measured_value: e.target.value })}
          placeholder="value"
          className="w-24 text-[11px] border border-ui-border rounded px-1 py-0.5" />
      )}
      <span className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded font-semibold ${resultBadge[qc.result]}`}>
        {qc.result || "pending"}
      </span>
      <button onClick={() => update({ result: "pass" })} disabled={busy || qc.result === "pass"}
        className="text-[10px] border border-emerald-300 text-emerald-700 px-2 py-0.5 rounded hover:bg-emerald-50 disabled:opacity-40">
        Pass
      </button>
      <button onClick={() => update({ result: "fail" })} disabled={busy || qc.result === "fail"}
        className="text-[10px] border border-red-300 text-red-600 px-2 py-0.5 rounded hover:bg-red-50 disabled:opacity-40">
        Fail
      </button>
      <button onClick={() => update({ result: "" })} disabled={busy || qc.result === ""}
        className="text-[10px] text-slate-400 hover:text-slate-700 disabled:opacity-40">
        Reset
      </button>
      <button onClick={del} disabled={busy} className="text-slate-400 hover:text-red-600 text-[14px]">×</button>
    </li>
  );
}

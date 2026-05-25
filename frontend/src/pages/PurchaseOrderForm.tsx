/**
 * Purchase Order edit / receive page.
 *
 * Modes:
 *   - /purchase-orders/new   → blank draft form, supplier picker required
 *   - /purchase-orders/:id   → resolves the PO and renders the right
 *                              UI based on status (draft = editable
 *                              fields + lines; confirmed = read-only
 *                              fields + receive panel; received /
 *                              cancelled = read-only summary).
 *
 * No Studio block split here — this page is a workspace, not a
 * dashboard. The kanban page is where Studio toggles apply.
 */

import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  api,
  type Item,
  type PurchaseLineDraft,
  type PurchaseOrder,
  type ReceiptLineInput,
  type Supplier,
} from "../api";


type LineRow = PurchaseLineDraft & { id?: number; received_qty?: number; line_total?: number };


export default function PurchaseOrderForm() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNew = id === "new";
  const poId = isNew ? null : Number(id);

  const [po, setPo] = useState<PurchaseOrder | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(!isNew);

  // Draft form state (separate from saved server state so we don't fire
  // a PUT on every keystroke).
  const [supplierId, setSupplierId] = useState<number | "">("");
  const [expectedDate, setExpectedDate] = useState<string>("");
  const [currency, setCurrency] = useState("ZAR");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineRow[]>([]);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);

  // Receipt-builder state (visible only when status=confirmed)
  const [recvNotes, setRecvNotes] = useState("");
  const [recvDeltas, setRecvDeltas] = useState<Record<number, number>>({});

  useEffect(() => {
    api.suppliers.list().then(setSuppliers).catch(() => {});
    api.items.list().then(setItems).catch(() => {});
  }, []);

  useEffect(() => {
    if (isNew) return;
    if (!poId || Number.isNaN(poId)) return;
    setLoading(true);
    api.purchaseOrders
      .get(poId)
      .then((p) => {
        setPo(p);
        setSupplierId(p.supplier_id);
        setExpectedDate(p.expected_date ?? "");
        setCurrency(p.currency);
        setNotes(p.notes);
        setLines(p.lines.map((ln) => ({ ...ln })));
      })
      .finally(() => setLoading(false));
  }, [isNew, poId]);

  const supplierName = (sid: number) =>
    suppliers.find((s) => s.id === sid)?.name ?? `Supplier #${sid}`;

  const total = useMemo(
    () => lines.reduce((a, ln) => a + Number(ln.quantity || 0) * Number(ln.unit_cost || 0), 0),
    [lines],
  );

  const editable = !po || po.status === "draft";

  const updateLine = (idx: number, patch: Partial<LineRow>) => {
    setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
    setDirty(true);
  };
  const addLine = () => {
    setLines((ls) => [
      ...ls,
      {
        item_id: items[0]?.id ?? null,
        sequence: ls.length,
        description: "",
        quantity: 1,
        unit_of_measure: "each",
        unit_cost: 0,
        supplier_code: "",
      },
    ]);
    setDirty(true);
  };
  const removeLine = (idx: number) => {
    setLines((ls) => ls.filter((_, i) => i !== idx));
    setDirty(true);
  };
  const pickItem = (idx: number, itemId: number) => {
    const it = items.find((x) => x.id === itemId);
    if (!it) return updateLine(idx, { item_id: itemId });
    updateLine(idx, {
      item_id: itemId,
      description: it.name,
      unit_of_measure: it.unit_of_measure || "each",
      unit_cost: lines[idx].unit_cost || it.default_rate,
    });
  };

  const save = async () => {
    if (supplierId === "") {
      alert("Pick a supplier first.");
      return;
    }
    setBusy(true);
    try {
      const linePayload: PurchaseLineDraft[] = lines.map((ln, i) => ({
        item_id: ln.item_id ?? null,
        sequence: i,
        description: ln.description ?? "",
        quantity: Number(ln.quantity) || 0,
        unit_of_measure: ln.unit_of_measure ?? "each",
        unit_cost: Number(ln.unit_cost) || 0,
        supplier_code: ln.supplier_code ?? "",
      }));
      if (isNew) {
        const created = await api.purchaseOrders.create({
          supplier_id: Number(supplierId),
          expected_date: expectedDate || null,
          currency,
          notes,
          lines: linePayload,
        });
        navigate(`/purchase-orders/${created.id}`, { replace: true });
      } else if (poId) {
        await api.purchaseOrders.update(poId, {
          supplier_id: Number(supplierId),
          expected_date: expectedDate || null,
          currency,
          notes,
        });
        const updated = await api.purchaseOrders.replaceLines(poId, linePayload);
        setPo(updated);
        setLines(updated.lines.map((ln) => ({ ...ln })));
        setDirty(false);
      }
    } catch (e: any) {
      alert("Save failed: " + (e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  const confirmPo = async () => {
    if (!po) return;
    if (dirty) {
      if (!confirm("You have unsaved line changes. Confirming will use the last-saved state. Continue?")) return;
    } else if (!confirm("Confirm this PO and send it to the supplier?")) return;
    setBusy(true);
    try {
      const updated = await api.purchaseOrders.confirm(po.id);
      setPo(updated);
      setLines(updated.lines.map((ln) => ({ ...ln })));
    } catch (e: any) {
      alert("Confirm failed: " + (e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  const cancelPo = async () => {
    if (!po) return;
    if (!confirm(`Cancel ${po.ref}? This is irreversible (you can re-create a new PO from scratch).`)) return;
    setBusy(true);
    try {
      const updated = await api.purchaseOrders.cancel(po.id);
      setPo(updated);
    } catch (e: any) {
      alert("Cancel failed: " + (e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  const deletePo = async () => {
    if (!po) return;
    if (!confirm(`Delete ${po.ref}? Drafts can be re-created from scratch.`)) return;
    setBusy(true);
    try {
      await api.purchaseOrders.delete(po.id);
      navigate("/purchase-orders", { replace: true });
    } catch (e: any) {
      alert("Delete failed: " + (e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  const recordReceipt = async () => {
    if (!po) return;
    const payload: ReceiptLineInput[] = Object.entries(recvDeltas)
      .filter(([, qty]) => Number(qty) > 0)
      .map(([line_id, qty]) => ({ line_id: Number(line_id), received_qty: Number(qty) }));
    if (payload.length === 0) {
      alert("Enter at least one quantity to record.");
      return;
    }
    setBusy(true);
    try {
      const updated = await api.purchaseOrders.receive(po.id, { notes: recvNotes, lines: payload });
      setPo(updated);
      setLines(updated.lines.map((ln) => ({ ...ln })));
      setRecvDeltas({});
      setRecvNotes("");
    } catch (e: any) {
      alert("Receive failed: " + (e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <div className="px-4 py-8 text-[12px] text-slate-400 italic">Loading…</div>;
  }

  const statusBadge = po?.status ? (
    <span
      className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded font-semibold ${
        po.status === "draft" ? "bg-slate-200 text-slate-700"
          : po.status === "confirmed" ? "bg-blue-100 text-blue-700"
          : po.status === "received" ? "bg-emerald-100 text-emerald-700"
          : "bg-red-100 text-red-700"
      }`}
    >
      {po.status}
    </span>
  ) : null;

  return (
    <div className="min-h-[calc(100vh-44px)]">
      <div className="bg-white border-b border-ui-border px-4 py-2 flex items-center gap-3">
        <Link to="/" className="text-[12px] text-slate-500 hover:text-sai-navy">← Apps</Link>
        <div className="text-slate-300">/</div>
        <Link to="/purchase-orders" className="text-[12px] text-slate-500 hover:text-sai-navy">Purchase Orders</Link>
        <div className="text-slate-300">/</div>
        <div className="text-[13px] font-semibold text-sai-navy font-display">
          {isNew ? "New PO" : po?.ref ?? "PO"}
        </div>
        {statusBadge}
        <div className="flex-1" />
        {!isNew && po && po.status === "draft" && (
          <>
            <button onClick={deletePo} disabled={busy}
              className="text-[11px] text-red-600 hover:text-red-700 underline disabled:opacity-40">
              Delete draft
            </button>
            <button onClick={confirmPo} disabled={busy || lines.length === 0}
              className="text-[11px] border border-sai-blue text-sai-blue px-3 py-1 rounded font-semibold hover:bg-sai-bluepale disabled:opacity-40">
              Confirm + send
            </button>
          </>
        )}
        {!isNew && po && (po.status === "draft" || po.status === "confirmed") && (
          <button onClick={cancelPo} disabled={busy}
            className="text-[11px] text-red-600 hover:text-red-700 underline disabled:opacity-40">
            Cancel PO
          </button>
        )}
        {editable && (
          <button onClick={save} disabled={busy || (supplierId === "")}
            className="text-[11px] bg-sai-blue text-white px-3 py-1 rounded font-semibold hover:opacity-90 disabled:opacity-40">
            {busy ? "Saving…" : isNew ? "Create" : (dirty ? "Save" : "Saved")}
          </button>
        )}
      </div>

      <div className="px-4 py-4 max-w-6xl mx-auto space-y-4">
        {/* Header card */}
        <div className="bg-white border border-ui-border rounded-md p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <div className="field-label">Supplier *</div>
            <select
              className="field-value"
              value={supplierId}
              onChange={(e) => { setSupplierId(Number(e.target.value)); setDirty(true); }}
              disabled={!editable}
            >
              <option value="">— pick a supplier —</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            {!editable && po && (
              <div className="text-[10px] text-slate-500 mt-1">{supplierName(po.supplier_id)}</div>
            )}
          </div>
          <div>
            <div className="field-label">Expected delivery</div>
            <input
              type="date"
              className="field-value"
              value={expectedDate}
              onChange={(e) => { setExpectedDate(e.target.value); setDirty(true); }}
              disabled={!editable}
            />
          </div>
          <div>
            <div className="field-label">Currency</div>
            <input
              className="field-value font-mono uppercase"
              value={currency}
              onChange={(e) => { setCurrency(e.target.value.toUpperCase().slice(0, 8)); setDirty(true); }}
              disabled={!editable}
            />
          </div>
          <div className="md:col-span-3">
            <div className="field-label">Notes</div>
            <textarea
              className="field-value min-h-[60px] resize-y"
              value={notes}
              onChange={(e) => { setNotes(e.target.value); setDirty(true); }}
              disabled={!editable}
              placeholder="Internal notes — visible on the printed PO if you include them in the template."
            />
          </div>
        </div>

        {/* Lines */}
        <div className="bg-white border border-ui-border rounded-md">
          <div className="px-4 py-2.5 border-b border-ui-border flex items-center">
            <div className="text-[13px] font-semibold text-sai-navy">Lines</div>
            <div className="flex-1" />
            {editable && (
              <button
                type="button"
                onClick={addLine}
                disabled={items.length === 0}
                className="text-[11px] text-sai-blue hover:underline font-semibold disabled:opacity-40"
              >
                + Add line
              </button>
            )}
          </div>
          <table className="w-full text-[12px]">
            <thead className="bg-slate-50 border-b border-ui-border">
              <tr className="text-left text-[10px] uppercase tracking-wider text-slate-500">
                <th className="px-3 py-2 font-semibold">Item</th>
                <th className="px-3 py-2 font-semibold">Description</th>
                <th className="px-3 py-2 font-semibold">Supplier code</th>
                <th className="px-3 py-2 font-semibold text-right">Qty</th>
                <th className="px-3 py-2 font-semibold">UoM</th>
                <th className="px-3 py-2 font-semibold text-right">Unit cost</th>
                <th className="px-3 py-2 font-semibold text-right">Line total</th>
                <th className="px-3 py-2 font-semibold text-right">Received</th>
                {editable && <th />}
              </tr>
            </thead>
            <tbody>
              {lines.map((ln, i) => (
                <tr key={i} className="border-b border-ui-border last:border-0">
                  <td className="px-3 py-1.5">
                    <select
                      className="w-full text-[11px] border border-ui-border rounded px-1 py-0.5 disabled:bg-slate-50"
                      value={ln.item_id ?? ""}
                      onChange={(e) => pickItem(i, Number(e.target.value))}
                      disabled={!editable}
                    >
                      <option value="">—</option>
                      {items.map((it) => (
                        <option key={it.id} value={it.id}>{it.code} · {it.name}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-1.5">
                    <input
                      className="w-full text-[11px] border border-ui-border rounded px-1 py-0.5 disabled:bg-slate-50"
                      value={ln.description ?? ""}
                      onChange={(e) => updateLine(i, { description: e.target.value })}
                      disabled={!editable}
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <input
                      className="w-full text-[11px] border border-ui-border rounded px-1 py-0.5 disabled:bg-slate-50"
                      value={ln.supplier_code ?? ""}
                      onChange={(e) => updateLine(i, { supplier_code: e.target.value })}
                      disabled={!editable}
                    />
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    <input
                      type="number"
                      step={0.01}
                      className="w-20 text-[11px] text-right border border-ui-border rounded px-1 py-0.5 disabled:bg-slate-50"
                      value={ln.quantity ?? 0}
                      onChange={(e) => updateLine(i, { quantity: Number(e.target.value) })}
                      disabled={!editable}
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <input
                      className="w-16 text-[11px] border border-ui-border rounded px-1 py-0.5 disabled:bg-slate-50"
                      value={ln.unit_of_measure ?? "each"}
                      onChange={(e) => updateLine(i, { unit_of_measure: e.target.value })}
                      disabled={!editable}
                    />
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    <input
                      type="number"
                      step={0.01}
                      className="w-24 text-[11px] text-right border border-ui-border rounded px-1 py-0.5 disabled:bg-slate-50"
                      value={ln.unit_cost ?? 0}
                      onChange={(e) => updateLine(i, { unit_cost: Number(e.target.value) })}
                      disabled={!editable}
                    />
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums font-semibold text-sai-blue">
                    {(Number(ln.quantity || 0) * Number(ln.unit_cost || 0)).toLocaleString("en-ZA", { maximumFractionDigits: 2 })}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-slate-600">
                    {(ln.received_qty ?? 0).toLocaleString("en-ZA")} / {ln.quantity}
                  </td>
                  {editable && (
                    <td className="px-2 py-1.5 text-right">
                      <button onClick={() => removeLine(i)} className="text-slate-400 hover:text-red-600 text-[14px]">×</button>
                    </td>
                  )}
                </tr>
              ))}
              {lines.length === 0 && (
                <tr>
                  <td colSpan={editable ? 9 : 8} className="px-3 py-6 text-center text-[11px] text-slate-400 italic">
                    No lines yet. {editable ? "Click + Add line to start." : ""}
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot className="border-t-2 border-ui-border bg-slate-50">
              <tr>
                <td colSpan={6} className="px-3 py-2 text-right text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
                  Total
                </td>
                <td className="px-3 py-2 text-right tabular-nums font-bold text-sai-navy text-[13px]">
                  {currency} {total.toLocaleString("en-ZA", { maximumFractionDigits: 2 })}
                </td>
                <td />
                {editable && <td />}
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Receipt panel (only when confirmed) */}
        {po?.status === "confirmed" && (
          <div className="bg-white border border-ui-border rounded-md">
            <div className="px-4 py-2.5 border-b border-ui-border">
              <div className="text-[13px] font-semibold text-sai-navy">Record a delivery</div>
              <div className="text-[10px] text-slate-500">
                Enter the qty received in THIS event for each line. Leave blank for lines that
                weren't in this shipment. When every line is fully received the PO closes.
              </div>
            </div>
            <div className="px-4 py-3 space-y-2">
              {po.lines.map((ln) => {
                const remaining = ln.quantity - ln.received_qty;
                return (
                  <div key={ln.id} className="flex items-center gap-3 border border-ui-border rounded p-2 bg-slate-50">
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] font-semibold text-sai-navy truncate">
                        {ln.description || "(no description)"}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        Ordered {ln.quantity} {ln.unit_of_measure} · already received {ln.received_qty} · remaining <b>{remaining}</b>
                      </div>
                    </div>
                    <input
                      type="number"
                      min={0}
                      max={remaining}
                      step={0.01}
                      placeholder="0"
                      value={recvDeltas[ln.id] ?? ""}
                      onChange={(e) => setRecvDeltas((d) => ({ ...d, [ln.id]: Number(e.target.value) || 0 }))}
                      disabled={remaining <= 0}
                      className="w-24 text-[12px] text-right border border-ui-border rounded px-2 py-1 disabled:bg-slate-100"
                    />
                  </div>
                );
              })}
              <textarea
                className="field-value min-h-[40px] resize-y"
                placeholder="Notes for this delivery (waybill #, condition, etc.)"
                value={recvNotes}
                onChange={(e) => setRecvNotes(e.target.value)}
              />
              <div className="flex justify-end">
                <button
                  onClick={recordReceipt}
                  disabled={busy}
                  className="text-[12px] bg-sai-blue text-white px-4 py-1.5 rounded font-semibold hover:opacity-90 disabled:opacity-40"
                >
                  {busy ? "Recording…" : "Record receipt"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Receipts history (when any) */}
        {!isNew && po && po.status !== "draft" && (po.received_at || po.status === "confirmed") && (
          <ReceiptHistory poId={po.id} />
        )}
      </div>
    </div>
  );
}


function ReceiptHistory({ poId }: { poId: number }) {
  const [receipts, setReceipts] = useState<{ id: number; received_at: string; notes: string; lines_json: string }[]>([]);
  useEffect(() => {
    api.purchaseOrders.receipts(poId).then(setReceipts).catch(() => {});
  }, [poId]);
  if (receipts.length === 0) return null;
  return (
    <div className="bg-white border border-ui-border rounded-md">
      <div className="px-4 py-2.5 border-b border-ui-border text-[13px] font-semibold text-sai-navy">
        Receipts ({receipts.length})
      </div>
      <div className="px-4 py-3 space-y-2">
        {receipts.map((r) => {
          let lines: { line_id: number; received_qty: number }[] = [];
          try { lines = JSON.parse(r.lines_json || "[]"); } catch {}
          return (
            <div key={r.id} className="border border-ui-border rounded p-2 bg-slate-50 text-[11px]">
              <div className="text-slate-500">
                {new Date(r.received_at).toLocaleString("en-ZA")} {r.notes ? ` · ${r.notes}` : ""}
              </div>
              <div className="mt-1 text-slate-700">
                {lines.map((l) => `line ${l.line_id}: +${l.received_qty}`).join(" · ")}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

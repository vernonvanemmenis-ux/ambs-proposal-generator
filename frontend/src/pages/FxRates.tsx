import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, type FxRate } from "../api";
import PageRenderer from "../components/PageRenderer";
import RightDrawer, { DrawerCloseButton } from "../components/RightDrawer";
import { fxRatesRegistry, type FxRatesCtx } from "../blocks/fx_rates";


export default function FxRates() {
  const [rates, setRates] = useState<FxRate[]>([]);
  const [editing, setEditing] = useState<Partial<FxRate> | null>(null);

  const load = () => { api.fxRates.list(true).then(setRates).catch(() => {}); };
  useEffect(load, []);

  const ctx: FxRatesCtx = useMemo(
    () => ({
      rates,
      onEdit: (r) => setEditing(r ? { ...r } : {
        from_currency: "USD", to_currency: "ZAR", rate: 18.0, active: true, notes: "",
      }),
    }),
    [rates],
  );

  return (
    <div className="min-h-[calc(100vh-44px)]">
      <div className="bg-white border-b border-ui-border px-4 py-2 flex items-center gap-3">
        <Link to="/" className="text-[12px] text-slate-500 hover:text-sai-navy">← Apps</Link>
        <div className="text-slate-300">/</div>
        <Link to="/reports" className="text-[12px] text-slate-500 hover:text-sai-navy">Reports</Link>
        <div className="text-slate-300">/</div>
        <div className="text-[13px] font-semibold text-sai-navy font-display">FX Rates</div>
        <div className="flex-1" />
        <button onClick={() => ctx.onEdit(null)}
          className="text-[11px] bg-sai-blue text-white px-3 py-1.5 rounded font-semibold hover:opacity-90">
          + New rate
        </button>
      </div>
      <PageRenderer<FxRatesCtx>
        pageKey="fx_rates"
        registry={fxRatesRegistry}
        ctx={ctx}
      />
      {editing && <FxDrawer draft={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </div>
  );
}


function FxDrawer({ draft, onClose, onSaved }: {
  draft: Partial<FxRate>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [fromC, setFromC] = useState(draft.from_currency ?? "USD");
  const [toC, setToC] = useState(draft.to_currency ?? "ZAR");
  const [rate, setRate] = useState(Number(draft.rate ?? 1));
  const [effective, setEffective] = useState(draft.effective_date ?? "");
  const [notes, setNotes] = useState(draft.notes ?? "");
  const [active, setActive] = useState(draft.active ?? true);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!fromC || !toC || fromC === toC || rate <= 0) return;
    setBusy(true);
    try {
      const body = {
        from_currency: fromC, to_currency: toC, rate,
        effective_date: effective || null,
        notes, active,
      };
      if (draft.id) await api.fxRates.update(draft.id, body);
      else await api.fxRates.create(body);
      onSaved();
    } catch (e: any) { alert("Save failed: " + (e?.message || e)); }
    finally { setBusy(false); }
  };

  const remove = async () => {
    if (!draft.id) return;
    if (!confirm("Delete this FX rate?")) return;
    setBusy(true);
    try { await api.fxRates.delete(draft.id); onSaved(); }
    catch (e: any) { alert("Delete failed: " + (e?.message || e)); }
    finally { setBusy(false); }
  };

  return (
    <RightDrawer drawerKey="fx-editor" defaultWidth={400} minWidth={340} closeOnBackdropClick={false} onClose={onClose}>
      <div className="px-5 py-3 border-b border-ui-border flex items-center">
        <div className="text-[14px] font-display font-bold text-sai-navy">{draft.id ? "Edit FX rate" : "New FX rate"}</div>
        <div className="flex-1" />
        <DrawerCloseButton onClose={onClose} />
      </div>
      <div className="flex-1 overflow-y-auto scroll-thin px-5 py-4 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <div className="field-label">From *</div>
            <input className="field-value font-mono uppercase" maxLength={8}
              value={fromC} onChange={(e) => setFromC(e.target.value.toUpperCase())} />
          </div>
          <div>
            <div className="field-label">To *</div>
            <input className="field-value font-mono uppercase" maxLength={8}
              value={toC} onChange={(e) => setToC(e.target.value.toUpperCase())} />
          </div>
        </div>
        <div>
          <div className="field-label">Rate (1 {fromC} = ? {toC}) *</div>
          <input type="number" min={0} step={0.0001} className="field-value tabular-nums"
            value={rate} onChange={(e) => setRate(Number(e.target.value) || 0)} />
        </div>
        <div>
          <div className="field-label">Effective from</div>
          <input type="date" className="field-value"
            value={effective ?? ""} onChange={(e) => setEffective(e.target.value)} />
        </div>
        <div>
          <div className="field-label">Notes</div>
          <textarea className="field-value min-h-[60px] resize-y" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <label className="flex items-center gap-2 text-[12px] text-slate-700">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          Active
        </label>
      </div>
      <div className="px-5 py-3 border-t border-ui-border flex items-center gap-2">
        {draft.id && (
          <button onClick={remove} disabled={busy} className="text-[11px] text-red-600 hover:text-red-700 underline disabled:opacity-40">
            Delete
          </button>
        )}
        <div className="flex-1" />
        <button onClick={onClose} className="text-[12px] px-3 py-1.5 text-slate-500 hover:text-slate-800">Cancel</button>
        <button onClick={save} disabled={busy || !fromC || !toC || fromC === toC || rate <= 0}
          className="text-[12px] bg-sai-blue text-white px-4 py-1.5 rounded font-semibold hover:opacity-90 disabled:opacity-40">
          {busy ? "Saving…" : draft.id ? "Save" : "Create"}
        </button>
      </div>
    </RightDrawer>
  );
}

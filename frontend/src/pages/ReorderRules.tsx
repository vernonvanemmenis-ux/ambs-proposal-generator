import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  api,
  type Item,
  type Quant,
  type ReorderRule,
  type ReorderTriggerResult,
  type StockLocation,
} from "../api";
import PageRenderer from "../components/PageRenderer";
import RightDrawer, { DrawerCloseButton } from "../components/RightDrawer";
import { reorderRulesRegistry, type ReorderCtx } from "../blocks/reorder_rules";


export default function ReorderRulesPage() {
  const [rules, setRules] = useState<ReorderRule[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [quants, setQuants] = useState<Quant[]>([]);
  const [editing, setEditing] = useState<Partial<ReorderRule> | null>(null);
  const [triggerBusy, setTriggerBusy] = useState(false);
  const [lastTrigger, setLastTrigger] = useState<ReorderTriggerResult | null>(null);

  const load = () => {
    api.inventory.reorderRules.list(true).then(setRules).catch(() => {});
    api.items.list().then(setItems).catch(() => {});
    api.inventory.locations.list({ kind: "internal" }).then(setLocations).catch(() => {});
    api.inventory.quants().then(setQuants).catch(() => {});
  };
  useEffect(load, []);

  const onHandLookup = (item_id: number, location_id: number) =>
    quants
      .filter((q) => q.item_id === item_id && q.location_id === location_id)
      .reduce((a, q) => a + q.qty, 0);

  const onTrigger = async () => {
    setTriggerBusy(true);
    try {
      const res = await api.inventory.reorderRules.trigger();
      setLastTrigger(res);
      load();
    } catch (e: any) {
      alert("Trigger failed: " + (e?.message || e));
    } finally {
      setTriggerBusy(false);
    }
  };

  const ctx: ReorderCtx = useMemo(
    () => ({
      rules,
      items,
      locations,
      onHandLookup,
      onEdit: (r) => setEditing(r ? { ...r } : {
        item_id: items[0]?.id ?? 0,
        location_id: locations[0]?.id ?? 0,
        min_qty: 0,
        max_qty: 0,
        qty_multiple: 1,
        active: true,
      }),
      onTrigger,
      triggerBusy,
      lastTrigger,
    }),
    [rules, items, locations, quants, triggerBusy, lastTrigger],
  );

  return (
    <div className="min-h-[calc(100vh-44px)]">
      <div className="bg-white border-b border-ui-border px-4 py-2 flex items-center gap-3">
        <Link to="/" className="text-[12px] text-slate-500 hover:text-sai-navy">← Apps</Link>
        <div className="text-slate-300">/</div>
        <Link to="/inventory" className="text-[12px] text-slate-500 hover:text-sai-navy">Inventory</Link>
        <div className="text-slate-300">/</div>
        <div className="text-[13px] font-semibold text-sai-navy font-display">Reorder Rules</div>
        <div className="flex-1" />
        <button
          onClick={() => ctx.onEdit(null)}
          disabled={items.length === 0 || locations.length === 0}
          className="text-[11px] bg-sai-blue text-white px-3 py-1.5 rounded font-semibold hover:opacity-90 disabled:opacity-40"
        >
          + New rule
        </button>
      </div>
      <PageRenderer<ReorderCtx>
        pageKey="reorder_rules"
        registry={reorderRulesRegistry}
        ctx={ctx}
      />
      {editing && (
        <RuleDrawer
          draft={editing}
          items={items}
          locations={locations}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </div>
  );
}


function RuleDrawer({ draft, items, locations, onClose, onSaved }: {
  draft: Partial<ReorderRule>;
  items: Item[];
  locations: StockLocation[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [itemId, setItemId] = useState<number | "">(draft.item_id ?? "");
  const [locId, setLocId] = useState<number | "">(draft.location_id ?? "");
  const [minQty, setMinQty] = useState<number>(Number(draft.min_qty ?? 0));
  const [maxQty, setMaxQty] = useState<number>(Number(draft.max_qty ?? 0));
  const [mult, setMult] = useState<number>(Number(draft.qty_multiple ?? 1));
  const [active, setActive] = useState<boolean>(draft.active ?? true);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (itemId === "" || locId === "") return;
    if (maxQty < minQty) { alert("max_qty must be >= min_qty."); return; }
    if (mult <= 0) { alert("qty_multiple must be > 0."); return; }
    setBusy(true);
    try {
      const body = {
        item_id: Number(itemId),
        location_id: Number(locId),
        min_qty: Number(minQty),
        max_qty: Number(maxQty),
        qty_multiple: Number(mult),
        active,
      };
      if (draft.id) {
        await api.inventory.reorderRules.update(draft.id, body);
      } else {
        await api.inventory.reorderRules.create(body);
      }
      onSaved();
    } catch (e: any) {
      alert("Save failed: " + (e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!draft.id) return;
    if (!confirm("Delete this reorder rule? This is irreversible.")) return;
    setBusy(true);
    try {
      await api.inventory.reorderRules.delete(draft.id);
      onSaved();
    } catch (e: any) {
      alert("Delete failed: " + (e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <RightDrawer drawerKey="rule-editor" defaultWidth={460} minWidth={400} closeOnBackdropClick={false} onClose={onClose}>
      <div className="px-5 py-3 border-b border-ui-border flex items-center">
        <div className="text-[14px] font-display font-bold text-sai-navy">
          {draft.id ? "Edit reorder rule" : "New reorder rule"}
        </div>
        <div className="flex-1" />
        <DrawerCloseButton onClose={onClose} />
      </div>
      <div className="flex-1 overflow-y-auto scroll-thin px-5 py-4 space-y-3">
        <div>
          <div className="field-label">Item *</div>
          <select className="field-value" value={itemId} onChange={(e) => setItemId(Number(e.target.value))}>
            <option value="">—</option>
            {items.map((it) => <option key={it.id} value={it.id}>{it.code} · {it.name}</option>)}
          </select>
        </div>
        <div>
          <div className="field-label">Location (internal) *</div>
          <select className="field-value" value={locId} onChange={(e) => setLocId(Number(e.target.value))}>
            <option value="">—</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <div className="field-label">Min qty</div>
            <input type="number" min={0} step={0.01} className="field-value" value={minQty} onChange={(e) => setMinQty(Number(e.target.value) || 0)} />
          </div>
          <div>
            <div className="field-label">Max qty</div>
            <input type="number" min={0} step={0.01} className="field-value" value={maxQty} onChange={(e) => setMaxQty(Number(e.target.value) || 0)} />
          </div>
          <div>
            <div className="field-label">Qty multiple</div>
            <input type="number" min={0} step={0.01} className="field-value" value={mult} onChange={(e) => setMult(Number(e.target.value) || 1)} />
          </div>
        </div>
        <div className="text-[10px] text-slate-400">
          Trigger refills toward <b>max</b> when on-hand drops below <b>min</b>. Order quantity rounds UP to <b>multiple</b>.
        </div>
        <label className="flex items-center gap-2 text-[12px] text-slate-700">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          Active
        </label>
      </div>
      <div className="px-5 py-3 border-t border-ui-border flex items-center gap-2">
        {draft.id && (
          <button onClick={remove} disabled={busy} className="text-[11px] text-red-600 hover:text-red-700 underline disabled:opacity-40">
            Delete rule
          </button>
        )}
        <div className="flex-1" />
        <button onClick={onClose} className="text-[12px] px-3 py-1.5 text-slate-500 hover:text-slate-800">Cancel</button>
        <button onClick={save} disabled={busy || itemId === "" || locId === ""}
          className="text-[12px] bg-sai-blue text-white px-4 py-1.5 rounded font-semibold hover:opacity-90 disabled:opacity-40">
          {busy ? "Saving…" : draft.id ? "Save" : "Create"}
        </button>
      </div>
    </RightDrawer>
  );
}

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  api,
  type Item,
  type LocationKind,
  type StockLocation,
  type StockMove,
} from "../api";
import PageRenderer from "../components/PageRenderer";
import RightDrawer, { DrawerCloseButton } from "../components/RightDrawer";
import { stockTransfersRegistry, type TransfersCtx } from "../blocks/stock_transfers";


export default function StockTransfers() {
  const [moves, setMoves] = useState<StockMove[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [adding, setAdding] = useState(false);

  const load = () => {
    api.inventory.moves.list({ limit: 200 }).then(setMoves).catch(() => {});
    api.items.list().then(setItems).catch(() => {});
    api.inventory.locations.list({ include_inactive: false }).then(setLocations).catch(() => {});
  };
  useEffect(load, []);

  const onConfirm = async (m: StockMove) => {
    try { await api.inventory.moves.confirm(m.id); load(); }
    catch (e: any) { alert("Confirm failed: " + (e?.message || e)); }
  };
  const onDone = async (m: StockMove) => {
    try { await api.inventory.moves.done(m.id); load(); }
    catch (e: any) { alert("Done failed: " + (e?.message || e)); }
  };
  const onCancel = async (m: StockMove) => {
    if (!confirm(`Cancel move M-${String(m.id).padStart(5, "0")}?`)) return;
    try { await api.inventory.moves.cancel(m.id); load(); }
    catch (e: any) { alert("Cancel failed: " + (e?.message || e)); }
  };

  const ctx: TransfersCtx = useMemo(
    () => ({ moves, items, locations, onConfirm, onDone, onCancel, onNew: () => setAdding(true) }),
    [moves, items, locations],
  );

  return (
    <div className="min-h-[calc(100vh-44px)]">
      <div className="bg-white border-b border-ui-border px-4 py-2 flex items-center gap-3">
        <Link to="/" className="text-[12px] text-slate-500 hover:text-sai-navy">← Apps</Link>
        <div className="text-slate-300">/</div>
        <Link to="/inventory" className="text-[12px] text-slate-500 hover:text-sai-navy">Inventory</Link>
        <div className="text-slate-300">/</div>
        <div className="text-[13px] font-semibold text-sai-navy font-display">Stock Transfers</div>
        <div className="flex-1" />
        <button
          onClick={() => setAdding(true)}
          disabled={items.length === 0 || locations.length < 2}
          className="text-[11px] bg-sai-blue text-white px-3 py-1.5 rounded font-semibold hover:opacity-90 disabled:opacity-40"
          title={items.length === 0 ? "Create an item first" : locations.length < 2 ? "Create at least two locations first" : "New transfer"}
        >
          + New transfer
        </button>
      </div>
      <PageRenderer<TransfersCtx>
        pageKey="stock_transfers"
        registry={stockTransfersRegistry}
        ctx={ctx}
      />
      {adding && (
        <NewMoveDrawer
          items={items}
          locations={locations}
          onClose={() => setAdding(false)}
          onSaved={() => { setAdding(false); load(); }}
        />
      )}
    </div>
  );
}


function NewMoveDrawer({ items, locations, onClose, onSaved }: {
  items: Item[];
  locations: StockLocation[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [itemId, setItemId] = useState<number | "">(items[0]?.id ?? "");
  const [qty, setQty] = useState<number>(0);
  const [src, setSrc] = useState<number | "">("");
  const [dst, setDst] = useState<number | "">("");
  const [notes, setNotes] = useState("");
  const [immediate, setImmediate] = useState(true);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (itemId === "" || src === "" || dst === "" || qty <= 0) return;
    if (src === dst) {
      alert("Source and destination must differ.");
      return;
    }
    setBusy(true);
    try {
      await api.inventory.moves.create({
        item_id: Number(itemId),
        qty: Number(qty),
        source_location_id: Number(src),
        dest_location_id: Number(dst),
        notes,
      }, immediate);
      onSaved();
    } catch (e: any) {
      alert("Create failed: " + (e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  const kindLabel = (k: LocationKind) => k.charAt(0).toUpperCase() + k.slice(1);

  return (
    <RightDrawer drawerKey="new-move" defaultWidth={440} minWidth={380} closeOnBackdropClick={false} onClose={onClose}>
      <div className="px-5 py-3 border-b border-ui-border flex items-center">
        <div className="text-[14px] font-display font-bold text-sai-navy">New stock transfer</div>
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
          <div className="field-label">Quantity *</div>
          <input type="number" min={0} step={0.01} className="field-value" value={qty} onChange={(e) => setQty(Number(e.target.value) || 0)} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <div className="field-label">From *</div>
            <select className="field-value" value={src} onChange={(e) => setSrc(Number(e.target.value))}>
              <option value="">—</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>{l.name} ({kindLabel(l.kind)})</option>
              ))}
            </select>
          </div>
          <div>
            <div className="field-label">To *</div>
            <select className="field-value" value={dst} onChange={(e) => setDst(Number(e.target.value))}>
              <option value="">—</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>{l.name} ({kindLabel(l.kind)})</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <div className="field-label">Notes</div>
          <textarea className="field-value min-h-[60px] resize-y" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <label className="flex items-center gap-2 text-[12px] text-slate-700">
          <input type="checkbox" checked={immediate} onChange={(e) => setImmediate(e.target.checked)} />
          Mark done immediately (skip draft/confirmed)
        </label>
      </div>
      <div className="px-5 py-3 border-t border-ui-border flex items-center gap-2">
        <div className="flex-1" />
        <button onClick={onClose} className="text-[12px] px-3 py-1.5 text-slate-500 hover:text-slate-800">Cancel</button>
        <button onClick={save} disabled={busy || itemId === "" || src === "" || dst === "" || qty <= 0}
          className="text-[12px] bg-sai-blue text-white px-4 py-1.5 rounded font-semibold hover:opacity-90 disabled:opacity-40">
          {busy ? "Saving…" : "Create"}
        </button>
      </div>
    </RightDrawer>
  );
}

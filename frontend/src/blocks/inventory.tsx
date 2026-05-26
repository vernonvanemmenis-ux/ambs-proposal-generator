/**
 * Inventory landing page — Studio blocks.
 *
 * Four blocks:
 *   inventory_stats   — counts of items / warehouses / internal locations
 *                       + open (non-done) stock-move backlog
 *   low_stock_alerts  — rules where on-hand < min, with a Trigger button
 *   stock_grid        — pivot of on-hand by item × location
 *   recent_moves      — last 25 stock moves
 */

import { useMemo } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { BlockProps } from "../components/PageRenderer";
import type {
  Item,
  Quant,
  ReorderRule,
  ReorderTriggerResult,
  StockLocation,
  StockMove,
  Warehouse,
} from "../api";


export type InventoryCtx = {
  items: Item[];
  warehouses: Warehouse[];
  locations: StockLocation[];
  moves: StockMove[];
  quants: Quant[];
  rules: ReorderRule[];
  onTrigger: () => Promise<ReorderTriggerResult>;
  triggerBusy: boolean;
  lastTrigger: ReorderTriggerResult | null;
};

type Props = BlockProps<InventoryCtx>;


function StatTile({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="bg-white border border-ui-border rounded px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">{label}</div>
      <div className="text-[18px] font-display font-bold text-sai-navy mt-0.5 leading-tight">{value}</div>
      {hint ? <div className="text-[10px] text-slate-400 mt-0.5">{hint}</div> : null}
    </div>
  );
}


export function InventoryStats({ ctx }: Props) {
  const internalLocs = ctx.locations.filter((l) => l.kind === "internal");
  const openMoves = ctx.moves.filter((m) => m.state === "draft" || m.state === "confirmed");
  return (
    <div className="px-4 pt-3 grid grid-cols-4 gap-2">
      <StatTile label="Catalogue items" value={ctx.items.length} />
      <StatTile label="Warehouses" value={ctx.warehouses.length} hint={`${internalLocs.length} internal locations`} />
      <StatTile label="Open moves" value={openMoves.length} hint="draft + confirmed" />
      <StatTile label="Reorder rules" value={ctx.rules.length} hint="active thresholds" />
    </div>
  );
}


export function LowStockAlerts({ ctx }: Props) {
  const itemById: Record<number, Item> = useMemo(() => {
    const m: Record<number, Item> = {};
    for (const it of ctx.items) m[it.id] = it;
    return m;
  }, [ctx.items]);

  const locById: Record<number, StockLocation> = useMemo(() => {
    const m: Record<number, StockLocation> = {};
    for (const l of ctx.locations) m[l.id] = l;
    return m;
  }, [ctx.locations]);

  const onHandFor = (item_id: number, location_id: number) =>
    ctx.quants
      .filter((q) => q.item_id === item_id && q.location_id === location_id)
      .reduce((a, q) => a + q.qty, 0);

  const lowRows = ctx.rules
    .map((r) => ({ rule: r, onHand: onHandFor(r.item_id, r.location_id) }))
    .filter((x) => x.onHand < x.rule.min_qty);

  return (
    <div className="px-4 pt-3">
      <div className="bg-white border border-ui-border rounded-md">
        <div className="px-3 py-2 border-b border-ui-border flex items-center">
          <div className="text-[13px] font-semibold text-sai-navy">Low-stock alerts</div>
          <div className="text-[11px] text-slate-500 ml-2">{lowRows.length} rule{lowRows.length === 1 ? "" : "s"} below threshold</div>
          <div className="flex-1" />
          <button
            onClick={ctx.onTrigger}
            disabled={ctx.triggerBusy || ctx.rules.length === 0}
            className="text-[11px] bg-sai-blue text-white px-3 py-1 rounded font-semibold hover:opacity-90 disabled:opacity-40"
            title="Run all active reorder rules and auto-create draft POs"
          >
            {ctx.triggerBusy ? "Running…" : "↻ Trigger reorder"}
          </button>
        </div>
        {lowRows.length === 0 ? (
          <div className="px-3 py-6 text-center text-[12px] text-slate-400 italic">
            All reorder rules are above their minimum. Nothing to do.
          </div>
        ) : (
          <table className="w-full text-[12px]">
            <thead className="bg-slate-50 border-b border-ui-border text-left text-[10px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-3 py-1.5 font-semibold">Item</th>
                <th className="px-3 py-1.5 font-semibold">Location</th>
                <th className="px-3 py-1.5 font-semibold text-right">On hand</th>
                <th className="px-3 py-1.5 font-semibold text-right">Min</th>
                <th className="px-3 py-1.5 font-semibold text-right">Max</th>
                <th className="px-3 py-1.5 font-semibold text-right">Shortfall</th>
              </tr>
            </thead>
            <tbody>
              {lowRows.map(({ rule, onHand }) => {
                const it = itemById[rule.item_id];
                const loc = locById[rule.location_id];
                const short = rule.max_qty - onHand;
                return (
                  <tr key={rule.id} className="border-b border-ui-border last:border-0">
                    <td className="px-3 py-1.5">
                      {it ? <span className="font-mono text-[11px] text-slate-500">{it.code}</span> : "—"}{" "}
                      <span className="text-sai-navy">{it?.name ?? `Item #${rule.item_id}`}</span>
                    </td>
                    <td className="px-3 py-1.5 text-slate-600">{loc?.name ?? `Loc #${rule.location_id}`}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums font-semibold text-red-600">{onHand}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-slate-500">{rule.min_qty}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-slate-500">{rule.max_qty}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-amber-600">{short}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {ctx.lastTrigger && (
          <div className="px-3 py-2 bg-slate-50 border-t border-ui-border text-[11px] text-slate-600">
            Last run: created <b>{ctx.lastTrigger.created_po_ids.length}</b> draft PO{ctx.lastTrigger.created_po_ids.length === 1 ? "" : "s"}
            {ctx.lastTrigger.created_po_ids.length > 0 && (
              <span> — <Link to="/purchase-orders" className="text-sai-blue hover:underline">open Purchase Orders</Link></span>
            )}
            {ctx.lastTrigger.skipped.length > 0 && (
              <span className="text-slate-400"> · {ctx.lastTrigger.skipped.length} skipped (hover for reasons)</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}


export function StockGrid({ ctx }: Props) {
  const internalLocs = ctx.locations.filter((l) => l.kind === "internal" && l.active);
  const itemById = useMemo(() => {
    const m: Record<number, Item> = {};
    for (const it of ctx.items) m[it.id] = it;
    return m;
  }, [ctx.items]);

  // Pivot: row = item_id, col = location_id
  const pivot: Record<number, Record<number, number>> = {};
  for (const q of ctx.quants) {
    if (!pivot[q.item_id]) pivot[q.item_id] = {};
    pivot[q.item_id][q.location_id] = (pivot[q.item_id][q.location_id] ?? 0) + q.qty;
  }
  const itemIds = Object.keys(pivot).map(Number).filter((iid) => itemById[iid]);
  itemIds.sort((a, b) => (itemById[a]?.code || "").localeCompare(itemById[b]?.code || ""));

  return (
    <div className="px-4 pt-3">
      <div className="bg-white border border-ui-border rounded-md overflow-x-auto">
        <div className="px-3 py-2 border-b border-ui-border text-[13px] font-semibold text-sai-navy">
          On-hand stock <span className="text-[11px] text-slate-500 ml-2">internal locations only — computed from done moves</span>
        </div>
        {internalLocs.length === 0 ? (
          <div className="px-3 py-6 text-center text-[12px] text-slate-400 italic">
            No internal locations yet. Create a warehouse and at least one internal location.
          </div>
        ) : itemIds.length === 0 ? (
          <div className="px-3 py-6 text-center text-[12px] text-slate-400 italic">
            No stock recorded yet. Receive a PO, run a manual transfer, or import an opening balance to populate.
          </div>
        ) : (
          <table className="w-full text-[12px]">
            <thead className="bg-slate-50 border-b border-ui-border text-left text-[10px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-3 py-1.5 font-semibold">Item</th>
                {internalLocs.map((l) => (
                  <th key={l.id} className="px-3 py-1.5 font-semibold text-right">{l.name}</th>
                ))}
                <th className="px-3 py-1.5 font-semibold text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {itemIds.map((iid) => {
                const it = itemById[iid];
                const total = internalLocs.reduce((a, l) => a + (pivot[iid][l.id] ?? 0), 0);
                return (
                  <tr key={iid} className="border-b border-ui-border last:border-0">
                    <td className="px-3 py-1.5">
                      <span className="font-mono text-[11px] text-slate-500">{it.code}</span>{" "}
                      <span className="text-sai-navy">{it.name}</span>
                    </td>
                    {internalLocs.map((l) => {
                      const qty = pivot[iid][l.id] ?? 0;
                      return (
                        <td key={l.id} className={`px-3 py-1.5 text-right tabular-nums ${qty < 0 ? "text-red-600" : qty === 0 ? "text-slate-300" : "text-slate-700"}`}>
                          {qty}
                        </td>
                      );
                    })}
                    <td className="px-3 py-1.5 text-right tabular-nums font-semibold text-sai-blue">{total}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}


export function RecentMoves({ ctx }: Props) {
  const itemById = useMemo(() => {
    const m: Record<number, Item> = {};
    for (const it of ctx.items) m[it.id] = it;
    return m;
  }, [ctx.items]);
  const locById = useMemo(() => {
    const m: Record<number, StockLocation> = {};
    for (const l of ctx.locations) m[l.id] = l;
    return m;
  }, [ctx.locations]);

  const recent = ctx.moves.slice(0, 25);

  return (
    <div className="px-4 pt-3 pb-6">
      <div className="bg-white border border-ui-border rounded-md">
        <div className="px-3 py-2 border-b border-ui-border text-[13px] font-semibold text-sai-navy">
          Recent stock moves
          <span className="text-[11px] text-slate-500 ml-2">last 25 across all items</span>
        </div>
        {recent.length === 0 ? (
          <div className="px-3 py-6 text-center text-[12px] text-slate-400 italic">No moves yet.</div>
        ) : (
          <table className="w-full text-[12px]">
            <thead className="bg-slate-50 border-b border-ui-border text-left text-[10px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-3 py-1.5 font-semibold">When</th>
                <th className="px-3 py-1.5 font-semibold">Item</th>
                <th className="px-3 py-1.5 font-semibold text-right">Qty</th>
                <th className="px-3 py-1.5 font-semibold">From</th>
                <th className="px-3 py-1.5 font-semibold">To</th>
                <th className="px-3 py-1.5 font-semibold">State</th>
                <th className="px-3 py-1.5 font-semibold">Reference</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((m) => {
                const it = itemById[m.item_id];
                return (
                  <tr key={m.id} className="border-b border-ui-border last:border-0">
                    <td className="px-3 py-1.5 text-[10px] text-slate-500">{new Date(m.created_at).toLocaleString("en-ZA")}</td>
                    <td className="px-3 py-1.5">
                      {it ? <><span className="font-mono text-[10px] text-slate-400">{it.code}</span> {it.name}</> : `Item #${m.item_id}`}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums font-semibold text-sai-blue">{m.qty}</td>
                    <td className="px-3 py-1.5 text-slate-600">{locById[m.source_location_id]?.name ?? "—"}</td>
                    <td className="px-3 py-1.5 text-slate-600">{locById[m.dest_location_id]?.name ?? "—"}</td>
                    <td className="px-3 py-1.5">
                      <span className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded font-semibold ${
                        m.state === "done" ? "bg-emerald-100 text-emerald-700"
                          : m.state === "confirmed" ? "bg-blue-100 text-blue-700"
                          : m.state === "cancelled" ? "bg-red-100 text-red-700"
                          : "bg-slate-100 text-slate-600"
                      }`}>{m.state}</span>
                    </td>
                    <td className="px-3 py-1.5 text-[10px] text-slate-500 font-mono">
                      {m.reference_kind ? `${m.reference_kind}${m.reference_id ? `#${m.reference_id}` : ""}` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}


export const inventoryRegistry = {
  inventory_stats: InventoryStats,
  low_stock_alerts: LowStockAlerts,
  stock_grid: StockGrid,
  recent_moves: RecentMoves,
} as const;

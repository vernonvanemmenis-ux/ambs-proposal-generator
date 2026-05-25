/**
 * Reorder rules page — single block: rule_list.
 */

import { useMemo } from "react";
import type { BlockProps } from "../components/PageRenderer";
import type {
  Item,
  ReorderRule,
  ReorderTriggerResult,
  StockLocation,
} from "../api";


export type ReorderCtx = {
  rules: ReorderRule[];
  items: Item[];
  locations: StockLocation[];
  onHandLookup: (item_id: number, location_id: number) => number;
  onEdit: (r: ReorderRule | null) => void;
  onTrigger: () => Promise<void>;
  triggerBusy: boolean;
  lastTrigger: ReorderTriggerResult | null;
};


export function RuleListBlock({ ctx }: BlockProps<ReorderCtx>) {
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

  return (
    <div className="px-4 py-4 space-y-4">
      <div className="bg-white border border-ui-border rounded-md">
        <div className="px-3 py-2 border-b border-ui-border flex items-center">
          <div className="text-[13px] font-semibold text-sai-navy">Reorder rules</div>
          <div className="text-[11px] text-slate-500 ml-2">{ctx.rules.length} rule{ctx.rules.length === 1 ? "" : "s"}</div>
          <div className="flex-1" />
          <button
            onClick={ctx.onTrigger}
            disabled={ctx.triggerBusy || ctx.rules.length === 0}
            className="text-[11px] bg-sai-blue text-white px-3 py-1 rounded font-semibold hover:opacity-90 disabled:opacity-40"
            title="Walk every rule, compute shortfall, create draft POs for items below min."
          >
            {ctx.triggerBusy ? "Running…" : "↻ Trigger reorder"}
          </button>
        </div>
        {ctx.rules.length === 0 ? (
          <div className="px-3 py-6 text-center text-[12px] text-slate-400 italic">
            No reorder rules yet. Click + New rule to set a min/max threshold for an item at a location.
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
                <th className="px-3 py-1.5 font-semibold text-right">Multiple</th>
                <th className="px-3 py-1.5 font-semibold">Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {ctx.rules.map((r) => {
                const it = itemById[r.item_id];
                const loc = locById[r.location_id];
                const onHand = ctx.onHandLookup(r.item_id, r.location_id);
                const below = onHand < r.min_qty;
                return (
                  <tr key={r.id} className="border-b border-ui-border last:border-0">
                    <td className="px-3 py-1.5">
                      {it ? <><span className="font-mono text-[10px] text-slate-400">{it.code}</span> {it.name}</> : `Item #${r.item_id}`}
                    </td>
                    <td className="px-3 py-1.5 text-slate-600">{loc?.name ?? `Loc #${r.location_id}`}</td>
                    <td className={`px-3 py-1.5 text-right tabular-nums ${below ? "text-red-600 font-semibold" : "text-slate-700"}`}>{onHand}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-slate-500">{r.min_qty}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-slate-500">{r.max_qty}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-slate-500">{r.qty_multiple}</td>
                    <td className="px-3 py-1.5">
                      {!r.active ? (
                        <span className="text-[9px] uppercase tracking-wider bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded font-semibold">Inactive</span>
                      ) : below ? (
                        <span className="text-[9px] uppercase tracking-wider bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-semibold">Below min</span>
                      ) : (
                        <span className="text-[9px] uppercase tracking-wider bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-semibold">OK</span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      <button onClick={() => ctx.onEdit(r)} className="text-[10px] text-slate-400 hover:text-sai-blue">Edit</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {ctx.lastTrigger && (
        <div className="bg-white border border-ui-border rounded-md p-3 text-[11px] text-slate-600 space-y-1">
          <div className="font-semibold text-sai-navy">Last trigger run</div>
          <div>Created <b>{ctx.lastTrigger.created_po_ids.length}</b> draft PO{ctx.lastTrigger.created_po_ids.length === 1 ? "" : "s"}.</div>
          {ctx.lastTrigger.skipped.length > 0 && (
            <div>
              <div className="font-semibold text-slate-700 mt-1">Skipped:</div>
              <ul className="list-disc list-inside text-slate-500">
                {ctx.lastTrigger.skipped.map((s, i) => (
                  <li key={i}>{s.rule_id != null ? `rule #${s.rule_id}: ` : ""}{s.reason}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}


export const reorderRulesRegistry = {
  rule_list: RuleListBlock,
} as const;

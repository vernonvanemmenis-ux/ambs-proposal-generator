/**
 * BoMs page — one block: bom_list.
 */

import { useMemo } from "react";
import type { BlockProps } from "../components/PageRenderer";
import type { BoM, Item } from "../api";


export type BomsCtx = {
  boms: BoM[];
  items: Item[];
  onEdit: (b: BoM | null) => void;
};


export function BoMListBlock({ ctx }: BlockProps<BomsCtx>) {
  const itemById = useMemo(() => {
    const m: Record<number, Item> = {};
    for (const it of ctx.items) m[it.id] = it;
    return m;
  }, [ctx.items]);

  return (
    <div className="px-4 py-4">
      <div className="bg-white border border-ui-border rounded-md overflow-hidden">
        <div className="px-3 py-2 border-b border-ui-border text-[13px] font-semibold text-sai-navy">
          Bills of Materials <span className="text-[11px] text-slate-500 ml-2">{ctx.boms.length} total</span>
        </div>
        {ctx.boms.length === 0 ? (
          <div className="px-3 py-6 text-center text-[12px] text-slate-400 italic">
            No BoMs yet. Click + New BoM to define a finished item with components and operations.
          </div>
        ) : (
          <table className="w-full text-[12px]">
            <thead className="bg-slate-50 border-b border-ui-border text-left text-[10px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-3 py-1.5 font-semibold">Code</th>
                <th className="px-3 py-1.5 font-semibold">Finished item</th>
                <th className="px-3 py-1.5 font-semibold">Version</th>
                <th className="px-3 py-1.5 font-semibold text-right">Qty produced</th>
                <th className="px-3 py-1.5 font-semibold text-right">Components</th>
                <th className="px-3 py-1.5 font-semibold text-right">Operations</th>
                <th className="px-3 py-1.5 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {ctx.boms.map((b) => {
                const it = itemById[b.item_id];
                return (
                  <tr key={b.id} onClick={() => ctx.onEdit(b)}
                    className={`border-b border-ui-border last:border-0 hover:bg-ui-rowhover cursor-pointer ${b.active ? "" : "opacity-60"}`}>
                    <td className="px-3 py-1.5 font-mono text-[11px] text-slate-600">{b.code || "—"}</td>
                    <td className="px-3 py-1.5">
                      {it ? <><span className="font-mono text-[10px] text-slate-400">{it.code}</span> {it.name}</> : `Item #${b.item_id}`}
                    </td>
                    <td className="px-3 py-1.5 text-slate-500">{b.version}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{b.qty_produced}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{b.lines.length}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{b.operations.length}</td>
                    <td className="px-3 py-1.5">
                      <span className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded font-semibold ${b.active ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}`}>
                        {b.active ? "Active" : "Inactive"}
                      </span>
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


export const bomsRegistry = {
  bom_list: BoMListBlock,
} as const;

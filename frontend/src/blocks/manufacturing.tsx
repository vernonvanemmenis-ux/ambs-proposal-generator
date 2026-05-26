/**
 * Manufacturing dashboard — Studio blocks.
 *
 * Two blocks for now: mo_stats and mo_kanban. Drag-to-state disabled
 * because transitions need explicit confirmation (reserve/cancel
 * stock side-effects).
 */

import { useMemo } from "react";
import type { ReactNode } from "react";
import KanbanBoard, { type KanbanColumn } from "../components/KanbanBoard";
import type { BlockProps } from "../components/PageRenderer";
import type { BoM, Item, ManufacturingOrder, ManufacturingOrderState } from "../api";


export type ManufacturingCtx = {
  mos: ManufacturingOrder[];
  boms: BoM[];
  items: Item[];
  onCardClick: (mo: MOCard) => void;
};


type MOCard = ManufacturingOrder & { columnId: string };


const STATES: KanbanColumn[] = [
  { id: "draft",       label: "Draft",       color: "#94a3b8" },
  { id: "confirmed",   label: "Confirmed",   color: "#3b82f6" },
  { id: "in_progress", label: "In progress", color: "#f59e0b" },
  { id: "done",        label: "Done",        color: "#10b981" },
  { id: "cancelled",   label: "Cancelled",   color: "#ef4444" },
];


function StatTile({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="bg-white border border-ui-border rounded px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">{label}</div>
      <div className="text-[18px] font-display font-bold text-sai-navy mt-0.5 leading-tight">{value}</div>
      {hint ? <div className="text-[10px] text-slate-400 mt-0.5">{hint}</div> : null}
    </div>
  );
}


export function MOStats({ ctx }: BlockProps<ManufacturingCtx>) {
  const byState: Record<ManufacturingOrderState, ManufacturingOrder[]> = {
    draft: [], confirmed: [], in_progress: [], done: [], cancelled: [],
  };
  for (const m of ctx.mos) byState[m.state].push(m);
  const producedYtd = byState.done.reduce((a, m) => a + m.qty_to_produce, 0);
  return (
    <div className="px-4 pt-3 grid grid-cols-4 gap-2">
      <StatTile label="Draft" value={byState.draft.length} hint="not yet confirmed" />
      <StatTile label="In flight" value={byState.confirmed.length + byState.in_progress.length} hint="confirmed + in_progress" />
      <StatTile label="Produced YTD" value={producedYtd} hint={`${byState.done.length} MOs completed`} />
      <StatTile label="BoMs active" value={ctx.boms.filter((b) => b.active).length} hint={`${ctx.boms.length} total`} />
    </div>
  );
}


export function MOKanban({ ctx }: BlockProps<ManufacturingCtx>) {
  const itemById = useMemo(() => {
    const m: Record<number, Item> = {};
    for (const it of ctx.items) m[it.id] = it;
    return m;
  }, [ctx.items]);
  const bomById = useMemo(() => {
    const m: Record<number, BoM> = {};
    for (const b of ctx.boms) m[b.id] = b;
    return m;
  }, [ctx.boms]);

  const columns: KanbanColumn[] = STATES.map((s) => {
    const inCol = ctx.mos.filter((m) => m.state === s.id);
    const total = inCol.reduce((a, m) => a + m.qty_to_produce, 0);
    return { ...s, meta: `${inCol.length} · ${total} units` };
  });
  const items: MOCard[] = ctx.mos.map((m) => ({ ...m, columnId: m.state }));

  const renderCard = (mo: MOCard) => {
    const bom = bomById[mo.bom_id];
    const finished = bom ? itemById[bom.item_id] : undefined;
    const woDone = mo.work_orders.filter((w) => w.state === "done").length;
    const woTotal = mo.work_orders.length;
    return (
      <div className="kanban-card">
        <div className="text-[11px] text-slate-400 font-mono">{mo.ref}</div>
        <div className="text-[13px] font-semibold text-sai-navy leading-tight">
          {finished?.name ?? `BoM #${mo.bom_id}`}
        </div>
        <div className="text-[11px] text-slate-500 mt-0.5">
          {mo.qty_to_produce} units {bom ? `· BoM ${bom.code || bom.version}` : ""}
        </div>
        {woTotal > 0 && (
          <div className="mt-2">
            <div className="h-1 bg-slate-200 rounded">
              <div className="h-1 bg-sai-blue rounded" style={{ width: `${Math.round((woDone / woTotal) * 100)}%` }} />
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">{woDone} / {woTotal} work orders done</div>
          </div>
        )}
        {mo.scheduled_start && (
          <div className="text-[10px] text-slate-400 mt-1">
            scheduled {new Date(mo.scheduled_start).toLocaleDateString("en-ZA")}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="px-4 pt-2">
      <div className="text-[10px] text-slate-400 italic mb-1">
        Click an MO to open it. Confirm reserves components from inventory; finish produces the finished good.
      </div>
      <KanbanBoard<MOCard>
        columns={columns}
        items={items}
        renderCard={renderCard}
        onMove={() => { /* transitions need explicit confirmation */ }}
        onCardClick={ctx.onCardClick}
        emptyHint="No manufacturing orders in this state"
      />
    </div>
  );
}


export const manufacturingRegistry = {
  mo_stats: MOStats,
  mo_kanban: MOKanban,
} as const;

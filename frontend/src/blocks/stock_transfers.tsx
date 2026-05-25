/**
 * Stock transfers page — single block kanban by state.
 *
 * No drag-to-move yet (state transitions need at least supplier→internal
 * source/dest validation). Click a card to open the receipt-style action
 * panel on the row (confirm / done / cancel buttons).
 */

import { useMemo, useState } from "react";
import type { BlockProps } from "../components/PageRenderer";
import KanbanBoard, { type KanbanColumn } from "../components/KanbanBoard";
import type { Item, StockLocation, StockMove } from "../api";


export type TransfersCtx = {
  moves: StockMove[];
  items: Item[];
  locations: StockLocation[];
  onConfirm: (m: StockMove) => Promise<void>;
  onDone: (m: StockMove) => Promise<void>;
  onCancel: (m: StockMove) => Promise<void>;
  onNew: () => void;
};


const STATES: KanbanColumn[] = [
  { id: "draft",     label: "Draft",     color: "#94a3b8" },
  { id: "confirmed", label: "Confirmed", color: "#3b82f6" },
  { id: "done",      label: "Done",      color: "#10b981" },
  { id: "cancelled", label: "Cancelled", color: "#ef4444" },
];


type MoveCard = StockMove & { columnId: string };


export function TransferKanbanBlock({ ctx }: BlockProps<TransfersCtx>) {
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
  const [busyId, setBusyId] = useState<number | null>(null);

  const columns: KanbanColumn[] = STATES.map((s) => {
    const inCol = ctx.moves.filter((m) => m.state === s.id);
    const total = inCol.reduce((a, b) => a + b.qty, 0);
    return { ...s, meta: `${inCol.length} · ${total.toLocaleString("en-ZA")} units` };
  });
  const items: MoveCard[] = ctx.moves.map((m) => ({ ...m, columnId: m.state }));

  const runAction = async (mv: StockMove, fn: (m: StockMove) => Promise<void>) => {
    setBusyId(mv.id);
    try { await fn(mv); } finally { setBusyId(null); }
  };

  const renderCard = (mv: MoveCard) => {
    const it = itemById[mv.item_id];
    const src = locById[mv.source_location_id]?.name ?? `Loc #${mv.source_location_id}`;
    const dst = locById[mv.dest_location_id]?.name ?? `Loc #${mv.dest_location_id}`;
    return (
      <div className="kanban-card">
        <div className="text-[11px] text-slate-400 font-mono">M-{String(mv.id).padStart(5, "0")}</div>
        <div className="text-[13px] font-semibold text-sai-navy leading-tight">
          {it ? it.name : `Item #${mv.item_id}`}
        </div>
        <div className="text-[11px] text-slate-500 mt-0.5">{src} → {dst}</div>
        <div className="mt-2 flex items-center justify-between">
          <div className="text-[12px] font-bold text-sai-blue">{mv.qty} units</div>
          {mv.reference_kind && (
            <span className="text-[9px] uppercase tracking-wider bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-semibold font-mono">
              {mv.reference_kind}{mv.reference_id ? `#${mv.reference_id}` : ""}
            </span>
          )}
        </div>
        {mv.state !== "done" && mv.state !== "cancelled" && (
          <div className="mt-2 flex gap-1">
            {mv.state === "draft" && (
              <button
                onClick={(e) => { e.stopPropagation(); runAction(mv, ctx.onConfirm); }}
                disabled={busyId === mv.id}
                className="text-[10px] px-2 py-0.5 rounded border border-sai-blue text-sai-blue hover:bg-sai-bluepale disabled:opacity-40"
              >Confirm</button>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); runAction(mv, ctx.onDone); }}
              disabled={busyId === mv.id}
              className="text-[10px] px-2 py-0.5 rounded bg-sai-blue text-white hover:opacity-90 disabled:opacity-40"
            >Done</button>
            <button
              onClick={(e) => { e.stopPropagation(); runAction(mv, ctx.onCancel); }}
              disabled={busyId === mv.id}
              className="text-[10px] px-2 py-0.5 rounded border border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-40"
            >Cancel</button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="px-4 pt-2">
      <div className="text-[10px] text-slate-400 italic mb-1">
        Click <b>Confirm</b> to mark a draft ready to ship; <b>Done</b> to land the move (immutable once done).
      </div>
      <KanbanBoard<MoveCard>
        columns={columns}
        items={items}
        renderCard={renderCard}
        onMove={() => { /* drag-to-state not supported yet */ }}
        onCardClick={() => { /* no detail page yet */ }}
        emptyHint="No moves in this state"
      />
    </div>
  );
}


export const stockTransfersRegistry = {
  transfer_kanban: TransferKanbanBlock,
} as const;

/**
 * Purchase orders page — Studio blocks.
 *
 * Two blocks for now:
 *   po_stats   — top-bar tiles (counts + total open commitment).
 *   po_kanban  — drag-to-move kanban grouped by lifecycle status.
 *
 * Drag-to-move calls the appropriate lifecycle endpoint:
 *   draft → confirmed : POST /confirm   (rejects empty-line POs)
 *   * → cancelled     : POST /cancel
 * Other transitions (e.g. confirmed → received) need a Receipt payload,
 * so dragging to "received" opens the receipt drawer instead of doing a
 * blind status flip — that flow lives on the form page.
 */

import type { ReactNode } from "react";
import KanbanBoard, { type KanbanColumn } from "../components/KanbanBoard";
import type { BlockProps } from "../components/PageRenderer";
import type { PurchaseOrder, PurchaseOrderStatus, Supplier } from "../api";


const STAGES: KanbanColumn[] = [
  { id: "draft",     label: "Draft",     color: "#94a3b8" },
  { id: "confirmed", label: "Confirmed", color: "#3b82f6" },
  { id: "received",  label: "Received",  color: "#10b981" },
  { id: "cancelled", label: "Cancelled", color: "#ef4444" },
];


export type PurchaseCtx = {
  pos: PurchaseOrder[];
  suppliers: Supplier[];
  onMove: (po: PurchaseOrderCard, newStatus: string | number) => void;
  onCardClick: (po: PurchaseOrderCard) => void;
  onNew: () => void;
};


type PurchaseOrderCard = PurchaseOrder & { columnId: string };
type Props = BlockProps<PurchaseCtx>;


function money(v: number, currency: string = "ZAR"): string {
  const symbol = currency === "ZAR" ? "R" : currency;
  return `${symbol} ${v.toLocaleString("en-ZA", { maximumFractionDigits: 0 })}`;
}


function StatTile({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="bg-white border border-ui-border rounded px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">{label}</div>
      <div className="text-[18px] font-display font-bold text-sai-navy mt-0.5 leading-tight">{value}</div>
      {hint ? <div className="text-[10px] text-slate-400 mt-0.5">{hint}</div> : null}
    </div>
  );
}


export function POStats({ ctx }: Props) {
  const byStatus: Record<PurchaseOrderStatus, PurchaseOrder[]> = {
    draft: [], confirmed: [], received: [], cancelled: [],
  };
  for (const p of ctx.pos) byStatus[p.status].push(p);
  const openCommit = [...byStatus.draft, ...byStatus.confirmed].reduce((a, b) => a + b.total, 0);
  const receivedSpend = byStatus.received.reduce((a, b) => a + b.total, 0);
  return (
    <div className="px-4 pt-3 grid grid-cols-4 gap-2">
      <StatTile label="Draft POs" value={byStatus.draft.length} hint="not yet sent" />
      <StatTile label="Confirmed" value={byStatus.confirmed.length} hint="awaiting delivery" />
      <StatTile label="Open commitment" value={money(openCommit)} hint="draft + confirmed totals" />
      <StatTile label="Received YTD" value={money(receivedSpend)} hint={`${byStatus.received.length} POs closed`} />
    </div>
  );
}


export function POKanban({ ctx }: Props) {
  const supplierName = (id: number) => ctx.suppliers.find((s) => s.id === id)?.name ?? `Supplier #${id}`;

  const columns: KanbanColumn[] = STAGES.map((s) => {
    const inCol = ctx.pos.filter((p) => p.status === s.id);
    const total = inCol.reduce((a, b) => a + b.total, 0);
    return { ...s, meta: `${inCol.length} · ${money(total)}` };
  });
  const items: PurchaseOrderCard[] = ctx.pos.map((p) => ({ ...p, columnId: p.status }));

  const renderCard = (p: PurchaseOrderCard) => {
    const remaining = p.lines.reduce((a, ln) => a + Math.max(0, ln.quantity - ln.received_qty), 0);
    const totalQty = p.lines.reduce((a, ln) => a + ln.quantity, 0);
    const progress = totalQty > 0 ? Math.round(((totalQty - remaining) / totalQty) * 100) : 0;
    return (
      <div className="kanban-card relative">
        <div className="text-[11px] text-slate-400 font-mono">{p.ref}</div>
        <div className="text-[13px] font-semibold text-sai-navy leading-tight">
          {supplierName(p.supplier_id)}
        </div>
        <div className="text-[11px] text-slate-500 mt-0.5">
          {p.lines.length} line{p.lines.length === 1 ? "" : "s"}
          {p.expected_date ? ` · due ${p.expected_date}` : ""}
        </div>
        {p.status === "confirmed" && totalQty > 0 && (
          <div className="mt-2">
            <div className="h-1 bg-slate-200 rounded">
              <div className="h-1 bg-sai-blue rounded" style={{ width: `${progress}%` }} />
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">{progress}% received</div>
          </div>
        )}
        <div className="mt-2 flex items-center justify-between">
          <div className="text-[12px] font-bold text-sai-blue">{money(p.total, p.currency)}</div>
          {p.status === "received" && p.received_at && (
            <span className="text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-semibold">
              Closed
            </span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="px-4 pt-2">
      <div className="text-[10px] text-slate-400 italic mb-1">
        Drag a draft to <span className="font-semibold text-sai-blue">Confirmed</span> to send it
        to the supplier. Drag any open PO to <span className="font-semibold text-red-600">Cancelled</span> to cancel.
        Recording a delivery happens on the PO page.
      </div>
      <KanbanBoard<PurchaseOrderCard>
        columns={columns}
        items={items}
        renderCard={renderCard}
        onMove={ctx.onMove}
        onCardClick={ctx.onCardClick}
        emptyHint="No purchase orders in this state"
      />
    </div>
  );
}


export const purchaseRegistry = {
  po_stats: POStats,
  po_kanban: POKanban,
} as const;

export type PurchaseBlockKey = keyof typeof purchaseRegistry;

/**
 * Sales Orders page — Studio blocks.
 *
 * Two blocks for now:
 *   so_stats   — counts + totals across the lifecycle.
 *   so_kanban  — cards grouped by state (read-only drag; transitions
 *                need explicit user action on the SO form).
 */

import type { ReactNode } from "react";
import KanbanBoard, { type KanbanColumn } from "../components/KanbanBoard";
import type { BlockProps } from "../components/PageRenderer";
import type { Opportunity, SalesOrder, SalesOrderState } from "../api";


export type SalesOrdersCtx = {
  sos: SalesOrder[];
  opps: Opportunity[];
  onCardClick: (so: SalesOrderCard) => void;
};


type SalesOrderCard = SalesOrder & { columnId: string };
type Props = BlockProps<SalesOrdersCtx>;


const STATES: KanbanColumn[] = [
  { id: "confirmed", label: "Confirmed", color: "#3b82f6" },
  { id: "delivered", label: "Delivered", color: "#8b5cf6" },
  { id: "invoiced",  label: "Invoiced",  color: "#f59e0b" },
  { id: "paid",      label: "Paid",      color: "#10b981" },
  { id: "cancelled", label: "Cancelled", color: "#ef4444" },
];


function money(v: number, currency = "ZAR") {
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


export function SOStats({ ctx }: Props) {
  const byState: Record<SalesOrderState, SalesOrder[]> = {
    confirmed: [], delivered: [], invoiced: [], paid: [], cancelled: [],
  };
  for (const s of ctx.sos) byState[s.state].push(s);
  const openCommit = [...byState.confirmed, ...byState.delivered, ...byState.invoiced]
    .reduce((a, s) => a + s.total, 0);
  const paidYtd = byState.paid.reduce((a, s) => a + s.paid_total, 0);
  const outstanding = ctx.sos.reduce((a, s) => a + Math.max(0, s.invoiced_total - s.paid_total), 0);
  return (
    <div className="px-4 pt-3 grid grid-cols-4 gap-2">
      <StatTile label="Open SOs" value={byState.confirmed.length + byState.delivered.length + byState.invoiced.length} hint="confirmed / delivered / invoiced" />
      <StatTile label="Open commitment" value={money(openCommit)} hint="all open SO totals" />
      <StatTile label="Outstanding AR" value={money(outstanding)} hint="invoiced but not yet paid" />
      <StatTile label="Paid YTD" value={money(paidYtd)} hint={`${byState.paid.length} SOs closed`} />
    </div>
  );
}


export function SOKanban({ ctx }: Props) {
  const oppById: Record<number, Opportunity> = {};
  for (const o of ctx.opps) oppById[o.id] = o;

  const columns: KanbanColumn[] = STATES.map((s) => {
    const inCol = ctx.sos.filter((p) => p.state === s.id);
    const total = inCol.reduce((a, b) => a + b.total, 0);
    return { ...s, meta: `${inCol.length} · ${money(total)}` };
  });
  const items: SalesOrderCard[] = ctx.sos.map((s) => ({ ...s, columnId: s.state }));

  const renderCard = (s: SalesOrderCard) => {
    const opp = oppById[s.opportunity_id];
    const customer = opp?.client?.name ?? `Opportunity #${s.opportunity_id}`;
    const billed = s.invoiced_total;
    const paid = s.paid_total;
    return (
      <div className="kanban-card relative">
        <div className="text-[11px] text-slate-400 font-mono">{s.ref}</div>
        <div className="text-[13px] font-semibold text-sai-navy leading-tight">
          {opp?.title ?? "(no opportunity)"}
        </div>
        <div className="text-[11px] text-slate-500 mt-0.5">{customer}</div>
        <div className="mt-2 grid grid-cols-3 gap-1 text-[10px]">
          <div>
            <div className="text-slate-400 uppercase tracking-wider">Total</div>
            <div className="tabular-nums font-semibold text-sai-blue">{money(s.total, s.currency)}</div>
          </div>
          <div>
            <div className="text-slate-400 uppercase tracking-wider">Invoiced</div>
            <div className="tabular-nums text-slate-700">{money(billed, s.currency)}</div>
          </div>
          <div>
            <div className="text-slate-400 uppercase tracking-wider">Paid</div>
            <div className={`tabular-nums font-semibold ${paid >= s.total ? "text-emerald-600" : "text-slate-700"}`}>{money(paid, s.currency)}</div>
          </div>
        </div>
        {s.state === "paid" && (
          <div className="ribbon">Paid</div>
        )}
      </div>
    );
  };

  return (
    <div className="px-4 pt-2">
      <div className="text-[10px] text-slate-400 italic mb-1">
        Click an SO to open it. Lifecycle actions (deliver, invoice, pay, cancel) live on the SO page.
      </div>
      <KanbanBoard<SalesOrderCard>
        columns={columns}
        items={items}
        renderCard={renderCard}
        onMove={() => { /* drag-to-state not allowed; transitions need explicit confirmation */ }}
        onCardClick={ctx.onCardClick}
        emptyHint="No sales orders in this state"
      />
    </div>
  );
}


export const salesOrdersRegistry = {
  so_stats: SOStats,
  so_kanban: SOKanban,
} as const;

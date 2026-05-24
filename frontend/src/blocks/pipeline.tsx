/**
 * Pipeline page — Studio block components + registry.
 *
 * Each block consumes the shared `PipelineCtx` passed in by Pipeline.tsx
 * (the page owns its data fetching; blocks stay pure presentational).
 * The page-scoped registry exported at the bottom is what `<PageRenderer>`
 * walks; toggling a block off in the editor drawer simply skips it.
 */

import type { ReactNode } from "react";
import KanbanBoard, { type KanbanColumn } from "../components/KanbanBoard";
import type { Opportunity } from "../api";

const STAGES: KanbanColumn[] = [
  { id: "new",       label: "New",            color: "#94a3b8" },
  { id: "qualified", label: "Qualified",      color: "#3b82f6" },
  { id: "proposal",  label: "Proposal Sent",  color: "#8b5cf6" },
  { id: "won",       label: "Won",            color: "#10b981" },
  { id: "lost",      label: "Lost",           color: "#ef4444" },
];

const LIVE_STAGES = new Set(["new", "qualified", "proposal"]);

function money(v: number): string {
  return "R " + v.toLocaleString("en-ZA", { maximumFractionDigits: 0 });
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]!.toUpperCase())
    .join("");
}

function isExpired(validUntil: string | null): boolean {
  if (!validUntil) return false;
  const d = new Date(validUntil);
  if (Number.isNaN(d.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d < today;
}

type OppCard = Opportunity & { columnId: string };

export type PipelineCtx = {
  opps: Opportunity[];
  onMove: (o: OppCard, newStage: string | number) => void;
  onCardClick: (o: OppCard) => void;
};

type BlockProps = { ctx: PipelineCtx; config: Record<string, any> };


function StatTile({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="bg-white border border-ui-border rounded px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">{label}</div>
      <div className="text-[18px] font-display font-bold text-sai-navy mt-0.5 leading-tight">{value}</div>
      {hint ? <div className="text-[10px] text-slate-400 mt-0.5">{hint}</div> : null}
    </div>
  );
}


export function SmartStats({ ctx }: BlockProps) {
  const live = ctx.opps.filter((o) => LIVE_STAGES.has(o.stage));
  const won = ctx.opps.filter((o) => o.stage === "won");
  const pipelineValue = live.reduce((a, b) => a + b.amount, 0);
  const wonValue = won.reduce((a, b) => a + b.amount, 0);
  return (
    <div className="px-4 pt-3 grid grid-cols-4 gap-2">
      <StatTile label="Live deals" value={live.length} hint={`${ctx.opps.length} total in pipeline`} />
      <StatTile label="Pipeline value" value={money(pipelineValue)} hint="excl. won & lost" />
      <StatTile label="Won" value={won.length} hint={money(wonValue)} />
      <StatTile label="Conversion" value={`${ctx.opps.length ? Math.round((won.length / ctx.opps.length) * 100) : 0}%`} hint="all-time win rate" />
    </div>
  );
}


export function TipStrip(_: BlockProps) {
  return (
    <div className="px-4 pt-2 text-[10px] text-slate-400 italic">
      Tip: drag cards between columns to change stage. Moving to{" "}
      <span className="font-semibold text-emerald-600">Won</span> auto-creates a construction project.
    </div>
  );
}


export function KanbanBlock({ ctx }: BlockProps) {
  const columns: KanbanColumn[] = STAGES.map((s) => {
    const inCol = ctx.opps.filter((o) => o.stage === s.id);
    const total = inCol.reduce((a, b) => a + b.amount, 0);
    return { ...s, meta: `${inCol.length} · ${money(total)}` };
  });
  const items: OppCard[] = ctx.opps.map((o) => ({ ...o, columnId: o.stage }));

  const renderCard = (o: OppCard) => {
    const topPL = o.lines[0]?.product_line ?? "";
    const expired = isExpired(o.valid_until);
    return (
      <div className="kanban-card relative">
        {o.stage === "won" && <div className="ribbon">Won</div>}
        <div className="text-[13px] font-semibold text-sai-navy leading-tight pr-12">{o.title}</div>
        <div className="text-[11px] text-slate-500 mt-0.5">{o.client?.name}</div>
        <div className="text-[11px] text-slate-400">
          {o.lines.length} line item{o.lines.length === 1 ? "" : "s"}
          {topPL ? ` · ${topPL}` : ""}
        </div>
        <div className="mt-2 flex items-center justify-between">
          <div className="text-[12px] font-bold text-sai-blue">{money(o.amount)}</div>
          <div className="star-row">
            {[1, 2, 3].map((n) => (
              <span key={n} className={`star ${o.priority >= n ? "is-on" : ""}`}>★</span>
            ))}
          </div>
        </div>
        <div className="mt-2 flex items-center gap-1 flex-wrap">
          {expired && (
            <span className="text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-semibold">
              Expired
            </span>
          )}
          {o.salesperson && (
            <span
              title={`Salesperson: ${o.salesperson}`}
              className="text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-semibold"
            >
              {initialsOf(o.salesperson)}
            </span>
          )}
          {o.project_id && (
            <span
              title="Has a construction project"
              className="text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-semibold"
            >
              Project
            </span>
          )}
        </div>
      </div>
    );
  };

  return (
    <KanbanBoard<OppCard>
      columns={columns}
      items={items}
      renderCard={renderCard}
      onMove={ctx.onMove}
      onCardClick={ctx.onCardClick}
      emptyHint="No opportunities in this stage"
    />
  );
}


export const pipelineRegistry = {
  smart_stats: SmartStats,
  tip_strip: TipStrip,
  kanban: KanbanBlock,
} as const;

export type PipelineBlockKey = keyof typeof pipelineRegistry;

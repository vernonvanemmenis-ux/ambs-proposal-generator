/**
 * Reports page — Studio blocks.
 *
 * Eight blocks driven by `ReportsCtx`:
 *   headline_kpis           — top-of-page tiles
 *   sales_by_stage          — pie chart
 *   sales_by_salesperson    — bar chart
 *   sales_monthly           — line chart
 *   aged_receivables        — bucket strip + invoice table
 *   inventory_valuation     — bar chart of top items + grand total
 *   manufacturing_throughput — line chart of units / month
 *   accounting_export       — invoices.csv + payments.csv buttons
 */

import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { BlockProps } from "../components/PageRenderer";
import { BarChart, LineChart, PieChart, type DataPoint } from "../components/charts";
import { api,
  type AgedReceivablesReport,
  type InventoryValuationReport,
  type ManufacturingThroughputReport,
  type SalesAnalyticsReport,
} from "../api";


export type ReportsCtx = {
  sales: SalesAnalyticsReport | null;
  ar: AgedReceivablesReport | null;
  inv: InventoryValuationReport | null;
  thru: ManufacturingThroughputReport | null;
};


function money(v: number) {
  return "R " + v.toLocaleString("en-ZA", { maximumFractionDigits: 0 });
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


function Card({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div className="bg-white border border-ui-border rounded-md">
      <div className="px-3 py-2 border-b border-ui-border">
        <div className="text-[13px] font-semibold text-sai-navy">{title}</div>
        {hint && <div className="text-[11px] text-slate-500">{hint}</div>}
      </div>
      <div className="px-3 py-3">{children}</div>
    </div>
  );
}


export function HeadlineKPIs({ ctx }: BlockProps<ReportsCtx>) {
  return (
    <div className="px-4 pt-3 grid grid-cols-2 md:grid-cols-5 gap-2">
      <StatTile
        label="Pipeline"
        value={money(ctx.sales?.pipeline_value ?? 0)}
        hint="new / qualified / proposal"
      />
      <StatTile
        label="Won YTD"
        value={money(ctx.sales?.won_value ?? 0)}
        hint={`win rate ${(ctx.sales?.win_rate ?? 0).toFixed(0)}%`}
      />
      <StatTile
        label="Outstanding AR"
        value={money(ctx.ar?.grand_total ?? 0)}
        hint={`${ctx.ar?.rows.length ?? 0} open invoices`}
      />
      <StatTile
        label="Inventory value"
        value={money(ctx.inv?.total_value ?? 0)}
        hint={`${ctx.inv?.rows.length ?? 0} items in stock`}
      />
      <StatTile
        label="Produced YTD"
        value={`${(ctx.thru?.units_ytd ?? 0).toLocaleString("en-ZA")} units`}
        hint={`${ctx.thru?.open_mo_count ?? 0} MOs open`}
      />
    </div>
  );
}


export function SalesByStageBlock({ ctx }: BlockProps<ReportsCtx>) {
  const data: DataPoint[] = (ctx.sales?.by_stage ?? []).map((r) => ({
    label: `${r.stage} (${r.count})`,
    value: r.value,
  }));
  return (
    <div className="px-4 pt-3">
      <Card title="Pipeline value by stage" hint="hover a segment for the absolute value">
        <PieChart data={data} />
      </Card>
    </div>
  );
}


export function SalesBySalespersonBlock({ ctx }: BlockProps<ReportsCtx>) {
  const data: DataPoint[] = (ctx.sales?.by_salesperson ?? []).map((r) => ({
    label: `${r.salesperson} (${r.count})`,
    value: r.value,
  }));
  return (
    <div className="px-4 pt-3">
      <Card title="Pipeline value by salesperson" hint="all opportunities; sorted by value">
        <BarChart data={data} />
      </Card>
    </div>
  );
}


export function SalesMonthlyBlock({ ctx }: BlockProps<ReportsCtx>) {
  const data: DataPoint[] = (ctx.sales?.monthly ?? []).map((r) => ({
    label: r.month,
    value: r.value,
  }));
  return (
    <div className="px-4 pt-3">
      <Card title="Opportunity value created — monthly" hint="based on created_at, not won">
        <LineChart data={data} width={720} height={180} />
      </Card>
    </div>
  );
}


export function AgedReceivablesBlock({ ctx }: BlockProps<ReportsCtx>) {
  const ar = ctx.ar;
  return (
    <div className="px-4 pt-3">
      <Card title="Aged receivables" hint="outstanding balances by days past due">
        <div className="grid grid-cols-5 gap-2 mb-3">
          {(ar?.buckets ?? []).map((b) => (
            <div key={b.label} className={`rounded border p-2 ${
              b.label === "current" ? "bg-emerald-50 border-emerald-200" :
              b.label === "1-30"    ? "bg-yellow-50 border-yellow-200" :
              b.label === "31-60"   ? "bg-orange-50 border-orange-200" :
              b.label === "61-90"   ? "bg-red-50 border-red-200" :
                                     "bg-red-100 border-red-300"
            }`}>
              <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-700">{b.label}</div>
              <div className="text-[14px] font-bold text-sai-navy tabular-nums">{money(b.total)}</div>
              <div className="text-[10px] text-slate-500">{b.count} invoice{b.count === 1 ? "" : "s"}</div>
            </div>
          ))}
        </div>
        {(ar?.rows.length ?? 0) === 0 ? (
          <div className="text-[11px] text-slate-400 italic py-2">No outstanding invoices.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead className="bg-slate-50 border-b border-ui-border text-left text-[10px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-2 py-1.5 font-semibold">Invoice</th>
                  <th className="px-2 py-1.5 font-semibold">SO</th>
                  <th className="px-2 py-1.5 font-semibold">Client</th>
                  <th className="px-2 py-1.5 font-semibold">Due</th>
                  <th className="px-2 py-1.5 font-semibold text-right">Days</th>
                  <th className="px-2 py-1.5 font-semibold text-right">Outstanding</th>
                  <th className="px-2 py-1.5 font-semibold">Bucket</th>
                </tr>
              </thead>
              <tbody>
                {(ar?.rows ?? []).map((r) => (
                  <tr key={r.invoice_id} className="border-b border-ui-border last:border-0">
                    <td className="px-2 py-1.5 font-mono text-[11px]">
                      <Link to="/invoices" className="text-sai-blue hover:underline">{r.invoice_ref}</Link>
                    </td>
                    <td className="px-2 py-1.5 font-mono text-[11px] text-slate-500">{r.sales_order_ref}</td>
                    <td className="px-2 py-1.5">{r.client_name}</td>
                    <td className="px-2 py-1.5 text-slate-500">{r.due_date ?? "—"}</td>
                    <td className={`px-2 py-1.5 text-right tabular-nums ${r.days_overdue > 30 ? "text-red-600 font-semibold" : "text-slate-700"}`}>
                      {r.days_overdue}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums font-semibold text-amber-600">{money(r.outstanding)}</td>
                    <td className="px-2 py-1.5 text-[10px] uppercase tracking-wider text-slate-600">{r.bucket}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}


export function InventoryValuationBlock({ ctx }: BlockProps<ReportsCtx>) {
  const inv = ctx.inv;
  const top = (inv?.rows ?? []).slice(0, 12).map((r) => ({
    label: `${r.item_code} · ${r.item_name}`,
    value: r.total_value,
  }));
  return (
    <div className="px-4 pt-3">
      <Card title="Inventory valuation"
        hint={`grand total ${money(inv?.total_value ?? 0)} across ${inv?.rows.length ?? 0} items — top 12 shown`}>
        <BarChart data={top} />
      </Card>
    </div>
  );
}


export function ManufacturingThroughputBlock({ ctx }: BlockProps<ReportsCtx>) {
  const data: DataPoint[] = (ctx.thru?.monthly ?? []).map((r) => ({
    label: r.month,
    value: r.units_produced,
  }));
  return (
    <div className="px-4 pt-3">
      <Card title="Manufacturing throughput"
        hint={`${ctx.thru?.units_ytd ?? 0} units YTD · ${ctx.thru?.open_mo_count ?? 0} MOs still open`}>
        <LineChart data={data} width={720} height={180} formatValue={(n) => `${n} units`} />
      </Card>
    </div>
  );
}


export function AccountingExportBlock(_: BlockProps<ReportsCtx>) {
  return (
    <div className="px-4 pt-3 pb-6">
      <Card title="Accounting export" hint="CSV downloads for your accountant. Contains every invoice and every payment, all-time.">
        <div className="flex items-center gap-3">
          <a
            href={api.reports.invoicesCsvUrl()}
            className="text-[12px] bg-sai-blue text-white px-3 py-1.5 rounded font-semibold hover:opacity-90"
            download
          >
            ⬇ Invoices.csv
          </a>
          <a
            href={api.reports.paymentsCsvUrl()}
            className="text-[12px] border border-sai-blue text-sai-blue px-3 py-1.5 rounded font-semibold hover:bg-sai-bluepale"
            download
          >
            ⬇ Payments.csv
          </a>
          <div className="text-[11px] text-slate-500 flex-1">
            Files include ref, kind, state, totals, paid/outstanding, dates,
            and the related SO + client name for reconciliation.
          </div>
        </div>
      </Card>
    </div>
  );
}


export const reportsRegistry = {
  headline_kpis: HeadlineKPIs,
  sales_by_stage: SalesByStageBlock,
  sales_by_salesperson: SalesBySalespersonBlock,
  sales_monthly: SalesMonthlyBlock,
  aged_receivables: AgedReceivablesBlock,
  inventory_valuation: InventoryValuationBlock,
  manufacturing_throughput: ManufacturingThroughputBlock,
  accounting_export: AccountingExportBlock,
} as const;

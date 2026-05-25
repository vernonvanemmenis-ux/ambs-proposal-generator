/**
 * Invoices page — Studio blocks.
 *
 * Two blocks:
 *   invoice_stats — outstanding total, overdue count, paid YTD.
 *   invoice_list  — searchable table.
 */

import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { BlockProps } from "../components/PageRenderer";
import type { Invoice, SalesOrder } from "../api";


export type InvoicesCtx = {
  invoices: Invoice[];
  sosById: Record<number, SalesOrder>;
  search: string;
  setSearch: (s: string) => void;
};


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


function isOverdue(inv: Invoice): boolean {
  if (!inv.due_date) return false;
  if (inv.state === "paid" || inv.state === "cancelled") return false;
  return new Date(inv.due_date) < new Date();
}


export function InvoiceStats({ ctx }: BlockProps<InvoicesCtx>) {
  const outstanding = ctx.invoices
    .filter((i) => i.state !== "cancelled")
    .reduce((a, i) => a + i.outstanding, 0);
  const overdue = ctx.invoices.filter(isOverdue);
  const paidYtd = ctx.invoices
    .filter((i) => i.state === "paid")
    .reduce((a, i) => a + i.paid_total, 0);
  return (
    <div className="px-4 pt-3 grid grid-cols-3 gap-2">
      <StatTile label="Outstanding" value={money(outstanding)} hint={`${ctx.invoices.filter((i) => i.outstanding > 0 && i.state !== "cancelled").length} invoices not fully paid`} />
      <StatTile label="Overdue" value={overdue.length} hint={overdue.length ? money(overdue.reduce((a, i) => a + i.outstanding, 0)) : "none past due date"} />
      <StatTile label="Paid YTD" value={money(paidYtd)} hint={`${ctx.invoices.filter((i) => i.state === "paid").length} closed invoices`} />
    </div>
  );
}


export function InvoiceList({ ctx }: BlockProps<InvoicesCtx>) {
  const ql = ctx.search.trim().toLowerCase();
  const rows = ql
    ? ctx.invoices.filter((inv) => {
        const so = ctx.sosById[inv.sales_order_id];
        return (
          inv.ref.toLowerCase().includes(ql) ||
          (so?.ref ?? "").toLowerCase().includes(ql) ||
          inv.kind.toLowerCase().includes(ql) ||
          inv.state.toLowerCase().includes(ql)
        );
      })
    : ctx.invoices;

  const stateBadge: Record<string, string> = {
    draft: "bg-slate-200 text-slate-700",
    sent:  "bg-blue-100 text-blue-700",
    paid:  "bg-emerald-100 text-emerald-700",
    cancelled: "bg-red-100 text-red-700",
  };

  return (
    <div className="px-4 py-3">
      <div className="bg-white border border-ui-border rounded-md">
        <div className="px-3 py-2 border-b border-ui-border flex items-center">
          <div className="text-[13px] font-semibold text-sai-navy">All invoices</div>
          <div className="text-[11px] text-slate-500 ml-2">{rows.length} of {ctx.invoices.length}</div>
          <div className="flex-1" />
          <input value={ctx.search} onChange={(e) => ctx.setSearch(e.target.value)}
            placeholder="Search ref, SO, kind, state…"
            className="text-[12px] border border-ui-border rounded px-2 py-1.5 w-72 outline-none focus:border-sai-blue" />
        </div>
        {rows.length === 0 ? (
          <div className="px-3 py-6 text-center text-[12px] text-slate-400 italic">
            {ql ? "No invoices match your search." : "No invoices yet. Open a Sales Order and create one."}
          </div>
        ) : (
          <table className="w-full text-[12px]">
            <thead className="bg-slate-50 border-b border-ui-border text-left text-[10px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-3 py-1.5 font-semibold">Invoice</th>
                <th className="px-3 py-1.5 font-semibold">Sales Order</th>
                <th className="px-3 py-1.5 font-semibold">Kind</th>
                <th className="px-3 py-1.5 font-semibold">State</th>
                <th className="px-3 py-1.5 font-semibold">Due</th>
                <th className="px-3 py-1.5 font-semibold text-right">Total</th>
                <th className="px-3 py-1.5 font-semibold text-right">Paid</th>
                <th className="px-3 py-1.5 font-semibold text-right">Outstanding</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((inv) => {
                const so = ctx.sosById[inv.sales_order_id];
                const overdue = isOverdue(inv);
                return (
                  <tr key={inv.id} className="border-b border-ui-border last:border-0 hover:bg-ui-rowhover">
                    <td className="px-3 py-1.5 font-mono text-[11px] text-sai-navy">{inv.ref}</td>
                    <td className="px-3 py-1.5">
                      {so ? (
                        <Link to={`/sales-orders/${so.id}`} className="text-sai-blue hover:underline font-mono text-[11px]">
                          {so.ref}
                        </Link>
                      ) : (
                        <span className="text-slate-400">SO #{inv.sales_order_id}</span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-slate-500 capitalize">{inv.kind.replace("_", " ")}</td>
                    <td className="px-3 py-1.5">
                      <span className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded font-semibold ${stateBadge[inv.state]}`}>
                        {inv.state}
                      </span>
                    </td>
                    <td className={`px-3 py-1.5 text-[11px] ${overdue ? "text-red-600 font-semibold" : "text-slate-500"}`}>
                      {inv.due_date || "—"}{overdue ? " · OVERDUE" : ""}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-slate-700">
                      {money(inv.total, inv.currency)}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-slate-700">
                      {money(inv.paid_total, inv.currency)}
                    </td>
                    <td className={`px-3 py-1.5 text-right tabular-nums font-semibold ${inv.outstanding > 0 ? "text-amber-600" : "text-emerald-600"}`}>
                      {money(inv.outstanding, inv.currency)}
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


export const invoicesRegistry = {
  invoice_stats: InvoiceStats,
  invoice_list: InvoiceList,
} as const;

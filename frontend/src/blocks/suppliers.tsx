/**
 * Suppliers page — Studio blocks.
 *
 * For now there's just one block (supplier_list); the Studio drawer can
 * still toggle it on/off and the page will render the empty-state if
 * disabled. Future M-milestones may add supplier_stats / recent_pos.
 */

import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { BlockProps } from "../components/PageRenderer";
import type { Supplier } from "../api";


export type SuppliersCtx = {
  suppliers: Supplier[];
  search: string;
  setSearch: (s: string) => void;
  showInactive: boolean;
  setShowInactive: (b: boolean) => void;
  onRowClick: (s: Supplier) => void;
  onNew: () => void;
};

type Props = BlockProps<SuppliersCtx>;


export function SupplierListBlock({ ctx }: Props) {
  const ql = ctx.search.trim().toLowerCase();
  const rows = ql
    ? ctx.suppliers.filter(
        (s) =>
          s.name.toLowerCase().includes(ql) ||
          s.contact_person.toLowerCase().includes(ql) ||
          s.email.toLowerCase().includes(ql) ||
          s.address.toLowerCase().includes(ql),
      )
    : ctx.suppliers;

  return (
    <div className="px-4 py-4">
      <div className="bg-white border-b border-ui-border px-4 py-2 mb-4 -mx-4 flex items-center gap-3 rounded">
        <Link to="/" className="text-[12px] text-slate-500 hover:text-sai-navy">← Apps</Link>
        <div className="text-slate-300">/</div>
        <div className="text-[13px] font-semibold text-sai-navy font-display">Suppliers</div>
        <div className="flex-1" />
        <label className="flex items-center gap-1.5 text-[11px] text-slate-600">
          <input
            type="checkbox"
            checked={ctx.showInactive}
            onChange={(e) => ctx.setShowInactive(e.target.checked)}
            className="cursor-pointer"
          />
          Show inactive
        </label>
        <input
          value={ctx.search}
          onChange={(e) => ctx.setSearch(e.target.value)}
          placeholder="Search name, contact, email, address…"
          className="text-[12px] border border-ui-border rounded px-2 py-1.5 w-72 outline-none focus:border-sai-blue"
        />
        <button
          onClick={ctx.onNew}
          className="text-[11px] bg-sai-blue text-white px-3 py-1.5 rounded font-semibold hover:opacity-90"
        >
          + New Supplier
        </button>
      </div>

      <div className="bg-white border border-ui-border rounded-md overflow-hidden shadow-card">
        <table className="w-full text-[13px]">
          <thead className="bg-slate-50 border-b border-ui-border">
            <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500">
              <Th>Supplier</Th>
              <Th>Contact</Th>
              <Th>Email</Th>
              <Th>Phone</Th>
              <Th>Payment terms</Th>
              <Th className="text-right">Lead time</Th>
              <Th className="text-right">Items</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr
                key={s.id}
                onClick={() => ctx.onRowClick(s)}
                className={`border-b border-ui-border last:border-0 hover:bg-ui-rowhover cursor-pointer ${
                  s.active ? "" : "opacity-60"
                }`}
              >
                <td className="px-3 py-2.5">
                  <div className="font-semibold text-sai-navy flex items-center gap-2">
                    {s.name}
                    {!s.active && (
                      <span className="text-[9px] uppercase tracking-wider bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded font-semibold">
                        Inactive
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2.5 text-slate-600">{s.contact_person || "—"}</td>
                <td className="px-3 py-2.5 text-slate-600">{s.email || "—"}</td>
                <td className="px-3 py-2.5 text-slate-600">{s.phone || "—"}</td>
                <td className="px-3 py-2.5 text-slate-600">{s.payment_terms || "—"}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {s.lead_time_days ? `${s.lead_time_days} d` : "—"}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-sai-blue">
                  {s.item_links?.length ?? 0}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-10 text-center text-slate-400 italic text-[12px]">
                  {ctx.search
                    ? "No suppliers match your search."
                    : "No suppliers yet. Click + New Supplier to get started."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 text-[11px] text-slate-400">
        {rows.length} of {ctx.suppliers.length} supplier{ctx.suppliers.length === 1 ? "" : "s"}
      </div>
    </div>
  );
}


function Th({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <th className={`px-3 py-2 font-semibold ${className}`}>{children}</th>;
}


export const suppliersRegistry = {
  supplier_list: SupplierListBlock,
} as const;

export type SuppliersBlockKey = keyof typeof suppliersRegistry;

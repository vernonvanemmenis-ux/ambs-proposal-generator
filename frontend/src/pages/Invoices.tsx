import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, type Invoice, type SalesOrder } from "../api";
import PageRenderer from "../components/PageRenderer";
import { invoicesRegistry, type InvoicesCtx } from "../blocks/invoices";


export default function Invoices() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [sos, setSos] = useState<SalesOrder[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    api.invoices.list().then(setInvoices).catch(() => {});
    api.salesOrders.list().then(setSos).catch(() => {});
  }, []);

  const sosById = useMemo(() => {
    const m: Record<number, SalesOrder> = {};
    for (const s of sos) m[s.id] = s;
    return m;
  }, [sos]);

  const ctx: InvoicesCtx = useMemo(
    () => ({ invoices, sosById, search, setSearch }),
    [invoices, sosById, search],
  );

  return (
    <div className="min-h-[calc(100vh-44px)]">
      <div className="bg-white border-b border-ui-border px-4 py-2 flex items-center gap-3">
        <Link to="/" className="text-[12px] text-slate-500 hover:text-sai-navy">← Apps</Link>
        <div className="text-slate-300">/</div>
        <div className="text-[13px] font-semibold text-sai-navy font-display">Invoices</div>
        <div className="flex-1" />
        <Link to="/sales-orders" className="text-[11px] text-sai-blue hover:underline">← Sales Orders</Link>
      </div>
      <PageRenderer<InvoicesCtx>
        pageKey="invoices"
        registry={invoicesRegistry}
        ctx={ctx}
      />
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, type Opportunity, type SalesOrder } from "../api";
import PageRenderer from "../components/PageRenderer";
import { salesOrdersRegistry, type SalesOrdersCtx } from "../blocks/sales_orders";


export default function SalesOrders() {
  const [sos, setSos] = useState<SalesOrder[]>([]);
  const [opps, setOpps] = useState<Opportunity[]>([]);
  const navigate = useNavigate();

  const load = () => {
    api.salesOrders.list().then(setSos).catch(() => {});
    api.opportunities.list().then(setOpps).catch(() => {});
  };
  useEffect(load, []);

  const ctx: SalesOrdersCtx = useMemo(
    () => ({
      sos,
      opps,
      onCardClick: (so) => navigate(`/sales-orders/${so.id}`),
    }),
    [sos, opps],
  );

  return (
    <div className="min-h-[calc(100vh-44px)]">
      <div className="bg-white border-b border-ui-border px-4 py-2 flex items-center gap-3">
        <Link to="/" className="text-[12px] text-slate-500 hover:text-sai-navy">← Apps</Link>
        <div className="text-slate-300">/</div>
        <div className="text-[13px] font-semibold text-sai-navy font-display">Sales Orders</div>
        <div className="flex-1" />
        <Link to="/invoices" className="text-[11px] text-sai-blue hover:underline">Invoices →</Link>
        <Link to="/proposals" className="text-[11px] text-slate-500 hover:text-sai-navy">Pipeline</Link>
      </div>
      <PageRenderer<SalesOrdersCtx>
        pageKey="sales_orders"
        registry={salesOrdersRegistry}
        ctx={ctx}
      />
    </div>
  );
}

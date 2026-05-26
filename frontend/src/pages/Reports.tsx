import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  api,
  type AgedReceivablesReport,
  type InventoryValuationReport,
  type ManufacturingThroughputReport,
  type SalesAnalyticsReport,
} from "../api";
import PageRenderer from "../components/PageRenderer";
import { reportsRegistry, type ReportsCtx } from "../blocks/reports";


export default function Reports() {
  const [sales, setSales] = useState<SalesAnalyticsReport | null>(null);
  const [ar, setAr] = useState<AgedReceivablesReport | null>(null);
  const [inv, setInv] = useState<InventoryValuationReport | null>(null);
  const [thru, setThru] = useState<ManufacturingThroughputReport | null>(null);

  useEffect(() => {
    api.reports.salesAnalytics().then(setSales).catch(() => {});
    api.reports.agedReceivables().then(setAr).catch(() => {});
    api.reports.inventoryValuation().then(setInv).catch(() => {});
    api.reports.manufacturingThroughput().then(setThru).catch(() => {});
  }, []);

  const ctx: ReportsCtx = useMemo(
    () => ({ sales, ar, inv, thru }),
    [sales, ar, inv, thru],
  );

  return (
    <div className="min-h-[calc(100vh-44px)]">
      <div className="bg-white border-b border-ui-border px-4 py-2 flex items-center gap-3">
        <Link to="/" className="text-[12px] text-slate-500 hover:text-sai-navy">← Apps</Link>
        <div className="text-slate-300">/</div>
        <div className="text-[13px] font-semibold text-sai-navy font-display">Reports</div>
        <div className="flex-1" />
        <Link to="/fx-rates" className="text-[11px] text-sai-blue hover:underline">FX rates →</Link>
      </div>
      <PageRenderer<ReportsCtx>
        pageKey="reports"
        registry={reportsRegistry}
        ctx={ctx}
      />
    </div>
  );
}

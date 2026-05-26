import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, type BoM, type Item, type ManufacturingOrder } from "../api";
import PageRenderer from "../components/PageRenderer";
import { manufacturingRegistry, type ManufacturingCtx } from "../blocks/manufacturing";


export default function ManufacturingOrders() {
  const [mos, setMos] = useState<ManufacturingOrder[]>([]);
  const [boms, setBoms] = useState<BoM[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const navigate = useNavigate();

  const load = () => {
    api.manufacturing.orders.list().then(setMos).catch(() => {});
    api.manufacturing.boms.list().then(setBoms).catch(() => {});
    api.items.list().then(setItems).catch(() => {});
  };
  useEffect(load, []);

  const ctx: ManufacturingCtx = useMemo(
    () => ({
      mos, boms, items,
      onCardClick: (mo) => navigate(`/manufacturing-orders/${mo.id}`),
    }),
    [mos, boms, items],
  );

  return (
    <div className="min-h-[calc(100vh-44px)]">
      <div className="bg-white border-b border-ui-border px-4 py-2 flex items-center gap-3">
        <Link to="/" className="text-[12px] text-slate-500 hover:text-sai-navy">← Apps</Link>
        <div className="text-slate-300">/</div>
        <div className="text-[13px] font-semibold text-sai-navy font-display">Manufacturing</div>
        <div className="flex-1" />
        <Link to="/bills-of-materials" className="text-[11px] text-sai-blue hover:underline">BoMs</Link>
        <Link to="/work-centers" className="text-[11px] text-sai-blue hover:underline">Work centers</Link>
        <button
          onClick={() => navigate("/manufacturing-orders/new")}
          disabled={boms.length === 0}
          title={boms.length === 0 ? "Create a BoM first" : "New manufacturing order"}
          className="text-[11px] bg-sai-blue text-white px-3 py-1.5 rounded font-semibold hover:opacity-90 disabled:opacity-40"
        >
          + New MO
        </button>
      </div>
      <PageRenderer<ManufacturingCtx>
        pageKey="manufacturing"
        registry={manufacturingRegistry}
        ctx={ctx}
      />
    </div>
  );
}

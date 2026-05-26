import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, type BoM, type Item } from "../api";
import PageRenderer from "../components/PageRenderer";
import { bomsRegistry, type BomsCtx } from "../blocks/boms";


export default function BillsOfMaterials() {
  const [boms, setBoms] = useState<BoM[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const navigate = useNavigate();

  const load = () => {
    api.manufacturing.boms.list({ include_inactive: true }).then(setBoms).catch(() => {});
    api.items.list().then(setItems).catch(() => {});
  };
  useEffect(load, []);

  const ctx: BomsCtx = useMemo(
    () => ({
      boms, items,
      onEdit: (b) => navigate(b ? `/bills-of-materials/${b.id}` : "/bills-of-materials/new"),
    }),
    [boms, items],
  );

  return (
    <div className="min-h-[calc(100vh-44px)]">
      <div className="bg-white border-b border-ui-border px-4 py-2 flex items-center gap-3">
        <Link to="/" className="text-[12px] text-slate-500 hover:text-sai-navy">← Apps</Link>
        <div className="text-slate-300">/</div>
        <Link to="/manufacturing-orders" className="text-[12px] text-slate-500 hover:text-sai-navy">Manufacturing</Link>
        <div className="text-slate-300">/</div>
        <div className="text-[13px] font-semibold text-sai-navy font-display">Bills of Materials</div>
        <div className="flex-1" />
        <button
          onClick={() => navigate("/bills-of-materials/new")}
          disabled={items.length === 0}
          className="text-[11px] bg-sai-blue text-white px-3 py-1.5 rounded font-semibold hover:opacity-90 disabled:opacity-40"
          title={items.length === 0 ? "Create an item first" : "New BoM"}
        >
          + New BoM
        </button>
      </div>
      <PageRenderer<BomsCtx>
        pageKey="boms"
        registry={bomsRegistry}
        ctx={ctx}
      />
    </div>
  );
}

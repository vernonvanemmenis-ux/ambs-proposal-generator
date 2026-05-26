/**
 * Purchase Orders page — kanban + stats.
 *
 * Owns the data fetch and routes drag events to the right lifecycle
 * endpoint. Cards open the per-PO form (PurchaseOrderForm) on click.
 */

import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, type PurchaseOrder, type Supplier } from "../api";
import PageRenderer from "../components/PageRenderer";
import { purchaseRegistry, type PurchaseCtx } from "../blocks/purchase";


export default function PurchaseOrders() {
  const [pos, setPos] = useState<PurchaseOrder[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const navigate = useNavigate();

  const load = () => {
    api.purchaseOrders.list().then(setPos).catch(() => {});
    api.suppliers.list().then(setSuppliers).catch(() => {});
  };
  useEffect(load, []);

  const onMove = async (po: PurchaseOrder, newStatus: string | number) => {
    const target = String(newStatus);
    if (target === po.status) return;
    try {
      if (target === "confirmed" && po.status === "draft") {
        await api.purchaseOrders.confirm(po.id);
      } else if (target === "cancelled" && (po.status === "draft" || po.status === "confirmed")) {
        await api.purchaseOrders.cancel(po.id);
      } else if (target === "received" && po.status === "confirmed") {
        // Receiving needs per-line quantities — open the form to record it.
        navigate(`/purchase-orders/${po.id}`);
        return;
      } else {
        alert(`Cannot move a ${po.status} PO to ${target}.`);
        return;
      }
      load();
    } catch (e: any) {
      alert("Move failed: " + (e?.message || e));
    }
  };

  const ctx: PurchaseCtx = useMemo(
    () => ({
      pos,
      suppliers,
      onMove,
      onCardClick: (po) => navigate(`/purchase-orders/${po.id}`),
      onNew: () => navigate("/purchase-orders/new"),
    }),
    [pos, suppliers],
  );

  return (
    <div className="min-h-[calc(100vh-44px)]">
      <div className="bg-white border-b border-ui-border px-4 py-2 flex items-center gap-3">
        <Link to="/" className="text-[12px] text-slate-500 hover:text-sai-navy">← Apps</Link>
        <div className="text-slate-300">/</div>
        <div className="text-[13px] font-semibold text-sai-navy font-display">Purchase Orders</div>
        <div className="flex-1" />
        <button
          onClick={() => navigate("/purchase-orders/new")}
          disabled={suppliers.length === 0}
          className="text-[11px] bg-sai-blue text-white px-3 py-1.5 rounded font-semibold hover:opacity-90 disabled:opacity-40"
          title={suppliers.length === 0 ? "Create a supplier first" : "New purchase order"}
        >
          + New PO
        </button>
      </div>
      <PageRenderer<PurchaseCtx>
        pageKey="purchase"
        registry={purchaseRegistry}
        ctx={ctx}
      />
    </div>
  );
}

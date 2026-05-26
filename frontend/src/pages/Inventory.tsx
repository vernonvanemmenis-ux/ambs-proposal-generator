/**
 * Inventory landing — stats + low-stock alerts + on-hand grid + recent moves.
 */

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  api,
  type Item,
  type Quant,
  type ReorderRule,
  type ReorderTriggerResult,
  type StockLocation,
  type StockMove,
  type Warehouse,
} from "../api";
import PageRenderer from "../components/PageRenderer";
import { inventoryRegistry, type InventoryCtx } from "../blocks/inventory";


export default function Inventory() {
  const [items, setItems] = useState<Item[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [moves, setMoves] = useState<StockMove[]>([]);
  const [quants, setQuants] = useState<Quant[]>([]);
  const [rules, setRules] = useState<ReorderRule[]>([]);
  const [triggerBusy, setTriggerBusy] = useState(false);
  const [lastTrigger, setLastTrigger] = useState<ReorderTriggerResult | null>(null);

  const load = () => {
    api.items.list().then(setItems).catch(() => {});
    api.inventory.warehouses.list().then(setWarehouses).catch(() => {});
    api.inventory.locations.list({ include_inactive: true }).then(setLocations).catch(() => {});
    api.inventory.moves.list({ limit: 25 }).then(setMoves).catch(() => {});
    api.inventory.quants().then(setQuants).catch(() => {});
    api.inventory.reorderRules.list().then(setRules).catch(() => {});
  };
  useEffect(load, []);

  const onTrigger = async () => {
    setTriggerBusy(true);
    try {
      const res = await api.inventory.reorderRules.trigger();
      setLastTrigger(res);
      load();
      return res;
    } catch (e: any) {
      alert("Trigger failed: " + (e?.message || e));
      throw e;
    } finally {
      setTriggerBusy(false);
    }
  };

  const ctx: InventoryCtx = useMemo(
    () => ({ items, warehouses, locations, moves, quants, rules, onTrigger, triggerBusy, lastTrigger }),
    [items, warehouses, locations, moves, quants, rules, triggerBusy, lastTrigger],
  );

  return (
    <div className="min-h-[calc(100vh-44px)]">
      <div className="bg-white border-b border-ui-border px-4 py-2 flex items-center gap-3">
        <Link to="/" className="text-[12px] text-slate-500 hover:text-sai-navy">← Apps</Link>
        <div className="text-slate-300">/</div>
        <div className="text-[13px] font-semibold text-sai-navy font-display">Inventory</div>
        <div className="flex-1" />
        <Link to="/warehouses" className="text-[11px] text-sai-blue hover:underline">Warehouses</Link>
        <Link to="/stock-transfers" className="text-[11px] text-sai-blue hover:underline">Transfers</Link>
        <Link to="/reorder-rules" className="text-[11px] text-sai-blue hover:underline">Reorder rules</Link>
      </div>
      <PageRenderer<InventoryCtx>
        pageKey="inventory"
        registry={inventoryRegistry}
        ctx={ctx}
      />
    </div>
  );
}

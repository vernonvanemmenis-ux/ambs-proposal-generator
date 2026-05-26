/**
 * Warehouses page — one block: warehouse_list.
 *
 * Renders a tree-ish view: each warehouse expands to its internal
 * locations. Virtual locations (supplier/customer/scrap/production)
 * live in a separate "Virtual locations" card at the bottom — they
 * don't belong to a physical warehouse.
 */

import type { BlockProps } from "../components/PageRenderer";
import type { StockLocation, Warehouse } from "../api";


export type WarehousesCtx = {
  warehouses: Warehouse[];
  locations: StockLocation[];
  onEditWarehouse: (w: Warehouse | null) => void;
  onEditLocation: (l: StockLocation | null, defaults?: Partial<StockLocation>) => void;
};


export function WarehouseListBlock({ ctx }: BlockProps<WarehousesCtx>) {
  const internalByWh: Record<number, StockLocation[]> = {};
  for (const l of ctx.locations) {
    if (l.kind === "internal" && l.warehouse_id != null) {
      (internalByWh[l.warehouse_id] ??= []).push(l);
    }
  }
  const virtual = ctx.locations.filter((l) => l.kind !== "internal");

  return (
    <div className="px-4 py-4 space-y-4">
      <div className="space-y-3">
        {ctx.warehouses.length === 0 ? (
          <div className="bg-white border border-ui-border rounded-md p-6 text-center text-[12px] text-slate-500">
            No warehouses yet. Click <b>+ New warehouse</b> to add your first one.
          </div>
        ) : (
          ctx.warehouses.map((w) => {
            const locs = internalByWh[w.id] ?? [];
            return (
              <div key={w.id} className={`bg-white border border-ui-border rounded-md ${w.active ? "" : "opacity-60"}`}>
                <div className="px-3 py-2 border-b border-ui-border flex items-center gap-2">
                  <div className="flex-1">
                    <button
                      className="text-[13px] font-semibold text-sai-navy hover:text-sai-blue"
                      onClick={() => ctx.onEditWarehouse(w)}
                    >
                      {w.name}
                    </button>
                    {w.code && <span className="ml-2 text-[11px] text-slate-400 font-mono">{w.code}</span>}
                    {!w.active && (
                      <span className="ml-2 text-[9px] uppercase tracking-wider bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded font-semibold">
                        Inactive
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => ctx.onEditLocation(null, { warehouse_id: w.id, kind: "internal" })}
                    className="text-[11px] text-sai-blue hover:underline font-semibold"
                  >
                    + Add location
                  </button>
                </div>
                {locs.length === 0 ? (
                  <div className="px-3 py-3 text-[11px] text-slate-400 italic">
                    No internal locations. Add one to track stock here.
                  </div>
                ) : (
                  <ul className="divide-y divide-ui-border">
                    {locs.map((l) => (
                      <li key={l.id} className={`px-3 py-1.5 flex items-center gap-2 ${l.active ? "" : "opacity-60"}`}>
                        <span className="text-[12px] text-sai-navy">{l.name}</span>
                        {!l.active && (
                          <span className="text-[9px] uppercase tracking-wider bg-slate-200 text-slate-600 px-1 py-0 rounded font-semibold">
                            Inactive
                          </span>
                        )}
                        <div className="flex-1" />
                        <button
                          onClick={() => ctx.onEditLocation(l)}
                          className="text-[10px] text-slate-400 hover:text-sai-blue"
                        >
                          Edit
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })
        )}
      </div>

      <div className="bg-white border border-ui-border rounded-md">
        <div className="px-3 py-2 border-b border-ui-border flex items-center gap-2">
          <div className="text-[13px] font-semibold text-sai-navy">Virtual locations</div>
          <div className="text-[11px] text-slate-500">supplier / customer / scrap / production sinks</div>
          <div className="flex-1" />
          <button
            onClick={() => ctx.onEditLocation(null, { kind: "supplier" })}
            className="text-[11px] text-sai-blue hover:underline font-semibold"
          >
            + Add virtual
          </button>
        </div>
        {virtual.length === 0 ? (
          <div className="px-3 py-3 text-[11px] text-slate-400 italic">
            No virtual locations yet. Create at least one supplier and one customer for the PO receive flow and the sales delivery flow respectively.
          </div>
        ) : (
          <table className="w-full text-[12px]">
            <thead className="bg-slate-50 border-b border-ui-border text-left text-[10px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-3 py-1.5 font-semibold">Name</th>
                <th className="px-3 py-1.5 font-semibold">Kind</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {virtual.map((l) => (
                <tr key={l.id} className={`border-b border-ui-border last:border-0 ${l.active ? "" : "opacity-60"}`}>
                  <td className="px-3 py-1.5 text-sai-navy">{l.name}</td>
                  <td className="px-3 py-1.5 text-slate-500 capitalize">{l.kind}</td>
                  <td className="px-3 py-1.5 text-right">
                    <button
                      onClick={() => ctx.onEditLocation(l)}
                      className="text-[10px] text-slate-400 hover:text-sai-blue"
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}


export const warehousesRegistry = {
  warehouse_list: WarehouseListBlock,
} as const;

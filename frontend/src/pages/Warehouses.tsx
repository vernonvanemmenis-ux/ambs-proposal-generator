import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, type LocationKind, type StockLocation, type Warehouse } from "../api";
import PageRenderer from "../components/PageRenderer";
import RightDrawer, { DrawerCloseButton } from "../components/RightDrawer";
import { warehousesRegistry, type WarehousesCtx } from "../blocks/warehouses";


const KINDS: LocationKind[] = ["internal", "supplier", "customer", "production", "scrap"];


export default function Warehouses() {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [editingWh, setEditingWh] = useState<Partial<Warehouse> | null>(null);
  const [editingLoc, setEditingLoc] = useState<Partial<StockLocation> | null>(null);

  const load = () => {
    api.inventory.warehouses.list(true).then(setWarehouses).catch(() => {});
    api.inventory.locations.list({ include_inactive: true }).then(setLocations).catch(() => {});
  };
  useEffect(load, []);

  const ctx: WarehousesCtx = useMemo(
    () => ({
      warehouses,
      locations,
      onEditWarehouse: (w) => setEditingWh(w ? { ...w } : { name: "", code: "", active: true }),
      onEditLocation: (l, defaults) =>
        setEditingLoc(
          l
            ? { ...l }
            : { name: "", kind: "internal", warehouse_id: null, active: true, ...defaults },
        ),
    }),
    [warehouses, locations],
  );

  return (
    <div className="min-h-[calc(100vh-44px)]">
      <div className="bg-white border-b border-ui-border px-4 py-2 flex items-center gap-3">
        <Link to="/" className="text-[12px] text-slate-500 hover:text-sai-navy">← Apps</Link>
        <div className="text-slate-300">/</div>
        <Link to="/inventory" className="text-[12px] text-slate-500 hover:text-sai-navy">Inventory</Link>
        <div className="text-slate-300">/</div>
        <div className="text-[13px] font-semibold text-sai-navy font-display">Warehouses</div>
        <div className="flex-1" />
        <button
          onClick={() => setEditingWh({ name: "", code: "", active: true })}
          className="text-[11px] bg-sai-blue text-white px-3 py-1.5 rounded font-semibold hover:opacity-90"
        >
          + New warehouse
        </button>
      </div>
      <PageRenderer<WarehousesCtx>
        pageKey="warehouses"
        registry={warehousesRegistry}
        ctx={ctx}
      />
      {editingWh && (
        <WarehouseDrawer draft={editingWh} onClose={() => setEditingWh(null)} onSaved={() => { setEditingWh(null); load(); }} />
      )}
      {editingLoc && (
        <LocationDrawer
          draft={editingLoc}
          warehouses={warehouses}
          onClose={() => setEditingLoc(null)}
          onSaved={() => { setEditingLoc(null); load(); }}
        />
      )}
    </div>
  );
}


function WarehouseDrawer({ draft, onClose, onSaved }: {
  draft: Partial<Warehouse>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(draft.name ?? "");
  const [code, setCode] = useState(draft.code ?? "");
  const [active, setActive] = useState(draft.active ?? true);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      if (draft.id) {
        await api.inventory.warehouses.update(draft.id, { name, code, active });
      } else {
        await api.inventory.warehouses.create({ name, code, active });
      }
      onSaved();
    } catch (e: any) {
      alert("Save failed: " + (e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!draft.id) return;
    if (!confirm(`Mark "${name}" as inactive? Stock and locations are kept; this just hides it from active lists.`)) return;
    setBusy(true);
    try {
      await api.inventory.warehouses.delete(draft.id);
      onSaved();
    } catch (e: any) {
      alert("Delete failed: " + (e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <RightDrawer drawerKey="warehouse-editor" defaultWidth={420} minWidth={360} closeOnBackdropClick={false} onClose={onClose}>
      <div className="px-5 py-3 border-b border-ui-border flex items-center">
        <div className="text-[14px] font-display font-bold text-sai-navy">
          {draft.id ? "Edit warehouse" : "New warehouse"}
        </div>
        <div className="flex-1" />
        <DrawerCloseButton onClose={onClose} />
      </div>
      <div className="flex-1 overflow-y-auto scroll-thin px-5 py-4 space-y-3">
        <div>
          <div className="field-label">Name *</div>
          <input className="field-value" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <div className="field-label">Code</div>
          <input className="field-value font-mono uppercase" value={code} onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 20))} />
        </div>
        <label className="flex items-center gap-2 text-[12px] text-slate-700">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          Active
        </label>
      </div>
      <div className="px-5 py-3 border-t border-ui-border flex items-center gap-2">
        {draft.id && active && (
          <button onClick={remove} disabled={busy} className="text-[11px] text-red-600 hover:text-red-700 underline disabled:opacity-40">
            Mark inactive
          </button>
        )}
        <div className="flex-1" />
        <button onClick={onClose} className="text-[12px] px-3 py-1.5 text-slate-500 hover:text-slate-800">Cancel</button>
        <button onClick={save} disabled={busy || !name.trim()} className="text-[12px] bg-sai-blue text-white px-4 py-1.5 rounded font-semibold hover:opacity-90 disabled:opacity-40">
          {busy ? "Saving…" : draft.id ? "Save" : "Create"}
        </button>
      </div>
    </RightDrawer>
  );
}


function LocationDrawer({ draft, warehouses, onClose, onSaved }: {
  draft: Partial<StockLocation>;
  warehouses: Warehouse[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(draft.name ?? "");
  const [kind, setKind] = useState<LocationKind>((draft.kind as LocationKind) ?? "internal");
  const [whId, setWhId] = useState<number | null>(draft.warehouse_id ?? null);
  const [active, setActive] = useState(draft.active ?? true);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!name.trim()) return;
    if (kind === "internal" && !whId) {
      alert("Internal locations require a warehouse.");
      return;
    }
    setBusy(true);
    try {
      const body = {
        name,
        kind,
        warehouse_id: kind === "internal" ? whId : null,
        active,
      };
      if (draft.id) {
        await api.inventory.locations.update(draft.id, body);
      } else {
        await api.inventory.locations.create(body);
      }
      onSaved();
    } catch (e: any) {
      alert("Save failed: " + (e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!draft.id) return;
    if (!confirm(`Mark "${name}" as inactive? Historical stock moves are preserved.`)) return;
    setBusy(true);
    try {
      await api.inventory.locations.delete(draft.id);
      onSaved();
    } catch (e: any) {
      alert("Delete failed: " + (e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <RightDrawer drawerKey="location-editor" defaultWidth={420} minWidth={360} closeOnBackdropClick={false} onClose={onClose}>
      <div className="px-5 py-3 border-b border-ui-border flex items-center">
        <div className="text-[14px] font-display font-bold text-sai-navy">
          {draft.id ? "Edit location" : "New location"}
        </div>
        <div className="flex-1" />
        <DrawerCloseButton onClose={onClose} />
      </div>
      <div className="flex-1 overflow-y-auto scroll-thin px-5 py-4 space-y-3">
        <div>
          <div className="field-label">Name *</div>
          <input className="field-value" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <div className="field-label">Kind *</div>
          <select className="field-value" value={kind} onChange={(e) => setKind(e.target.value as LocationKind)}>
            {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
          <div className="text-[10px] text-slate-400 mt-1">
            internal = your storage; supplier/customer/production/scrap = virtual sinks (no warehouse needed).
          </div>
        </div>
        {kind === "internal" && (
          <div>
            <div className="field-label">Warehouse *</div>
            <select
              className="field-value"
              value={whId ?? ""}
              onChange={(e) => setWhId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">— pick a warehouse —</option>
              {warehouses.filter((w) => w.active).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
        )}
        <label className="flex items-center gap-2 text-[12px] text-slate-700">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          Active
        </label>
      </div>
      <div className="px-5 py-3 border-t border-ui-border flex items-center gap-2">
        {draft.id && active && (
          <button onClick={remove} disabled={busy} className="text-[11px] text-red-600 hover:text-red-700 underline disabled:opacity-40">
            Mark inactive
          </button>
        )}
        <div className="flex-1" />
        <button onClick={onClose} className="text-[12px] px-3 py-1.5 text-slate-500 hover:text-slate-800">Cancel</button>
        <button onClick={save} disabled={busy || !name.trim()} className="text-[12px] bg-sai-blue text-white px-4 py-1.5 rounded font-semibold hover:opacity-90 disabled:opacity-40">
          {busy ? "Saving…" : draft.id ? "Save" : "Create"}
        </button>
      </div>
    </RightDrawer>
  );
}

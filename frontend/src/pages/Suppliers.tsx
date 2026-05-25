/**
 * Suppliers page — vendor directory.
 *
 * Mirrors Clients.tsx shape but renders the body via <PageRenderer> so
 * the Studio drawer can toggle the supplier_list block. The right-side
 * edit drawer covers BOTH the supplier fields and the per-supplier
 * item-link table (M1's join data — used by M2's Purchase planner).
 */

import { useEffect, useMemo, useState } from "react";
import { api, type Item, type ItemSupplier, type Supplier } from "../api";
import PageRenderer from "../components/PageRenderer";
import RightDrawer, { DrawerCloseButton } from "../components/RightDrawer";
import { suppliersRegistry, type SuppliersCtx } from "../blocks/suppliers";


type Draft = Partial<Supplier> & { id?: number };
type LinkDraft = Partial<ItemSupplier> & { id?: number; _new?: boolean };


export default function Suppliers() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<Draft | null>(null);

  const load = () => {
    api.suppliers.list(showInactive).then(setSuppliers).catch(() => {});
    api.items.list().then(setItems).catch(() => {});
  };

  useEffect(load, [showInactive]);

  const ctx: SuppliersCtx = useMemo(
    () => ({
      suppliers,
      search,
      setSearch,
      showInactive,
      setShowInactive,
      onRowClick: (s) => setEditing({ ...s }),
      onNew: () => setEditing({
        name: "",
        contact_person: "",
        email: "",
        phone: "",
        address: "",
        payment_terms: "",
        lead_time_days: 0,
        active: true,
        notes: "",
        item_links: [],
      }),
    }),
    [suppliers, search, showInactive],
  );

  return (
    <div className="min-h-[calc(100vh-44px)]">
      <PageRenderer<SuppliersCtx>
        pageKey="suppliers"
        registry={suppliersRegistry}
        ctx={ctx}
      />

      {editing && (
        <SupplierDrawer
          draft={editing}
          items={items}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
          onDeleted={() => { setEditing(null); load(); }}
        />
      )}
    </div>
  );
}


type DrawerProps = {
  draft: Draft;
  items: Item[];
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
};

function SupplierDrawer({ draft, items, onClose, onSaved, onDeleted }: DrawerProps) {
  const [editing, setEditing] = useState<Draft>(draft);
  const [links, setLinks] = useState<LinkDraft[]>(draft.item_links ?? []);
  const [busy, setBusy] = useState(false);

  const itemById = useMemo(() => {
    const m: Record<number, Item> = {};
    for (const it of items) m[it.id] = it;
    return m;
  }, [items]);

  const save = async () => {
    if (!editing.name?.trim()) return;
    setBusy(true);
    try {
      let savedId = editing.id;
      if (editing.id) {
        await api.suppliers.update(editing.id, editing);
      } else {
        const created = await api.suppliers.create(editing);
        savedId = created.id;
      }
      // Persist link changes (creates/updates/deletes)
      if (savedId) {
        const originalLinks = draft.item_links ?? [];
        const originalIds = new Set(originalLinks.map((l) => l.id));
        const currentIds = new Set(links.filter((l) => l.id).map((l) => l.id!));
        // Deletes
        for (const orig of originalLinks) {
          if (!currentIds.has(orig.id)) {
            await api.suppliers.items.delete(savedId, orig.id);
          }
        }
        // Creates + updates
        for (const l of links) {
          if (!l.item_id || !l.item_id) continue;
          const body = {
            item_id: l.item_id,
            supplier_id: savedId,
            supplier_code: l.supplier_code ?? "",
            supplier_price: Number(l.supplier_price ?? 0),
            currency: l.currency ?? "ZAR",
            min_qty: Number(l.min_qty ?? 0),
            lead_time_days: Number(l.lead_time_days ?? 0),
          };
          if (l.id && originalIds.has(l.id)) {
            await api.suppliers.items.update(savedId, l.id, body);
          } else if (l._new) {
            await api.suppliers.items.create(savedId, body);
          }
        }
      }
      onSaved();
    } catch (e: any) {
      alert("Save failed: " + (e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!editing.id) return;
    if (!confirm(`Mark "${editing.name}" as inactive? Historical purchase orders will still reference them.`)) return;
    setBusy(true);
    try {
      await api.suppliers.delete(editing.id);
      onDeleted();
    } catch (e: any) {
      alert("Delete failed: " + (e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  const addLink = () => {
    setLinks((ls) => [
      ...ls,
      {
        _new: true,
        item_id: items[0]?.id,
        supplier_id: editing.id ?? 0,
        supplier_code: "",
        supplier_price: items[0]?.default_rate ?? 0,
        currency: "ZAR",
        min_qty: 0,
        lead_time_days: 0,
      },
    ]);
  };

  const updateLink = (i: number, patch: Partial<LinkDraft>) => {
    setLinks((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  };

  const removeLink = (i: number) => {
    setLinks((ls) => ls.filter((_, idx) => idx !== i));
  };

  return (
    <RightDrawer
      drawerKey="supplier-editor"
      defaultWidth={520}
      minWidth={440}
      closeOnBackdropClick={false}
      onClose={onClose}
    >
      <div className="px-5 py-3 border-b border-ui-border flex items-center">
        <div className="text-[14px] font-display font-bold text-sai-navy">
          {editing.id ? "Edit Supplier" : "New Supplier"}
        </div>
        <div className="flex-1" />
        <DrawerCloseButton onClose={onClose} />
      </div>

      <div className="flex-1 overflow-y-auto scroll-thin px-5 py-4 space-y-3">
        <DField label="Name *" value={editing.name ?? ""} onChange={(v) => setEditing({ ...editing, name: v })} />
        <DField label="Contact person" value={editing.contact_person ?? ""} onChange={(v) => setEditing({ ...editing, contact_person: v })} />
        <DField label="Email" value={editing.email ?? ""} onChange={(v) => setEditing({ ...editing, email: v })} />
        <DField label="Phone" value={editing.phone ?? ""} onChange={(v) => setEditing({ ...editing, phone: v })} />
        <DField label="Address" value={editing.address ?? ""} onChange={(v) => setEditing({ ...editing, address: v })} />
        <DField label="Payment terms" value={editing.payment_terms ?? ""} onChange={(v) => setEditing({ ...editing, payment_terms: v })} />
        <div>
          <div className="field-label">Lead time (days)</div>
          <input
            type="number"
            min={0}
            className="field-value"
            value={editing.lead_time_days ?? 0}
            onChange={(e) => setEditing({ ...editing, lead_time_days: Number(e.target.value) || 0 })}
          />
        </div>
        <div>
          <div className="field-label">Notes</div>
          <textarea
            className="field-value"
            rows={3}
            value={editing.notes ?? ""}
            onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
          />
        </div>

        <div className="pt-4 border-t border-ui-border">
          <div className="flex items-center justify-between mb-2">
            <div className="field-label">Items this supplier provides</div>
            <button
              type="button"
              onClick={addLink}
              disabled={items.length === 0}
              className="text-[11px] text-sai-blue hover:underline font-semibold disabled:opacity-40"
            >
              + Add item
            </button>
          </div>
          {links.length === 0 && (
            <div className="text-[11px] text-slate-400 italic">
              No items linked. Add one to expose this supplier in the M2 Purchase planner.
            </div>
          )}
          <div className="space-y-2">
            {links.map((l, i) => (
              <div key={i} className="border border-ui-border rounded p-2 bg-slate-50">
                <div className="flex items-center gap-2 mb-2">
                  <select
                    value={l.item_id ?? ""}
                    onChange={(e) => updateLink(i, { item_id: Number(e.target.value) })}
                    className="flex-1 min-w-0 border border-ui-border rounded px-2 py-1 text-[12px] focus:outline-none focus:border-sai-blue"
                  >
                    {items.map((it) => (
                      <option key={it.id} value={it.id}>
                        {it.code} · {it.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => removeLink(i)}
                    className="text-slate-400 hover:text-red-600 text-[14px] leading-none px-1"
                    title="Remove link"
                  >×</button>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  <LinkInput label="Supplier code" value={l.supplier_code ?? ""} onChange={(v) => updateLink(i, { supplier_code: v })} />
                  <LinkInput label="Price" type="number" value={String(l.supplier_price ?? 0)} onChange={(v) => updateLink(i, { supplier_price: Number(v) || 0 })} />
                  <LinkInput label="Min qty" type="number" value={String(l.min_qty ?? 0)} onChange={(v) => updateLink(i, { min_qty: Number(v) || 0 })} />
                  <LinkInput label="Lead (d)" type="number" value={String(l.lead_time_days ?? 0)} onChange={(v) => updateLink(i, { lead_time_days: Number(v) || 0 })} />
                </div>
                {l.item_id && itemById[l.item_id] && (
                  <div className="text-[10px] text-slate-500 mt-1">
                    Catalogue default rate: R {itemById[l.item_id].default_rate.toLocaleString("en-ZA", { maximumFractionDigits: 2 })}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="px-5 py-3 border-t border-ui-border flex items-center gap-2">
        {editing.id && editing.active !== false && (
          <button
            onClick={remove}
            disabled={busy}
            className="text-[11px] text-red-600 hover:text-red-700 underline disabled:opacity-40"
          >
            Mark inactive
          </button>
        )}
        <div className="flex-1" />
        <button onClick={onClose} className="text-[12px] px-3 py-1.5 text-slate-500 hover:text-slate-800">
          Cancel
        </button>
        <button
          onClick={save}
          disabled={busy || !editing.name?.trim()}
          className="text-[12px] bg-sai-blue text-white px-4 py-1.5 rounded font-semibold hover:opacity-90 disabled:opacity-40"
        >
          {busy ? "Saving…" : editing.id ? "Save" : "Create"}
        </button>
      </div>
    </RightDrawer>
  );
}


function DField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <div className="field-label">{label}</div>
      <input className="field-value" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}


function LinkInput({ label, value, onChange, type = "text" }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div>
      <div className="text-[9px] uppercase tracking-wider text-slate-500 font-semibold mb-0.5">{label}</div>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border border-ui-border rounded px-1.5 py-1 text-[11px] focus:outline-none focus:border-sai-blue"
      />
    </div>
  );
}

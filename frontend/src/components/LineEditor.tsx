import { useEffect, useState } from "react";
import { api, type Catalogue, type Item, type OpportunityLineDraft } from "../api";

type Line = OpportunityLineDraft & { id?: number };

export default function LineEditor({
  lines,
  catalogue,
  onChange,
}: {
  lines: Line[];
  catalogue: Catalogue | null;
  onChange: (next: Line[]) => void;
}) {
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    api.items.list().then(setItems).catch(() => setItems([]));
  }, []);

  const itemByName = (name: string) => items.find((i) => i.name === name);

  const update = (i: number, patch: Partial<Line>) => {
    const next = lines.slice();
    next[i] = { ...next[i], ...patch };
    onChange(next);
  };

  const pickItem = (i: number, name: string) => {
    const found = itemByName(name);
    if (!found) {
      update(i, { description: name });
      return;
    }
    update(i, {
      item_code: found.code,
      description: found.description || found.name,
      unit_of_measure: found.unit_of_measure,
      unit_rate: found.default_rate,
      product_line: found.product_line || lines[i].product_line,
      structure_type: found.structure_type || lines[i].structure_type,
    });
  };

  const remove = (i: number) => onChange(lines.filter((_, j) => j !== i));

  const add = () =>
    onChange([
      ...lines,
      {
        sequence: lines.length,
        item_code: "",
        product_line: "",
        structure_type: "",
        description: "",
        quantity: 1,
        unit_of_measure: "each",
        unit_rate: 0,
        discount_pct: 0,
        is_optional: false,
        cost_rate: 0,
      },
    ]);

  const lineTotalOf = (ln: Line) => {
    const qty = Number(ln.quantity) || 0;
    const rate = Number(ln.unit_rate) || 0;
    const disc = Number(ln.discount_pct) || 0;
    return qty * rate * (1 - disc / 100);
  };
  const marginOf = (ln: Line) => {
    const cost = Number(ln.cost_rate) || 0;
    if (cost <= 0) return null;
    return lineTotalOf(ln) - (Number(ln.quantity) || 0) * cost;
  };

  // Mandatory lines drive the headline subtotal. Optional lines are surfaced
  // separately so AMBS can show upsells without inflating the main quote.
  const subtotal = lines
    .filter((ln) => !ln.is_optional)
    .reduce((s, ln) => s + lineTotalOf(ln), 0);
  const optionalTotal = lines
    .filter((ln) => ln.is_optional)
    .reduce((s, ln) => s + lineTotalOf(ln), 0);

  const money = (n: number) =>
    "R " + n.toLocaleString("en-ZA", { maximumFractionDigits: 0 });

  const itemsByCategory = items.reduce<Record<string, Item[]>>((m, it) => {
    (m[it.category] ??= []).push(it);
    return m;
  }, {});

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="field-label">Line Items</div>
        <button
          onClick={add}
          className="text-[10px] border border-sai-blue text-sai-blue px-2 py-0.5 rounded font-semibold hover:bg-sai-bluepale"
        >
          + Add line
        </button>
      </div>

      <div className="border border-odoo-border rounded-md overflow-x-auto scroll-thin">
        <div className="grid grid-cols-[minmax(220px,2fr)_minmax(150px,1.2fr)_minmax(130px,1fr)_60px_70px_80px_56px_72px_44px_90px_24px] gap-x-1 bg-slate-50 border-b border-odoo-border px-2 py-1 text-[9px] uppercase tracking-wider font-semibold text-slate-500">
          <div>Item / Description</div>
          <div>Product Line</div>
          <div>Structure</div>
          <div className="text-right">Qty</div>
          <div>UoM</div>
          <div className="text-right">Unit Rate</div>
          <div className="text-right" title="Discount percentage">Disc %</div>
          <div className="text-right" title="Internal cost (not shown to client)">Cost</div>
          <div className="text-center" title="Mark as an optional add-on (won't be summed into total)">Opt.</div>
          <div className="text-right">Line Total</div>
          <div />
        </div>
        {lines.length === 0 && (
          <div className="px-3 py-5 text-[11px] text-slate-400 italic text-center">
            No line items yet. Click + Add line to add one.
          </div>
        )}
        {lines.map((ln, i) => {
          const lineTotal = lineTotalOf(ln);
          const margin = marginOf(ln);
          const rowClass = ln.is_optional
            ? "bg-amber-50/40 hover:bg-amber-50"
            : "hover:bg-odoo-rowhover";
          return (
            <div
              key={i}
              className={`grid grid-cols-[minmax(220px,2fr)_minmax(150px,1.2fr)_minmax(130px,1fr)_60px_70px_80px_56px_72px_44px_90px_24px] gap-x-1 items-center border-b border-odoo-border last:border-0 px-2 py-1 text-[11px] ${rowClass}`}
            >
              <div className="flex flex-col gap-0.5">
                <input
                  className="line-input"
                  list={`items-list-${i}`}
                  placeholder="Type item name or description…"
                  value={ln.description}
                  title={ln.item_code ? `${ln.item_code} · ${ln.description}` : ln.description}
                  onChange={(e) => pickItem(i, e.target.value)}
                />
                <datalist id={`items-list-${i}`}>
                  {Object.entries(itemsByCategory).map(([cat, its]) => (
                    <optgroup key={cat} label={cat}>
                      {its.map((it) => (
                        <option key={it.id} value={it.name}>
                          {it.code} · {it.unit_of_measure} · R{" "}
                          {it.default_rate.toLocaleString("en-ZA")}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </datalist>
                {(ln.item_code || margin !== null) && (
                  <div className="text-[9px] text-slate-400 pl-1 truncate flex gap-2" title={ln.item_code}>
                    {ln.item_code && <span>{ln.item_code}</span>}
                    {margin !== null && (
                      <span className={margin >= 0 ? "text-emerald-600" : "text-red-500"}>
                        margin {money(margin)}
                      </span>
                    )}
                  </div>
                )}
              </div>
              <select
                className="line-input"
                value={ln.product_line}
                title={ln.product_line}
                onChange={(e) => update(i, { product_line: e.target.value })}
              >
                <option value="">—</option>
                {catalogue?.product_lines.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
              <select
                className="line-input"
                value={ln.structure_type}
                title={ln.structure_type}
                onChange={(e) => update(i, { structure_type: e.target.value })}
              >
                <option value="">—</option>
                {catalogue?.structure_types.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <input
                type="number"
                step="0.01"
                className="line-input text-right"
                value={ln.quantity}
                onChange={(e) => update(i, { quantity: Number(e.target.value) || 0 })}
              />
              <select
                className="line-input"
                value={ln.unit_of_measure}
                onChange={(e) => update(i, { unit_of_measure: e.target.value })}
              >
                {(catalogue?.units_of_measure ?? ["each", "m²"]).map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
              <input
                type="number"
                className="line-input text-right"
                value={ln.unit_rate}
                onChange={(e) => update(i, { unit_rate: Number(e.target.value) || 0 })}
              />
              <input
                type="number"
                min={0}
                max={100}
                step="0.5"
                className="line-input text-right"
                value={ln.discount_pct ?? 0}
                onChange={(e) => update(i, { discount_pct: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })}
              />
              <input
                type="number"
                className="line-input text-right"
                value={ln.cost_rate ?? 0}
                onChange={(e) => update(i, { cost_rate: Number(e.target.value) || 0 })}
                placeholder="—"
                title="Internal cost rate. Used to compute margin. Never printed on the proposal."
              />
              <div className="text-center">
                <input
                  type="checkbox"
                  className="accent-amber-500 cursor-pointer"
                  checked={!!ln.is_optional}
                  onChange={(e) => update(i, { is_optional: e.target.checked })}
                  title="Optional add-on (renders as a separate table in the proposal, not summed)"
                />
              </div>
              <div className="text-right pr-1 font-semibold text-sai-blue tabular-nums whitespace-nowrap">
                {money(lineTotal)}
              </div>
              <button
                onClick={() => remove(i)}
                title="Remove line"
                className="text-slate-300 hover:text-red-500 text-[14px] leading-none"
              >
                ×
              </button>
            </div>
          );
        })}
        {lines.length > 0 && (
          <div className="bg-slate-50 border-t border-odoo-border px-2 py-1.5 text-[11px] space-y-0.5">
            <div className="flex justify-end gap-4">
              <div className="text-slate-500 uppercase tracking-wider text-[9px] font-semibold self-center">
                Subtotal
              </div>
              <div className="font-bold text-sai-navy tabular-nums pr-7 min-w-[100px] text-right">
                {money(subtotal)}
              </div>
            </div>
            {optionalTotal > 0 && (
              <div className="flex justify-end gap-4">
                <div className="text-amber-600 uppercase tracking-wider text-[9px] font-semibold self-center">
                  Optional add-ons (not in total)
                </div>
                <div className="font-semibold text-amber-700 tabular-nums pr-7 min-w-[100px] text-right">
                  {money(optionalTotal)}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="text-[10px] text-slate-400 italic pl-1">
        Tip: type in the Item field to search the catalogue — selecting an item auto-fills UoM + rate. You can override any field manually.
      </div>
    </div>
  );
}

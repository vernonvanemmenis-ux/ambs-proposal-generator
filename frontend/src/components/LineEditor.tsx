import { useEffect, useState } from "react";
import { api, type Catalogue, type Item, type OpportunityLineDraft } from "../api";
import CataloguePicker from "./CataloguePicker";
import HelpPopover, { type HelpContent } from "./HelpPopover";

type Line = OpportunityLineDraft & { id?: number };

const HELP: Record<string, HelpContent> = {
  quantity: {
    id: "line.quantity",
    title: "Quantity",
    body:
      "How many of this item are you supplying. Match the unit of measure on the right — for area-based items use m², for individual units use 'each', for trips/days use the right time unit.",
    example: "80 sleeping units = 960 m² (12 m² × 80) when priced by area.",
  },
  uom: {
    id: "line.uom",
    title: "Unit of measure",
    body:
      "How the item is priced.\n• m² for area-priced structures (modules, classrooms).\n• each for whole units (containers, AC units, doors).\n• km for delivery, day for crane, night for crew accommodation.\n• lump sum for fixed services like commissioning.",
  },
  unit_rate: {
    id: "line.unit_rate",
    title: "Unit rate (ZAR)",
    body:
      "Price per single unit before discount. Auto-fills from the items catalogue when you pick an item, but you can override per quote.",
    example: "STR-OFF-PF defaults to R 9 200 / m². Override to R 9 500 / m² if site conditions require.",
  },
  discount: {
    id: "line.discount",
    title: "Discount %",
    body:
      "Percentage discount applied to this line only. The .docx proposal shows the discount column and recalculates the line total. Leave at 0 for no discount.",
    example: "10% discount on R 100 000 line = R 90 000 final.",
  },
  cost: {
    id: "line.cost",
    title: "Cost rate (internal)",
    body:
      "Your internal cost per unit. NEVER printed in the proposal — used only to show your margin inline so you can quote with eyes on profit. Leave at 0 if you don't track per-line costs.",
    example: "Selling at R 9 200 / m² with R 6 800 / m² cost shows a R 2 400 / m² margin.",
  },
  optional: {
    id: "line.optional",
    title: "Optional add-on",
    body:
      "Ticking this moves the line into a separate 'Optional Add-ons' table in the .docx. The amount is shown but NOT summed into the headline total — clients see it as an upsell they can choose to include.",
  },
};

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
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    api.items.list().then(setItems).catch(() => setItems([]));
  }, []);

  const handlePicked = (picks: { item: Item; quantity: number }[]) => {
    const next = [...lines];
    for (const p of picks) {
      next.push({
        sequence: next.length,
        item_code: p.item.code,
        product_line: p.item.product_line,
        structure_type: p.item.structure_type,
        description: p.item.description || p.item.name,
        quantity: p.quantity,
        unit_of_measure: p.item.unit_of_measure,
        unit_rate: p.item.default_rate,
        discount_pct: 0,
        is_optional: false,
        cost_rate: 0,
        bundle_label: "",
      });
    }
    onChange(next);
    setPicking(false);
  };

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
        bundle_label: "",
      },
    ]);

  const removeBundle = (label: string) =>
    onChange(lines.filter((ln) => (ln.bundle_label || "") !== label));
  const unbundle = (label: string) =>
    onChange(lines.map((ln) => ((ln.bundle_label || "") === label ? { ...ln, bundle_label: "" } : ln)));

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
        <div className="flex gap-1.5">
          <button
            onClick={() => setPicking(true)}
            className="text-[10px] bg-sai-blue text-white px-2 py-0.5 rounded font-semibold hover:opacity-90"
            title="Browse the catalogue with category and tag filters"
          >
            🗂️ Pick from catalogue
          </button>
          <button
            onClick={add}
            className="text-[10px] border border-sai-blue text-sai-blue px-2 py-0.5 rounded font-semibold hover:bg-sai-bluepale"
          >
            + Blank line
          </button>
        </div>
      </div>
      {picking && (
        <CataloguePicker onClose={() => setPicking(false)} onPick={handlePicked} />
      )}

      <div className="border border-ui-border rounded-md overflow-x-auto scroll-thin">
        <div className="grid grid-cols-[minmax(220px,2fr)_minmax(150px,1.2fr)_minmax(130px,1fr)_60px_70px_80px_56px_72px_44px_90px_24px] gap-x-1 bg-slate-50 border-b border-ui-border px-2 py-1 text-[9px] uppercase tracking-wider font-semibold text-slate-500">
          <div>Item / Description</div>
          <div>Product Line</div>
          <div>Structure</div>
          <div className="text-right flex items-center justify-end">Qty<HelpPopover help={HELP.quantity} /></div>
          <div className="flex items-center">UoM<HelpPopover help={HELP.uom} /></div>
          <div className="text-right flex items-center justify-end">Unit Rate<HelpPopover help={HELP.unit_rate} /></div>
          <div className="text-right flex items-center justify-end">Disc<HelpPopover help={HELP.discount} /></div>
          <div className="text-right flex items-center justify-end">Cost<HelpPopover help={HELP.cost} /></div>
          <div className="text-center flex items-center justify-center">Opt.<HelpPopover help={HELP.optional} /></div>
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
            : "hover:bg-ui-rowhover";
          // Render a bundle sub-header when the bundle_label transitions.
          // Bundles must be contiguous in the lines array (the apply logic
          // appends bundles, so this holds by construction).
          const label = (ln.bundle_label || "").trim();
          const prevLabel = i > 0 ? (lines[i - 1].bundle_label || "").trim() : null;
          const showHeader = label && label !== prevLabel;
          const bundleTotal = showHeader
            ? lines
                .filter((x) => (x.bundle_label || "").trim() === label)
                .reduce((s, x) => s + lineTotalOf(x), 0)
            : 0;
          return (
            <div key={`grp-${i}`}>
            {showHeader && (
              <div className="flex items-center gap-2 bg-sai-bluepale/70 border-b border-sai-blue/30 px-2 py-1 text-[11px]">
                <span className="text-sai-blue font-semibold">▸ {label}</span>
                <span className="text-[10px] text-slate-500">bundle</span>
                <div className="flex-1" />
                <span className="text-[11px] font-semibold text-sai-blue tabular-nums">{money(bundleTotal)}</span>
                <button
                  type="button"
                  onClick={() => unbundle(label)}
                  title="Keep these lines but ungroup the bundle"
                  className="text-[10px] text-slate-500 hover:text-sai-blue font-semibold px-1.5"
                >
                  ungroup
                </button>
                <button
                  type="button"
                  onClick={() => removeBundle(label)}
                  title="Remove this entire bundle (all lines)"
                  className="text-[10px] text-red-500 hover:text-red-700 font-semibold px-1.5"
                >
                  remove
                </button>
              </div>
            )}
            <div
              className={`grid grid-cols-[minmax(220px,2fr)_minmax(150px,1.2fr)_minmax(130px,1fr)_60px_70px_80px_56px_72px_44px_90px_24px] gap-x-1 items-center border-b border-ui-border last:border-0 px-2 py-1 text-[11px] ${rowClass}`}
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
                step={ln.unit_of_measure === "each" ? 1 : 0.01}
                min={0}
                className="line-input text-right"
                value={ln.quantity}
                onChange={(e) => update(i, { quantity: Number(e.target.value) || 0 })}
                title={ln.unit_of_measure === "each" ? "Whole units only" : "Fractional quantity allowed"}
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
            </div>
          );
        })}
        {lines.length > 0 && (
          <div className="bg-slate-50 border-t border-ui-border px-2 py-1.5 text-[11px] space-y-0.5">
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

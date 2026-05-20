import { useEffect, useMemo, useState } from "react";
import { api, type Item } from "../api";

type PickedItem = {
  item: Item;
  quantity: number;
};

type Props = {
  onClose: () => void;
  onPick: (picks: PickedItem[]) => void;
};

function parseTags(s: string): string[] {
  return (s || "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

function money(v: number) {
  return "R " + v.toLocaleString("en-ZA", { maximumFractionDigits: 0 });
}

export default function CataloguePicker({ onClose, onPick }: Props) {
  const [items, setItems] = useState<Item[]>([]);
  const [category, setCategory] = useState<string>("All");
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [picks, setPicks] = useState<Record<number, number>>({});

  useEffect(() => {
    api.items.list().then(setItems).catch(() => setItems([]));
  }, []);

  const categories = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const it of items) counts[it.category] = (counts[it.category] || 0) + 1;
    return Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [items]);

  const allTags = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const it of items) {
      for (const tag of parseTags(it.tags)) {
        counts[tag] = (counts[tag] || 0) + 1;
      }
    }
    return Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [items]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((it) => {
      if (category !== "All" && it.category !== category) return false;
      if (activeTags.size > 0) {
        const itemTags = new Set(parseTags(it.tags));
        for (const t of activeTags) if (!itemTags.has(t)) return false;
      }
      if (q) {
        const hay = `${it.code} ${it.name} ${it.description} ${it.product_line}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [items, category, activeTags, search]);

  const toggleTag = (t: string) => {
    setActiveTags((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  };

  const addPick = (id: number) =>
    setPicks((p) => ({ ...p, [id]: (p[id] ?? 0) + 1 }));
  const setPickQty = (id: number, qty: number) => {
    setPicks((p) => {
      const next = { ...p };
      if (qty <= 0) delete next[id];
      else next[id] = qty;
      return next;
    });
  };
  const totalPicks = Object.values(picks).reduce((a, b) => a + b, 0);

  const submit = () => {
    const out: PickedItem[] = [];
    for (const [idStr, qty] of Object.entries(picks)) {
      const id = Number(idStr);
      const item = items.find((x) => x.id === id);
      if (item) out.push({ item, quantity: qty });
    }
    onPick(out);
  };

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex justify-end" onClick={onClose}>
      <div
        className="bg-white w-[920px] max-w-full h-full shadow-2xl flex"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-[240px] border-r border-ui-border flex flex-col bg-slate-50">
          <div className="px-4 py-3 border-b border-ui-border">
            <div className="text-[11px] uppercase tracking-wider font-semibold text-slate-500">
              Catalogue
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              Pick items, then click Add
            </div>
          </div>

          <div className="px-3 py-3 border-b border-ui-border">
            <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-2">
              📁 Categories
            </div>
            <button
              onClick={() => setCategory("All")}
              className={`w-full text-left text-[12px] px-2 py-1 rounded ${
                category === "All" ? "bg-sai-blue text-white font-semibold" : "hover:bg-slate-200 text-slate-700"
              }`}
            >
              All <span className="text-[10px] opacity-70">{items.length}</span>
            </button>
            {categories.map((c) => (
              <button
                key={c.name}
                onClick={() => setCategory(c.name)}
                className={`w-full text-left text-[12px] px-2 py-1 rounded ${
                  category === c.name ? "bg-sai-blue text-white font-semibold" : "hover:bg-slate-200 text-slate-700"
                }`}
              >
                {c.name} <span className="text-[10px] opacity-70">{c.count}</span>
              </button>
            ))}
          </div>

          <div className="px-3 py-3 flex-1 overflow-y-auto scroll-thin">
            <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-2">
              🏷️ Tags
            </div>
            <div className="space-y-1">
              {allTags.map((t) => {
                const on = activeTags.has(t.name);
                return (
                  <label
                    key={t.name}
                    className={`flex items-center gap-2 text-[12px] px-2 py-1 rounded cursor-pointer ${
                      on ? "bg-sai-bluepale text-sai-blue font-semibold" : "hover:bg-slate-200 text-slate-700"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => toggleTag(t.name)}
                      className="accent-sai-blue"
                    />
                    <span className="flex-1 truncate">{t.name}</span>
                    <span className="text-[10px] opacity-70">{t.count}</span>
                  </label>
                );
              })}
              {allTags.length === 0 && (
                <div className="text-[11px] text-slate-400 italic">No tags yet</div>
              )}
            </div>
            {activeTags.size > 0 && (
              <button
                onClick={() => setActiveTags(new Set())}
                className="mt-2 text-[10px] text-sai-blue hover:underline"
              >
                Clear all tags
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 flex flex-col min-w-0">
          <div className="px-4 py-3 border-b border-ui-border flex items-center gap-3">
            <div className="text-[14px] font-display font-bold text-sai-navy">
              {filtered.length} item{filtered.length === 1 ? "" : "s"}
            </div>
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by code, name, or description…"
              className="flex-1 text-[13px] border border-ui-border rounded px-3 py-1.5 outline-none focus:border-sai-blue"
            />
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-700 text-lg leading-none px-1"
            >
              ×
            </button>
          </div>

          <div className="flex-1 overflow-y-auto scroll-thin px-4 py-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filtered.map((it) => {
                const picked = picks[it.id] ?? 0;
                const tags = parseTags(it.tags);
                return (
                  <div
                    key={it.id}
                    className={`border rounded-md p-3 transition ${
                      picked > 0 ? "border-sai-blue bg-sai-bluepale" : "border-ui-border bg-white hover:shadow-card"
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-[12px] font-semibold text-sai-navy leading-tight">
                          {it.name}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5">{it.code}</div>
                        {it.description && (
                          <div className="text-[11px] text-slate-500 mt-1 line-clamp-2" title={it.description}>
                            {it.description}
                          </div>
                        )}
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-[12px] font-bold text-sai-blue">
                          {money(it.default_rate)}
                        </div>
                        <div className="text-[10px] text-slate-400">/ {it.unit_of_measure}</div>
                      </div>
                    </div>

                    {tags.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {tags.map((t) => (
                          <span
                            key={t}
                            className="text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-semibold"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="mt-3 flex items-center justify-end gap-2">
                      {picked > 0 ? (
                        <>
                          <button
                            onClick={() => setPickQty(it.id, picked - 1)}
                            className="w-6 h-6 rounded border border-ui-border text-slate-600 hover:bg-slate-50 text-[12px]"
                          >
                            −
                          </button>
                          <input
                            type="number"
                            value={picked}
                            min={0}
                            onChange={(e) => setPickQty(it.id, Number(e.target.value) || 0)}
                            className="w-14 text-center text-[12px] border border-ui-border rounded py-0.5"
                          />
                          <button
                            onClick={() => setPickQty(it.id, picked + 1)}
                            className="w-6 h-6 rounded border border-ui-border text-slate-600 hover:bg-slate-50 text-[12px]"
                          >
                            +
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => addPick(it.id)}
                          className="text-[11px] bg-sai-blue text-white px-3 py-1 rounded font-semibold hover:opacity-90"
                        >
                          + Add
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
              {filtered.length === 0 && (
                <div className="col-span-full text-center text-[12px] text-slate-400 italic py-10">
                  No items match the current filters.
                </div>
              )}
            </div>
          </div>

          <div className="border-t border-ui-border px-4 py-3 flex items-center gap-3">
            <div className="text-[12px] text-slate-500">
              {totalPicks > 0 ? (
                <>
                  <span className="font-semibold text-sai-navy">{totalPicks}</span> item
                  {totalPicks === 1 ? "" : "s"} selected
                </>
              ) : (
                <span className="italic">Nothing selected yet</span>
              )}
            </div>
            <div className="flex-1" />
            <button
              onClick={onClose}
              className="text-[12px] text-slate-500 hover:text-slate-800 px-3 py-1.5"
            >
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={totalPicks === 0}
              className="text-[12px] bg-sai-blue text-white px-4 py-1.5 rounded font-semibold hover:opacity-90 disabled:opacity-40"
            >
              Add to quote
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

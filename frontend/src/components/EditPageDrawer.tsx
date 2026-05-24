/**
 * Studio mode — page editor drawer.
 *
 * Lists every block registered for the current page, lets the user toggle
 * each one on/off and reorder via ↑/↓. Save writes the new layout via
 * PUT /api/layouts/<page_key>; "Reset to defaults" hits POST /reset to
 * wipe the row so subsequent GETs return the registry default order.
 *
 * No drag-and-drop yet — keyboard-friendly ↑/↓ buttons match the section-
 * card pattern already used in TemplateEditor.tsx (Studio plan §3).
 *
 * For custom:<slug> pages (Phase A.5) the footer also shows a "Delete
 * this page" link that removes the underlying tile and cascades to wipe
 * the page_layouts row.
 */

import { useEffect, useState } from "react";
import { api, type BlockRegistryMeta, type CustomTile, type PageLayoutBlock, type PageRegistry } from "../api";
import RightDrawer, { DrawerCloseButton } from "./RightDrawer";


const CUSTOM_PREFIX = "custom:";


type Props = {
  pageKey: string;
  onClose: () => void;
  // Fires after a successful save or reset so the host page can refresh.
  onSaved: () => void;
  // Fires after a successful tile deletion on a custom page so the host
  // can navigate away (the page key no longer exists).
  onPageDeleted?: () => void;
};


export default function EditPageDrawer({ pageKey, onClose, onSaved, onPageDeleted }: Props) {
  const [registry, setRegistry] = useState<Record<string, BlockRegistryMeta> | null>(null);
  const [blocks, setBlocks] = useState<PageLayoutBlock[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [tile, setTile] = useState<CustomTile | null>(null);

  const isCustom = pageKey.startsWith(CUSTOM_PREFIX);
  const customSlug = isCustom ? pageKey.slice(CUSTOM_PREFIX.length) : "";

  useEffect(() => {
    Promise.all([api.layouts.registry(), api.layouts.get(pageKey)])
      .then(([reg, layout]: [PageRegistry, { blocks: PageLayoutBlock[] }]) => {
        // For custom:<slug> pages the registry entry lives under the
        // shared "custom" key, not the prefixed runtime key.
        const regKey = isCustom ? "custom" : pageKey;
        setRegistry(reg[regKey] || {});
        setBlocks(layout.blocks);
      })
      .catch((e: Error) => alert("Could not load page editor: " + e.message));
  }, [pageKey, isCustom]);

  // Resolve the CustomTile id by slug so the delete button can hit
  // /api/tiles/<id>. Loaded lazily — built-in pages never trigger this.
  useEffect(() => {
    if (!isCustom) return;
    api.tiles.list()
      .then((tiles) => setTile(tiles.find((t) => t.slug === customSlug) ?? null))
      .catch(() => {});
  }, [isCustom, customSlug]);

  const toggle = (i: number) => {
    setBlocks((bs) => bs && bs.map((b, idx) => (idx === i ? { ...b, enabled: !b.enabled } : b)));
    setDirty(true);
  };

  const move = (i: number, dir: -1 | 1) => {
    setBlocks((bs) => {
      if (!bs) return bs;
      const j = i + dir;
      if (j < 0 || j >= bs.length) return bs;
      const copy = bs.slice();
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });
    setDirty(true);
  };

  const save = async () => {
    if (!blocks) return;
    setBusy(true);
    try {
      await api.layouts.update(pageKey, blocks);
      setDirty(false);
      onSaved();
      onClose();
    } catch (e: any) {
      alert("Save failed: " + (e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    if (!confirm(`Reset the ${pageKey} layout to defaults? Any changes you've made to the block list will be lost.`)) return;
    setBusy(true);
    try {
      const fresh = await api.layouts.reset(pageKey);
      setBlocks(fresh.blocks);
      setDirty(false);
      onSaved();
    } catch (e: any) {
      alert("Reset failed: " + (e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  const deletePage = async () => {
    if (!tile) {
      alert("Could not find this tile.");
      return;
    }
    if (!confirm(`Delete the "${tile.label}" tile and its page? This cannot be undone.`)) return;
    setBusy(true);
    try {
      await api.tiles.delete(tile.id);
      onPageDeleted?.();
    } catch (e: any) {
      alert("Delete failed: " + (e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <RightDrawer
      drawerKey={`pagelayout.${pageKey}`}
      defaultWidth={460}
      minWidth={380}
      closeOnBackdropClick={!dirty}
      onClose={onClose}
    >
      <div className="px-5 py-3 border-b border-ui-border flex items-center">
        <div className="text-[14px] font-display font-bold text-sai-navy">Edit page</div>
        <div className="text-[11px] text-slate-500 ml-2 capitalize">· {pageKey.replace(/_/g, " ")}</div>
        <div className="flex-1" />
        <DrawerCloseButton onClose={onClose} />
      </div>

      <div className="flex-1 overflow-y-auto scroll-thin px-5 py-4 space-y-2">
        {!blocks || !registry ? (
          <div className="text-[12px] text-slate-400 italic">Loading…</div>
        ) : (
          blocks.map((b, i) => {
            const meta = registry[b.key];
            return (
              <div
                key={b.key}
                className={`border rounded p-3 ${b.enabled ? "bg-white border-ui-border" : "bg-slate-50 border-slate-200"}`}
              >
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-semibold text-sai-navy">
                        {meta?.label || b.key}
                      </span>
                      {!b.enabled && (
                        <span className="text-[9px] uppercase tracking-wider bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded font-semibold">
                          Hidden
                        </span>
                      )}
                    </div>
                    {meta?.description && (
                      <div className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                        {meta.description}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-1">
                    <button
                      onClick={() => move(i, -1)}
                      disabled={i === 0}
                      className="text-[11px] px-1.5 py-0.5 rounded border border-ui-border text-slate-500 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Move up"
                    >↑</button>
                    <button
                      onClick={() => move(i, 1)}
                      disabled={i === blocks.length - 1}
                      className="text-[11px] px-1.5 py-0.5 rounded border border-ui-border text-slate-500 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Move down"
                    >↓</button>
                  </div>
                  <label className="cursor-pointer flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={b.enabled}
                      onChange={() => toggle(i)}
                      className="cursor-pointer"
                    />
                    <span className="text-[11px] text-slate-600 font-semibold">On</span>
                  </label>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="px-5 py-3 border-t border-ui-border flex items-center gap-2 flex-wrap">
        {isCustom && (
          <button
            onClick={deletePage}
            disabled={busy || !tile}
            className="text-[11px] text-red-600 hover:text-red-700 underline disabled:opacity-40"
            title={tile ? "Delete this tile and its page" : "Loading tile…"}
          >
            Delete this page
          </button>
        )}
        <button
          onClick={reset}
          disabled={busy}
          className="text-[11px] text-slate-500 hover:text-red-600 underline disabled:opacity-40"
        >
          Reset to defaults
        </button>
        <div className="flex-1" />
        <button
          onClick={onClose}
          className="text-[12px] px-3 py-1.5 text-slate-500 hover:text-slate-800"
        >
          Cancel
        </button>
        <button
          onClick={save}
          disabled={!dirty || busy}
          className="text-[12px] bg-sai-blue text-white px-4 py-1.5 rounded font-semibold hover:opacity-90 disabled:opacity-40"
        >
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </RightDrawer>
  );
}

/**
 * Studio mode — generic page renderer.
 *
 * Reads the saved block layout for `pageKey`, walks it, and renders each
 * enabled block by looking up the registry the caller passes in.
 *
 * Studio §7 Q2 (decision 2026-05-24): if every block is disabled, the
 * page shows an empty-state placeholder with a "Reset to defaults" button
 * rather than rendering blank. The reset path hits POST /reset which
 * wipes the saved row, so subsequent GETs return the registry defaults.
 *
 * Phase A.5 — blocks can edit their own config in place. Each block
 * receives `setConfig(next)`; PageRenderer applies it optimistically
 * to local state and debounce-PUTs (300 ms) the full layout back to
 * /api/layouts/<page_key>. On error we roll back to the last good
 * server snapshot and alert the user.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { api, type PageLayout, type PageLayoutBlock } from "../api";
import EditPageDrawer from "./EditPageDrawer";

export type BlockProps<C> = {
  ctx: C;
  config: Record<string, any>;
  setConfig: (next: Record<string, any>) => void;
};

type BlockComponent<C> = (props: BlockProps<C>) => JSX.Element | null;

type Props<C> = {
  pageKey: string;
  registry: Record<string, BlockComponent<C>>;
  ctx: C;
  // Bumping this value forces a layout refetch; callers can use it to
  // force a refresh from outside (e.g. after a related page event).
  refreshNonce?: number;
  // Fires after the editor drawer's "Delete this page" link succeeds —
  // custom pages use this to navigate home since the slug no longer exists.
  onPageDeleted?: () => void;
};

const SAVE_DEBOUNCE_MS = 300;

export default function PageRenderer<C>({ pageKey, registry, ctx, refreshNonce, onPageDeleted }: Props<C>) {
  const [layout, setLayout] = useState<PageLayout | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Bumped on save/reset from the editor drawer, so the useEffect below
  // re-runs and pulls fresh layout state.
  const [internalNonce, setInternalNonce] = useState(0);

  // Snapshot of the last layout the server confirmed — used to roll back
  // if a debounced setConfig save fails (handoff §setConfig debounce).
  const lastGoodRef = useRef<PageLayout | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingBlocksRef = useRef<PageLayoutBlock[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    api.layouts.get(pageKey)
      .then((l) => {
        if (cancelled) return;
        setLayout(l);
        lastGoodRef.current = l;
      })
      .catch((e: Error) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [pageKey, refreshNonce, internalNonce]);

  // Cancel any pending save when the page key changes or we unmount,
  // so a debounced PUT for the old page doesn't land on the new one.
  useEffect(() => () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
  }, [pageKey]);

  const setConfigFor = useCallback((blockKey: string) => (next: Record<string, any>) => {
    setLayout((cur) => {
      if (!cur) return cur;
      const blocks = cur.blocks.map((b) => (b.key === blockKey ? { ...b, config: next } : b));
      pendingBlocksRef.current = blocks;
      // Schedule the debounced save on every keystroke; the final state of
      // pendingBlocksRef wins when the timer fires.
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        saveTimerRef.current = null;
        const toSave = pendingBlocksRef.current;
        if (!toSave) return;
        api.layouts.update(pageKey, toSave)
          .then((saved) => {
            lastGoodRef.current = saved;
            // Avoid clobbering newer in-flight edits: only adopt the server
            // response if no further pending edit has accumulated.
            if (pendingBlocksRef.current === toSave) {
              pendingBlocksRef.current = null;
              setLayout(saved);
            }
          })
          .catch((e: Error) => {
            alert("Could not save changes: " + e.message);
            const rollback = lastGoodRef.current;
            if (rollback) setLayout(rollback);
          });
      }, SAVE_DEBOUNCE_MS);
      return { ...cur, blocks };
    });
  }, [pageKey]);

  const body = (() => {
    if (error) {
      return (
        <div className="px-4 py-6 text-[12px] text-red-600">
          Could not load page layout: {error}
        </div>
      );
    }
    if (!layout) {
      // Render nothing while loading — the page chrome above is already
      // visible, so flashing a spinner inside the body would be more
      // distracting than the brief empty space.
      return null;
    }
    const enabled = layout.blocks.filter((b) => b.enabled);
    if (enabled.length === 0) {
      return <EmptyPagePlaceholder pageKey={pageKey} onReset={() => {
        api.layouts.reset(pageKey).then((fresh) => {
          setLayout(fresh);
          lastGoodRef.current = fresh;
        });
      }} />;
    }
    return (
      <>
        {enabled.map((b: PageLayoutBlock) => {
          const Block = registry[b.key];
          if (!Block) {
            // Block registered server-side but not yet implemented in the
            // frontend bundle — fail soft, render nothing.
            return null;
          }
          return <Block key={b.key} ctx={ctx} config={b.config} setConfig={setConfigFor(b.key)} />;
        })}
      </>
    );
  })();

  return (
    <>
      {body}
      <EditPageButton onOpen={() => setDrawerOpen(true)} />
      {drawerOpen && (
        <EditPageDrawer
          pageKey={pageKey}
          onClose={() => setDrawerOpen(false)}
          onSaved={() => setInternalNonce((n) => n + 1)}
          onPageDeleted={onPageDeleted}
        />
      )}
    </>
  );
}


function EditPageButton({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      title="Edit page layout — toggle blocks, reorder, reset to defaults"
      className="fixed bottom-4 right-4 z-30 w-11 h-11 rounded-full bg-sai-navy text-white text-[18px] shadow-lg hover:bg-sai-blue transition-colors flex items-center justify-center"
      aria-label="Edit page layout"
    >
      ⚙
    </button>
  );
}


function EmptyPagePlaceholder({ pageKey, onReset }: { pageKey: string; onReset: () => void }) {
  return (
    <div className="px-4 py-10">
      <div className="max-w-md mx-auto bg-white border border-ui-border rounded-md p-6 text-center shadow-sm">
        <div className="text-[32px] mb-2">🧱</div>
        <div className="text-[14px] font-display font-bold text-sai-navy mb-1">This page is empty</div>
        <div className="text-[12px] text-slate-500 mb-4">
          Every block on this page is currently disabled. Restore the default layout
          to see content again, or open the ⚙ page editor to enable specific blocks.
        </div>
        <button
          onClick={onReset}
          className="text-[12px] bg-sai-blue text-white px-4 py-1.5 rounded font-semibold hover:opacity-90"
        >
          Reset {pageKey} to defaults
        </button>
      </div>
    </div>
  );
}

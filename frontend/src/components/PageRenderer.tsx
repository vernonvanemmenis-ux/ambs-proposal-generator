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
 */

import { useEffect, useState } from "react";
import { api, type PageLayout, type PageLayoutBlock } from "../api";

type BlockComponent<C> = (props: { ctx: C; config: Record<string, any> }) => JSX.Element | null;

type Props<C> = {
  pageKey: string;
  registry: Record<string, BlockComponent<C>>;
  ctx: C;
  // Bumping this value forces a layout refetch; the EditPageDrawer uses
  // it to refresh the page after saving without prop-drilling state.
  refreshNonce?: number;
};

export default function PageRenderer<C>({ pageKey, registry, ctx, refreshNonce }: Props<C>) {
  const [layout, setLayout] = useState<PageLayout | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    api.layouts.get(pageKey)
      .then((l) => { if (!cancelled) setLayout(l); })
      .catch((e: Error) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [pageKey, refreshNonce]);

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
      api.layouts.reset(pageKey).then(setLayout);
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
        return <Block key={b.key} ctx={ctx} config={b.config} />;
      })}
    </>
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

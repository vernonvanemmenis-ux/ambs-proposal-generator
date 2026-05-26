/**
 * Custom user-defined page — /p/:slug.
 *
 * Resolves the slug to a CustomTile (for the header chrome), then
 * delegates the body to <PageRenderer> keyed "custom:<slug>". The
 * registry is the shared `customRegistry` (heading / notes / links).
 *
 * Deletes navigate back to "/" via PageRenderer's onPageDeleted hook.
 */

import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { api, type CustomTile } from "../api";
import PageRenderer from "../components/PageRenderer";
import { customRegistry, type CustomPageCtx } from "../blocks/custom";


export default function CustomPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [tile, setTile] = useState<CustomTile | null>(null);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    setLoading(true);
    setMissing(false);
    api.tiles.list()
      .then((list) => {
        if (cancelled) return;
        const t = list.find((x) => x.slug === slug);
        if (!t) {
          setMissing(true);
        } else {
          setTile(t);
        }
      })
      .catch(() => { if (!cancelled) setMissing(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [slug]);

  if (!slug) return <Navigate to="/" replace />;
  if (loading) {
    return (
      <div className="min-h-[calc(100vh-44px)] px-4 py-8 text-[12px] text-slate-400 italic">
        Loading…
      </div>
    );
  }
  if (missing || !tile) {
    return (
      <div className="min-h-[calc(100vh-44px)] px-4 py-10">
        <div className="max-w-md mx-auto bg-white border border-ui-border rounded-md p-6 text-center shadow-sm">
          <div className="text-[32px] mb-2">🔍</div>
          <div className="text-[14px] font-display font-bold text-sai-navy mb-1">Page not found</div>
          <div className="text-[12px] text-slate-500 mb-4">
            No custom tile with slug “{slug}”.
          </div>
          <Link
            to="/"
            className="inline-block text-[12px] bg-sai-blue text-white px-4 py-1.5 rounded font-semibold hover:opacity-90"
          >
            Back to home
          </Link>
        </div>
      </div>
    );
  }

  const ctx: CustomPageCtx = { tile };

  return (
    <div className="min-h-[calc(100vh-44px)]">
      <div className="bg-white border-b border-ui-border px-4 py-2 flex items-center gap-3">
        <Link to="/" className="text-[12px] text-slate-500 hover:text-sai-navy">← Apps</Link>
        <div className="text-slate-300">/</div>
        <span className="text-[16px]" style={{ color: tile.color }}>{tile.icon}</span>
        <div className="text-[13px] font-semibold text-sai-navy font-display">{tile.label}</div>
        <div className="flex-1" />
        <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Custom page</div>
      </div>
      <PageRenderer<CustomPageCtx>
        pageKey={`custom:${slug}`}
        registry={customRegistry}
        ctx={ctx}
        onPageDeleted={() => navigate("/", { replace: true })}
      />
    </div>
  );
}

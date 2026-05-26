import { useEffect, useRef, useState } from "react";

type Props = {
  // Stable identifier for persisting the user's preferred width across sessions.
  // Stored as `ambs.drawer.<drawerKey>.width` in localStorage.
  drawerKey: string;
  defaultWidth: number;
  minWidth?: number;
  // Closes when the user clicks the dimmed backdrop. Default true. Pass false
  // for drawers holding unsaved-on-close form state.
  closeOnBackdropClick?: boolean;
  onClose: () => void;
  children: React.ReactNode;
};

const STORAGE_PREFIX = "ambs.drawer.";

function loadWidth(key: string, fallback: number, min: number): number {
  if (typeof window === "undefined") return fallback;
  const stored = Number(window.localStorage.getItem(STORAGE_PREFIX + key + ".width"));
  return Number.isFinite(stored) && stored >= min ? stored : fallback;
}

/**
 * Shared shell for right-side drawer panes. Provides:
 *   - left-edge drag handle to resize the pane
 *   - width persisted per drawerKey so the user's preference sticks
 *   - clamps so the pane never gets unusably narrow or wider than the viewport
 *
 * The caller owns the drawer's own internal layout — header, body, footer —
 * but should NOT set width on its outermost child; this component supplies it.
 */
export default function RightDrawer({
  drawerKey,
  defaultWidth,
  minWidth = 380,
  closeOnBackdropClick = true,
  onClose,
  children,
}: Props) {
  const [width, setWidth] = useState<number>(() => loadWidth(drawerKey, defaultWidth, minWidth));
  const [resizing, setResizing] = useState(false);
  // Mirror of `resizing` for use inside pointer handlers without re-running
  // the persist effect on every move. Also lets us read minWidth fresh.
  const minWidthRef = useRef(minWidth);
  minWidthRef.current = minWidth;

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_PREFIX + drawerKey + ".width", String(Math.round(width)));
    } catch {
      /* quota / privacy mode — silently ignore */
    }
  }, [drawerKey, width]);

  const startResize = (e: React.PointerEvent<HTMLDivElement>) => {
    // Capture the pointer to the handle so subsequent move/up events come
    // straight to us — no window-listener race, no missed first events.
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    setResizing(true);
  };

  const onResizeMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    const maxW = window.innerWidth - 20;
    const next = Math.min(maxW, Math.max(minWidthRef.current, window.innerWidth - e.clientX));
    setWidth(next);
  };

  const endResize = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
    setResizing(false);
  };

  return (
    <div
      className="fixed inset-0 bg-black/30 z-50 flex justify-end"
      onClick={closeOnBackdropClick ? onClose : undefined}
    >
      <div
        className="bg-white h-full shadow-2xl flex flex-col relative"
        style={{ width: `${width}px`, maxWidth: "100vw" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Resize handle: a 12px hit strip on the left edge with a thin
            always-visible vertical bar so users can find it. */}
        <div
          onPointerDown={startResize}
          onPointerMove={onResizeMove}
          onPointerUp={endResize}
          onPointerCancel={endResize}
          onClick={(e) => e.stopPropagation()}
          aria-label="Resize drawer"
          role="separator"
          title="Drag to resize"
          className={`group absolute left-0 top-0 bottom-0 w-3 cursor-col-resize z-20 flex items-center justify-center select-none ${
            resizing ? "bg-sai-blue/20" : "hover:bg-sai-blue/10"
          }`}
        >
          <div
            className={`h-12 w-[3px] rounded-full transition-colors ${
              resizing ? "bg-sai-blue" : "bg-slate-300 group-hover:bg-sai-blue"
            }`}
          />
        </div>
        {children}
      </div>
    </div>
  );
}

/**
 * Drop-in replacement for the small "×" close glyph used by every right-pane
 * drawer. Renders a labelled, bordered button so the user can't dismiss the
 * pane by mistake — matches the Pipeline.tsx New Opportunity drawer.
 */
export function DrawerCloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button
      onClick={onClose}
      className="text-[11px] border border-ui-border text-slate-600 px-3 py-1.5 rounded font-semibold hover:bg-slate-50"
    >
      Close
    </button>
  );
}

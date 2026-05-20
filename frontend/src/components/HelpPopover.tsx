import { useEffect, useRef, useState } from "react";

export type HelpContent = {
  id: string;
  title: string;
  body: string;
  example?: string;
};

export default function HelpPopover({
  help,
  autoShowOnFocus,
}: {
  help: HelpContent;
  autoShowOnFocus?: React.RefObject<HTMLElement>;
}) {
  const storageKey = `help-seen:${help.id}`;
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!autoShowOnFocus?.current) return;
    const el = autoShowOnFocus.current;
    const onFocus = () => {
      try {
        if (!localStorage.getItem(storageKey)) setOpen(true);
      } catch { /* ignore */ }
    };
    el.addEventListener("focus", onFocus);
    return () => el.removeEventListener("focus", onFocus);
  }, [autoShowOnFocus, storageKey]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const dismiss = () => {
    try { localStorage.setItem(storageKey, "1"); } catch { /* ignore */ }
    setOpen(false);
  };

  return (
    <span ref={wrapRef} className="relative inline-flex items-center">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={help.title}
        className="ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full bg-slate-200 text-slate-600 text-[10px] font-bold hover:bg-sai-blue hover:text-white transition"
        aria-label={`Help: ${help.title}`}
      >
        i
      </button>
      {open && (
        <div className="absolute z-50 top-6 left-0 w-[280px] bg-white border border-ui-border rounded-md shadow-lg p-3">
          <div className="flex items-start gap-2">
            <div className="text-[12px] font-bold text-sai-navy flex-1">{help.title}</div>
            <button
              onClick={() => setOpen(false)}
              className="text-slate-400 hover:text-slate-700 text-[14px] leading-none"
              aria-label="Close help"
            >
              ×
            </button>
          </div>
          <div className="text-[11px] text-slate-600 mt-1 leading-snug whitespace-pre-wrap">
            {help.body}
          </div>
          {help.example && (
            <div className="mt-2 text-[10px] text-slate-500 bg-slate-50 border border-ui-border rounded px-2 py-1 italic">
              {help.example}
            </div>
          )}
          <div className="mt-3 flex justify-end">
            <button
              onClick={dismiss}
              className="text-[10px] text-sai-blue hover:underline"
            >
              Got it — don't show again
            </button>
          </div>
        </div>
      )}
    </span>
  );
}

/**
 * Custom-page blocks — heading / notes / links.
 *
 * Each block stores its content in the layout entry's `config` object.
 * Editing is inline: click → edit mode → blur saves. PageRenderer
 * debounces the resulting setConfig calls so a textarea doesn't fire
 * one PUT per keystroke (handoff §setConfig debounce).
 */

import { useEffect, useRef, useState } from "react";
import type { BlockProps } from "../components/PageRenderer";
import type { CustomTile } from "../api";


export type CustomPageCtx = {
  tile: CustomTile;
};

type Props = BlockProps<CustomPageCtx>;


export function HeadingBlock({ ctx, config, setConfig }: Props) {
  const fallback = ctx.tile.label;
  const text: string = typeof config.text === "string" && config.text.trim() ? config.text : fallback;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const commit = () => {
    setEditing(false);
    const next = draft.trim();
    if (next === text) return;
    setConfig({ ...config, text: next });
  };

  return (
    <div className="px-4 pt-6 pb-2 max-w-3xl mx-auto w-full">
      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); commit(); }
            if (e.key === "Escape") { setDraft(text); setEditing(false); }
          }}
          className="w-full text-2xl font-display font-bold text-sai-navy bg-transparent border-b-2 border-sai-blue focus:outline-none"
        />
      ) : (
        <h2
          onClick={() => { setDraft(text); setEditing(true); }}
          className="text-2xl font-display font-bold text-sai-navy cursor-text hover:bg-slate-50 rounded px-1 -mx-1"
          title="Click to edit"
        >
          {text}
        </h2>
      )}
    </div>
  );
}


export function NotesBlock({ config, setConfig }: Props) {
  const body: string = typeof config.body === "string" ? config.body : "";
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(body);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing) textareaRef.current?.focus();
  }, [editing]);

  const commit = () => {
    setEditing(false);
    if (draft === body) return;
    setConfig({ ...config, body: draft });
  };

  return (
    <div className="px-4 py-3 max-w-3xl mx-auto w-full">
      {editing ? (
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          rows={Math.max(4, draft.split("\n").length + 1)}
          className="w-full text-[13px] text-slate-700 leading-relaxed bg-white border border-sai-blue rounded p-3 focus:outline-none resize-y"
          placeholder="Write some notes…"
        />
      ) : (
        <div
          onClick={() => { setDraft(body); setEditing(true); }}
          className="text-[13px] text-slate-700 leading-relaxed cursor-text whitespace-pre-wrap bg-white border border-ui-border rounded p-3 hover:border-sai-blue min-h-[80px]"
          title="Click to edit"
        >
          {body || <span className="text-slate-400 italic">Click to add notes…</span>}
        </div>
      )}
    </div>
  );
}


type LinkRow = { label: string; href: string };


export function LinksBlock({ config, setConfig }: Props) {
  const rawLinks = Array.isArray(config.links) ? config.links : [];
  const links: LinkRow[] = rawLinks
    .map((l: any) => ({
      label: typeof l?.label === "string" ? l.label : "",
      href: typeof l?.href === "string" ? l.href : "",
    }));

  const update = (next: LinkRow[]) => setConfig({ ...config, links: next });

  const updateRow = (i: number, patch: Partial<LinkRow>) => {
    const copy = links.slice();
    copy[i] = { ...copy[i], ...patch };
    update(copy);
  };

  const removeRow = (i: number) => {
    const copy = links.slice();
    copy.splice(i, 1);
    update(copy);
  };

  const addRow = () => update([...links, { label: "", href: "" }]);

  return (
    <div className="px-4 py-3 max-w-3xl mx-auto w-full">
      <div className="bg-white border border-ui-border rounded p-3 space-y-2">
        <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
          Links
        </div>
        {links.length === 0 && (
          <div className="text-[12px] text-slate-400 italic">
            No links yet — add one below.
          </div>
        )}
        {links.map((row, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              value={row.label}
              onChange={(e) => updateRow(i, { label: e.target.value })}
              placeholder="Label"
              className="flex-1 min-w-0 border border-ui-border rounded px-2 py-1 text-[12px] focus:outline-none focus:border-sai-blue"
            />
            <input
              value={row.href}
              onChange={(e) => updateRow(i, { href: e.target.value })}
              placeholder="https://…"
              className="flex-[2] min-w-0 border border-ui-border rounded px-2 py-1 text-[12px] focus:outline-none focus:border-sai-blue"
            />
            {row.href && (
              <a
                href={row.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] text-sai-blue hover:underline whitespace-nowrap"
                title="Open in new tab"
              >
                Open ↗
              </a>
            )}
            <button
              type="button"
              onClick={() => removeRow(i)}
              className="text-slate-400 hover:text-red-600 text-[14px] leading-none px-1"
              title="Remove this row"
              aria-label="Remove link"
            >×</button>
          </div>
        ))}
        <button
          type="button"
          onClick={addRow}
          className="text-[11px] text-sai-blue hover:underline font-semibold"
        >
          + Add link
        </button>
      </div>
    </div>
  );
}


export const customRegistry = {
  heading: HeadingBlock,
  notes: NotesBlock,
  links: LinksBlock,
} as const;

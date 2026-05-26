import { useMemo, useState } from "react";
import type { Item } from "../api";

/**
 * Local image-prompt builder.
 *
 * For catalogue items that don't yet have a photo, generates a paste-ready
 * prompt the user takes to DALL·E / Midjourney / Stable Diffusion themselves.
 * No API call, no key, no online dependency — once they have an image they
 * upload it through the same `POST /api/items/{id}/image` endpoint as any
 * other photo. Mirrors the offline pattern used by PromptBuilder.tsx.
 */

const STYLES: { id: string; label: string; suffix: string }[] = [
  {
    id: "photoreal",
    label: "Photorealistic",
    suffix:
      "Photorealistic product photography, soft daylight, neutral background, three-quarter front view, sharp focus, no people, no text overlay, 16:9 aspect.",
  },
  {
    id: "architectural",
    label: "Architectural rendering",
    suffix:
      "Architectural 3D rendering, cinematic lighting, realistic materials, blue South African sky, light dust on the ground, no people, 16:9 aspect, marketing brochure quality.",
  },
  {
    id: "marketing",
    label: "Marketing brochure",
    suffix:
      "High-end marketing brochure image, vibrant but realistic colours, shallow depth of field, hero hero-shot composition, no logos, no text, 16:9 aspect.",
  },
  {
    id: "linework",
    label: "Technical line drawing",
    suffix:
      "Clean technical line drawing in black on white, isometric three-quarter view, accurate proportions, no shading, no people, no text, 16:9 aspect.",
  },
];

export default function ImagePromptBuilder({
  item,
  onClose,
}: {
  item: Item;
  onClose: () => void;
}) {
  const [styleId, setStyleId] = useState(STYLES[0].id);
  const [extraNotes, setExtraNotes] = useState("");
  const [copied, setCopied] = useState(false);

  const style = useMemo(() => STYLES.find((s) => s.id === styleId) ?? STYLES[0], [styleId]);

  const prompt = useMemo(() => {
    const tags = (item.tags || "").split(",").map((t) => t.trim()).filter(Boolean);
    const facts: string[] = [];
    facts.push(`Subject: ${item.name}`);
    if (item.category) facts.push(`Category: ${item.category}`);
    if (item.product_line) facts.push(`Product line: ${item.product_line}`);
    if (item.structure_type) facts.push(`Structure type: ${item.structure_type}`);
    if (item.description) facts.push(`Description: ${item.description}`);
    if (tags.length) facts.push(`Keywords: ${tags.join(", ")}`);
    if (extraNotes.trim()) facts.push(`Extra notes: ${extraNotes.trim()}`);

    return `Generate a single product image for an AMBS (African Modular Building Solutions) catalogue.

CONTEXT
${facts.map((f) => `- ${f}`).join("\n")}

STYLE
${style.suffix}

INSTRUCTIONS
Render one image only. Do not include any AMBS logo or text on the image. The output should look like something a sales team would proudly include in a client proposal.`;
  }, [item, style, extraNotes]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      alert("Could not access the clipboard — select the text and copy manually.");
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-md shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto scroll-thin"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-ui-border flex items-center gap-3">
          <span className="text-xl">🎨</span>
          <div className="flex-1">
            <div className="text-[14px] font-semibold text-sai-navy">AI Image Prompt Builder</div>
            <div className="text-[11px] text-slate-500">
              For <span className="font-medium">{item.name}</span> — paste this into DALL·E, Midjourney, or Stable Diffusion, then upload the result.
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-700 text-xl leading-none px-2"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div>
            <div className="field-label">Style</div>
            <select
              className="field-value"
              value={styleId}
              onChange={(e) => setStyleId(e.target.value)}
            >
              {STYLES.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
          </div>

          <div>
            <div className="field-label">Extra notes (optional)</div>
            <textarea
              className="field-value min-h-[60px] resize-y"
              placeholder="e.g. Should show a mining-site context with red dust; include a person for scale."
              value={extraNotes}
              onChange={(e) => setExtraNotes(e.target.value)}
            />
          </div>

          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <div className="field-label flex-1">Generated prompt</div>
              <button
                onClick={copy}
                className="text-[11px] bg-sai-blue text-white px-3 py-1 rounded font-semibold hover:opacity-90"
              >
                {copied ? "✓ Copied" : "Copy prompt"}
              </button>
            </div>
            <pre className="text-[11px] bg-slate-50 border border-ui-border rounded p-3 whitespace-pre-wrap font-mono text-slate-700 max-h-[260px] overflow-y-auto scroll-thin">
              {prompt}
            </pre>
          </div>

          <div className="bg-sai-bluepale/40 border border-sai-blue/30 rounded p-3 text-[11px] text-slate-700">
            <div className="font-semibold text-sai-blue mb-1">Workflow</div>
            <ol className="list-decimal list-inside space-y-0.5">
              <li>Pick a style and add any extra context above.</li>
              <li>Click <strong>Copy prompt</strong> and paste it into DALL·E, Midjourney, or Stable Diffusion.</li>
              <li>Download the result, close this dialog, and upload it via the image upload zone.</li>
            </ol>
          </div>
        </div>

        <div className="px-5 py-3 border-t border-ui-border flex justify-end">
          <button
            onClick={onClose}
            className="text-[12px] px-4 py-1.5 rounded border border-ui-border hover:bg-slate-50"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

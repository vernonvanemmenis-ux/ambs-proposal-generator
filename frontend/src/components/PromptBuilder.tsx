import { useEffect, useMemo, useState } from "react";
import {
  api,
  type AIDraftStatus,
  type Opportunity,
  type OpportunityLineDraft,
  type Template,
} from "../api";

/**
 * Section-specific prompt builders.
 *
 * Six collapsible cards — five fixed sections (Executive Summary, Scope,
 * Technical Approach, Pricing, Risks) plus one Custom card with a fully
 * editable system prompt for sections the fixed five don't cover.
 *
 * Each card:
 *   1. Generates a prompt with this opportunity's context pre-filled.
 *   2. Lets the user copy it to ChatGPT (or run the optional inline AI draft).
 *   3. Accepts the LLM response in a paste-back textarea.
 *   4. "Push to template" writes the textarea into
 *      `opp.section_drafts_json[paste_key]` so the .docx renderer picks
 *      it up. The fixed cards use convention paste keys; the Custom card
 *      lets the user pick the destination.
 *
 * Convention paste keys (locked from §AskUserQuestion 2026-05-25):
 *   executive_summary, scope_of_work, technical_approach,
 *   pricing_rationale, risks_mitigations
 *
 * If the active template has a section with the matching paste_key the
 * draft renders in that section. Otherwise the push still persists (so
 * the data isn't lost) but the card shows a warning telling the user
 * to add a section to their template.
 */

type LineLike = OpportunityLineDraft & { id?: number };

type PromptContext = {
  clientName: string;
  industry: string;
  siteLocation: string;
  title: string;
  deliveryWeeks: number;
  depositPct: number;
  subtotal: number;
  totalIncVat: number;
  lineCount: number;
  bundles: string;
  topLines: string;
  voice: string;
  audience: string;
  extraNotes: string;
};

type SectionDef = {
  id: string;
  label: string;
  icon: string;
  hint: string;
  pasteKey: string; // "" for Custom — user picks at push time
  template: (ctx: PromptContext) => string;
};

const VOICES = [
  "Professional & confident",
  "Plain & practical",
  "Technical & detailed",
  "Warm & relationship-led",
];

const AUDIENCES = [
  "Client decision-maker (CEO/MD)",
  "Procurement / Buyer",
  "Technical evaluator (engineer)",
  "Mixed committee",
];


const FIXED_SECTIONS: SectionDef[] = [
  {
    id: "executive-summary",
    label: "Executive Summary",
    icon: "📋",
    pasteKey: "executive_summary",
    hint: "A 2–3 paragraph opener that frames the deal and the value AMBS brings.",
    template: (c) => `You are writing the **Executive Summary** for an AMBS (African Modular Building Solutions) proposal.

CONTEXT
- Client: ${c.clientName} (${c.industry || "industry n/a"})
- Site: ${c.siteLocation || "location n/a"}
- Project: ${c.title}
- Delivery window: ${c.deliveryWeeks} weeks
- Deposit on signature: ${c.depositPct}%
- Quote value (incl. VAT): R ${c.totalIncVat.toLocaleString("en-ZA")}
- ${c.lineCount} line item${c.lineCount === 1 ? "" : "s"}${c.bundles ? `, bundles: ${c.bundles}` : ""}
- Audience: ${c.audience}
- Voice: ${c.voice}
${c.extraNotes ? `- Extra notes: ${c.extraNotes}` : ""}

WRITE
A 2–3 paragraph executive summary that (a) restates the client's need in our own words, (b) names the AMBS solution being proposed, (c) calls out the headline timeline and commercial terms, and (d) closes with a confident hand-off to the detail in the rest of the proposal. South African English. Use "R" for Rand values. No bullet points.`,
  },
  {
    id: "scope-of-work",
    label: "Scope of Work",
    icon: "🗂️",
    pasteKey: "scope_of_work",
    hint: "What we will deliver, broken into clear deliverables.",
    template: (c) => `You are writing the **Scope of Work** for an AMBS proposal.

CONTEXT
- Client: ${c.clientName}
- Project: ${c.title}
- Top line items:
${c.topLines || "(none)"}
- Delivery: ${c.deliveryWeeks} weeks
- Audience: ${c.audience}
- Voice: ${c.voice}

WRITE
A scope-of-work section structured as:
1. **Inclusions** — bulleted list grouping the line items into 3–6 logical deliverables (foundations, modular units, services connections, handover, etc.) in plain language a buyer will understand.
2. **Exclusions** — bulleted list of common items NOT included (site preparation by client, off-site civil works, municipal fees, etc.) so there are no surprises.
3. **Assumptions** — 3–5 bullets stating what we are assuming (site access, power availability, ground conditions, working hours, etc.).

South African English. Be specific but avoid jargon. No prices in this section.`,
  },
  {
    id: "technical-approach",
    label: "Technical Approach",
    icon: "🛠️",
    pasteKey: "technical_approach",
    hint: "How we will execute — manufacturing, transport, installation, handover.",
    template: (c) => `You are writing the **Technical Approach** for an AMBS proposal.

CONTEXT
- Client: ${c.clientName} (${c.industry || "industry n/a"})
- Site: ${c.siteLocation || "location n/a"}
- Project: ${c.title}
- ${c.lineCount} line item${c.lineCount === 1 ? "" : "s"}${c.bundles ? ` across bundles: ${c.bundles}` : ""}
- Delivery: ${c.deliveryWeeks} weeks
- Audience: ${c.audience}
- Voice: ${c.voice}

WRITE
A technical approach broken into 4 phases:
1. **Design & approvals** — what AMBS does upfront (drawings, sign-off, compliance).
2. **Off-site manufacture** — factory build, QA, materials.
3. **Transport & installation** — logistics to site, crane/lift plan, installation team.
4. **Commissioning & handover** — services connection, testing, documentation, client sign-off.

For each phase give a 2–4 sentence narrative plus an indicative duration. South African English.`,
  },
  {
    id: "pricing-rationale",
    label: "Pricing Rationale",
    icon: "💰",
    pasteKey: "pricing_rationale",
    hint: "A short, confident commercial narrative — why the price is what it is.",
    template: (c) => `You are writing the **Pricing Rationale** narrative for an AMBS proposal.

CONTEXT
- Project: ${c.title}
- Subtotal: R ${c.subtotal.toLocaleString("en-ZA")}
- Total (incl. 15% VAT): R ${c.totalIncVat.toLocaleString("en-ZA")}
- Deposit on signature: ${c.depositPct}%
- Delivery: ${c.deliveryWeeks} weeks
- Audience: ${c.audience}
- Voice: ${c.voice}

WRITE
A 2-paragraph commercial narrative that (1) explains what's driving the price in plain language (scope, quality of materials, compressed timeline, off-site manufacture savings), and (2) reinforces value — speed-to-occupancy, predictable cost, factory QA. Do NOT itemise prices — that's done elsewhere in the proposal. End with the payment terms (${c.depositPct}% deposit, balance on delivery + handover). South African English.`,
  },
  {
    id: "risks-mitigations",
    label: "Risks & Mitigations",
    icon: "⚠️",
    pasteKey: "risks_mitigations",
    hint: "Proactive table of risks the client cares about and how AMBS handles them.",
    template: (c) => `You are writing the **Risks & Mitigations** section of an AMBS proposal.

CONTEXT
- Client: ${c.clientName} (${c.industry || "industry n/a"})
- Site: ${c.siteLocation || "location n/a"}
- Project: ${c.title}
- Delivery: ${c.deliveryWeeks} weeks
- Audience: ${c.audience}
- Voice: ${c.voice}
${c.extraNotes ? `- Extra notes: ${c.extraNotes}` : ""}

WRITE
A markdown table with columns: Risk | Likelihood | Impact | AMBS Mitigation.
Include 5–7 risks the client actually cares about for this kind of project (weather delays, transport access, site readiness, services availability, regulatory approval, labour, etc.). Keep mitigations specific and credible — show this isn't a copy-paste section.`,
  },
];


const CUSTOM_SECTION_DEFAULT_PROMPT = (c: PromptContext) =>
  `You are writing a section of an AMBS (African Modular Building Solutions) proposal.

CONTEXT
- Client: ${c.clientName} (${c.industry || "industry n/a"})
- Site: ${c.siteLocation || "location n/a"}
- Project: ${c.title}
- Delivery: ${c.deliveryWeeks} weeks
- Audience: ${c.audience}
- Voice: ${c.voice}
${c.extraNotes ? `- Extra notes: ${c.extraNotes}` : ""}

WRITE
[Replace this with what you want the LLM to do. The CONTEXT block above
will be re-rendered each time the opportunity changes, so the prompt stays
fresh — only edit the WRITE block here.]`;


export default function PromptBuilder({
  opp,
  lines,
  subtotal,
  template,
  onSaved,
}: {
  opp: Opportunity;
  lines: LineLike[];
  subtotal: number;
  template?: Template | null;
  onSaved?: () => void;
}) {
  const [aiStatus, setAiStatus] = useState<AIDraftStatus | null>(null);

  useEffect(() => {
    api.ai.draftStatus().then(setAiStatus).catch(() => setAiStatus(null));
  }, []);

  const ctx: PromptContext = useMemo(() => {
    const bundles = Array.from(new Set(lines.map((l) => l.bundle_label).filter(Boolean))).join(", ");
    const top = lines
      .slice(0, 8)
      .map(
        (l, i) =>
          `${i + 1}. ${l.description || l.item_code || "(item)"} — ${l.quantity} ${l.unit_of_measure} @ R ${Number(
            l.unit_rate,
          ).toLocaleString("en-ZA")}`,
      )
      .join("\n");
    return {
      clientName: opp.client?.name ?? "(client)",
      industry: opp.client?.industry ?? "",
      siteLocation: opp.client?.site_location ?? "",
      title: opp.title,
      deliveryWeeks: opp.delivery_weeks,
      depositPct: opp.deposit_pct ?? 40,
      subtotal,
      totalIncVat: subtotal * 1.15,
      lineCount: lines.length,
      bundles,
      topLines: top,
      voice: "Professional & confident",
      audience: "Client decision-maker (CEO/MD)",
      extraNotes: "",
    };
  }, [opp, lines, subtotal]);

  const existingDrafts: Record<string, string> = useMemo(() => {
    try {
      const parsed = JSON.parse(opp.section_drafts_json || "{}");
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }, [opp.section_drafts_json]);

  // Build the set of paste_keys that the active template recognises.
  // Used to flag pushes that won't surface in the rendered .docx until
  // the user adds a matching section to their template.
  const templatePasteKeys: Set<string> = useMemo(() => {
    if (!template) return new Set();
    const s = new Set<string>();
    for (const sec of template.sections) {
      const key = typeof sec.config?.paste_key === "string" ? sec.config.paste_key.trim() : "";
      if (key) s.add(key);
    }
    return s;
  }, [template]);

  return (
    <div className="space-y-2">
      <div className="bg-white border border-ui-border rounded-md px-4 py-3 flex items-center gap-3">
        <span className="text-xl">🤖</span>
        <div className="flex-1">
          <div className="text-[13px] font-semibold text-sai-navy">Section prompt builders</div>
          <div className="text-[11px] text-slate-500">
            Six section-specific prompts pre-filled with this opportunity's context. Copy to ChatGPT
            (or use inline AI), paste back, push to the proposal template.
          </div>
        </div>
        {aiStatus && (
          <div
            className={`text-[10px] uppercase tracking-wider font-semibold px-2 py-1 rounded ${
              aiStatus.configured
                ? "bg-emerald-100 text-emerald-700"
                : "bg-slate-100 text-slate-500"
            }`}
            title={
              aiStatus.configured
                ? `Inline draft enabled via ${aiStatus.provider}/${aiStatus.model}`
                : "No OPENAI_API_KEY configured — copy/paste workflow only"
            }
          >
            {aiStatus.configured ? `AI ready (${aiStatus.model})` : "AI off"}
          </div>
        )}
      </div>

      {FIXED_SECTIONS.map((section) => (
        <BuilderCard
          key={section.id}
          section={section}
          ctx={ctx}
          opp={opp}
          existingDraft={existingDrafts[section.pasteKey] ?? ""}
          templateHasKey={templatePasteKeys.has(section.pasteKey)}
          aiStatus={aiStatus}
          onSaved={onSaved}
          editablePrompt={false}
          editablePasteKey={false}
        />
      ))}

      <BuilderCard
        section={{
          id: "custom",
          label: "Custom (free-form)",
          icon: "✏️",
          pasteKey: "",
          hint: "For ad-hoc sections not covered above. Pick a destination paste_key and edit the prompt.",
          template: CUSTOM_SECTION_DEFAULT_PROMPT,
        }}
        ctx={ctx}
        opp={opp}
        existingDraft=""
        templateHasKey={false}
        aiStatus={aiStatus}
        onSaved={onSaved}
        editablePrompt={true}
        editablePasteKey={true}
        templatePasteKeys={templatePasteKeys}
      />
    </div>
  );
}


type BuilderCardProps = {
  section: SectionDef;
  ctx: PromptContext;
  opp: Opportunity;
  existingDraft: string;
  templateHasKey: boolean;
  aiStatus: AIDraftStatus | null;
  onSaved?: () => void;
  editablePrompt: boolean;
  editablePasteKey: boolean;
  templatePasteKeys?: Set<string>;
};

function BuilderCard({
  section,
  ctx,
  opp,
  existingDraft,
  templateHasKey,
  aiStatus,
  onSaved,
  editablePrompt,
  editablePasteKey,
  templatePasteKeys,
}: BuilderCardProps) {
  const [open, setOpen] = useState(false);
  const [voice, setVoice] = useState(VOICES[0]);
  const [audience, setAudience] = useState(AUDIENCES[0]);
  const [extraNotes, setExtraNotes] = useState("");
  const [response, setResponse] = useState(existingDraft);
  const [pasteKey, setPasteKey] = useState(section.pasteKey);
  const [customPrompt, setCustomPrompt] = useState<string | null>(null); // null → use template
  const [copied, setCopied] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [pushed, setPushed] = useState(false);

  // Keep the textarea in sync if the underlying draft is reloaded externally.
  useEffect(() => {
    setResponse(existingDraft);
  }, [existingDraft]);

  const liveCtx: PromptContext = useMemo(
    () => ({ ...ctx, voice, audience, extraNotes }),
    [ctx, voice, audience, extraNotes],
  );

  const prompt = useMemo(() => {
    if (editablePrompt && customPrompt !== null) return customPrompt;
    return section.template(liveCtx);
  }, [section, liveCtx, customPrompt, editablePrompt]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      alert("Could not access the clipboard — select the text and copy manually.");
    }
  };

  const draftWithAi = async () => {
    if (!aiStatus?.configured) return;
    setDrafting(true);
    try {
      const out = await api.ai.draft(prompt, pasteKey);
      setResponse((out.text || "").trim());
    } catch (e: any) {
      alert("AI draft failed: " + (e?.message || e));
    } finally {
      setDrafting(false);
    }
  };

  const push = async () => {
    const key = pasteKey.trim();
    const text = response.trim();
    if (!key) {
      alert("Set a destination paste_key before pushing.");
      return;
    }
    if (!text) return;
    setPushing(true);
    try {
      // Merge into existing drafts so we never blow away other sections.
      const drafts: Record<string, string> = (() => {
        try {
          const parsed = JSON.parse(opp.section_drafts_json || "{}");
          return parsed && typeof parsed === "object" ? parsed : {};
        } catch {
          return {};
        }
      })();
      drafts[key] = text;
      await api.opportunities.update(opp.id, { section_drafts_json: JSON.stringify(drafts) });
      setPushed(true);
      setTimeout(() => setPushed(false), 2000);
      onSaved?.();
    } catch (e: any) {
      alert("Push failed: " + (e?.message || e));
    } finally {
      setPushing(false);
    }
  };

  const targetKeyKnown = pasteKey.trim() && (templateHasKey || (templatePasteKeys?.has(pasteKey.trim()) ?? false));
  const hasResponse = response.trim().length > 0;

  return (
    <div className="bg-white border border-ui-border rounded-md">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-slate-50 transition text-left"
      >
        <span className="text-lg w-6 text-center">{section.icon}</span>
        <div className="flex-1">
          <div className="text-[13px] font-semibold text-sai-navy flex items-center gap-2">
            {section.label}
            {existingDraft && (
              <span
                className="text-[9px] uppercase tracking-wider bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-semibold"
                title="A draft is already saved for this section"
              >
                Draft saved
              </span>
            )}
            {section.pasteKey && !editablePasteKey && (
              <span className="text-[10px] font-mono font-normal text-slate-400">
                → {section.pasteKey}
              </span>
            )}
          </div>
          <div className="text-[11px] text-slate-500">{section.hint}</div>
        </div>
        <span className="text-[11px] text-sai-blue">{open ? "Hide" : "Open"}</span>
      </button>

      {open && (
        <div className="px-4 pb-4 border-t border-ui-border space-y-3 pt-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <div className="field-label">Voice</div>
              <select className="field-value" value={voice} onChange={(e) => setVoice(e.target.value)}>
                {VOICES.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <div className="field-label">Audience</div>
              <select className="field-value" value={audience} onChange={(e) => setAudience(e.target.value)}>
                {AUDIENCES.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <div className="field-label">Extra notes (optional)</div>
            <textarea
              className="field-value min-h-[40px] resize-y"
              placeholder="e.g. Client cares deeply about local labour content."
              value={extraNotes}
              onChange={(e) => setExtraNotes(e.target.value)}
            />
          </div>

          {editablePasteKey && (
            <div>
              <div className="field-label">Destination paste_key</div>
              <input
                className="field-value font-mono"
                value={pasteKey}
                onChange={(e) => setPasteKey(e.target.value)}
                placeholder="e.g. addendum_a"
              />
              <div className="text-[10px] text-slate-400 mt-1">
                The draft will be saved to <code className="font-mono">opp.section_drafts_json["{pasteKey || "…"}"]</code>.{" "}
                {templatePasteKeys && pasteKey.trim() && (
                  templatePasteKeys.has(pasteKey.trim())
                    ? <span className="text-emerald-600">✓ Matches a section in the active template.</span>
                    : <span className="text-amber-600">⚠ No template section uses this key yet.</span>
                )}
              </div>
            </div>
          )}

          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <div className="field-label flex-1">Generated prompt</div>
              {editablePrompt && (
                <button
                  type="button"
                  onClick={() => setCustomPrompt(customPrompt === null ? prompt : null)}
                  className="text-[10px] text-slate-500 hover:text-sai-blue underline"
                  title={customPrompt === null ? "Edit the WRITE block" : "Reset to the default template"}
                >
                  {customPrompt === null ? "Customise" : "Reset"}
                </button>
              )}
              {aiStatus?.configured && (
                <button
                  type="button"
                  onClick={draftWithAi}
                  disabled={drafting}
                  className="text-[11px] border border-sai-blue text-sai-blue px-3 py-1 rounded font-semibold hover:bg-sai-bluepale disabled:opacity-40"
                >
                  {drafting ? "Drafting…" : "✨ Draft with AI"}
                </button>
              )}
              <button
                type="button"
                onClick={copy}
                className="text-[11px] bg-sai-blue text-white px-3 py-1 rounded font-semibold hover:opacity-90"
              >
                {copied ? "✓ Copied" : "Copy prompt"}
              </button>
            </div>
            {editablePrompt && customPrompt !== null ? (
              <textarea
                className="field-value font-mono text-[11px] min-h-[220px] max-h-[400px] resize-y bg-slate-50"
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
              />
            ) : (
              <pre className="text-[11px] bg-slate-50 border border-ui-border rounded p-3 whitespace-pre-wrap font-mono text-slate-700 max-h-[260px] overflow-y-auto scroll-thin">
                {prompt}
              </pre>
            )}
          </div>

          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <div className="field-label flex-1">LLM response (paste here)</div>
              <button
                type="button"
                onClick={push}
                disabled={pushing || !hasResponse || !pasteKey.trim()}
                className={`text-[11px] px-3 py-1 rounded font-semibold disabled:opacity-40 ${
                  pushed
                    ? "bg-emerald-600 text-white"
                    : "bg-sai-navy text-white hover:opacity-90"
                }`}
                title={
                  !pasteKey.trim()
                    ? "Set a destination paste_key first"
                    : !hasResponse
                    ? "Paste an LLM response first"
                    : `Save to opp.section_drafts_json["${pasteKey.trim()}"]`
                }
              >
                {pushed ? "✓ Pushed" : pushing ? "Pushing…" : "↓ Push to template"}
              </button>
            </div>
            <textarea
              className="field-value min-h-[140px] resize-y"
              placeholder="Paste the LLM output here, then click Push to template."
              value={response}
              onChange={(e) => setResponse(e.target.value)}
            />
            {hasResponse && pasteKey.trim() && (
              <div className="text-[10px] text-slate-500 mt-1">
                {targetKeyKnown ? (
                  <span className="text-emerald-600">
                    ✓ The active template has a section using <code className="font-mono">{pasteKey.trim()}</code> — pushed drafts render in the .docx.
                  </span>
                ) : (
                  <span className="text-amber-600">
                    ⚠ No section in the active template uses <code className="font-mono">{pasteKey.trim()}</code> yet. Push still saves the draft, but it won't appear in the .docx until you add a matching section in the template editor.
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

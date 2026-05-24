import { useEffect, useMemo, useState } from "react";
import { api, type AIDraftStatus, type Opportunity, type OpportunityLineDraft } from "../api";

/**
 * Local prompt-builder block.
 *
 * Helps the user craft a structured ChatGPT prompt with opportunity context
 * already pre-filled. The user copies the prompt and pastes it into ChatGPT
 * themselves — no API key, no network call, no online dependency. The
 * response is pasted back into the chosen proposal section by the user.
 */

type LineLike = OpportunityLineDraft & { id?: number };

type Section = {
  id: string;
  label: string;
  hint: string;
  template: (ctx: PromptContext) => string;
};

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

const VOICES = ["Professional & confident", "Plain & practical", "Technical & detailed", "Warm & relationship-led"];
const AUDIENCES = ["Client decision-maker (CEO/MD)", "Procurement / Buyer", "Technical evaluator (engineer)", "Mixed committee"];

const SECTIONS: Section[] = [
  {
    id: "executive-summary",
    label: "Executive Summary",
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

export default function PromptBuilder({
  opp,
  lines,
  subtotal,
}: {
  opp: Opportunity;
  lines: LineLike[];
  subtotal: number;
}) {
  const [open, setOpen] = useState(false);
  const [sectionId, setSectionId] = useState<string>(SECTIONS[0].id);
  const [voice, setVoice] = useState<string>(VOICES[0]);
  const [audience, setAudience] = useState<string>(AUDIENCES[0]);
  const [extraNotes, setExtraNotes] = useState("");
  const [copied, setCopied] = useState(false);
  const [response, setResponse] = useState("");
  const [aiStatus, setAiStatus] = useState<AIDraftStatus | null>(null);
  const [drafting, setDrafting] = useState(false);

  useEffect(() => {
    api.ai.draftStatus().then(setAiStatus).catch(() => setAiStatus(null));
  }, []);

  const section = useMemo(() => SECTIONS.find((s) => s.id === sectionId) ?? SECTIONS[0], [sectionId]);

  const ctx: PromptContext = useMemo(() => {
    const bundles = Array.from(new Set(lines.map((l) => l.bundle_label).filter(Boolean))).join(", ");
    const top = lines
      .slice(0, 8)
      .map((l, i) => `${i + 1}. ${l.description || l.item_code || "(item)"} — ${l.quantity} ${l.unit_of_measure} @ R ${Number(l.unit_rate).toLocaleString("en-ZA")}`)
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
      voice,
      audience,
      extraNotes,
    };
  }, [opp, lines, subtotal, voice, audience, extraNotes]);

  const prompt = section.template(ctx);

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
      const out = await api.ai.draft(prompt);
      setResponse((out.text || "").trim());
    } catch (e: any) {
      alert("AI draft failed: " + (e?.message || e));
    } finally {
      setDrafting(false);
    }
  };

  return (
    <div className="bg-white border border-ui-border rounded-md">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full px-4 py-3 flex items-center gap-3 hover:bg-slate-50 transition text-left"
      >
        <span className="text-xl">🤖</span>
        <div className="flex-1">
          <div className="text-[13px] font-semibold text-sai-navy">ChatGPT Prompt Builder</div>
          <div className="text-[11px] text-slate-500">
            Generate a section-specific prompt with this opportunity's context — paste it into ChatGPT.
          </div>
        </div>
        <span className="text-[11px] text-sai-blue">{open ? "Hide" : "Open"}</span>
      </button>

      {open && (
        <div className="px-4 pb-4 border-t border-ui-border space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-3">
            <div>
              <div className="field-label">Section</div>
              <select className="field-value" value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
                {SECTIONS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <div className="field-label">Voice</div>
              <select className="field-value" value={voice} onChange={(e) => setVoice(e.target.value)}>
                {VOICES.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div>
              <div className="field-label">Audience</div>
              <select className="field-value" value={audience} onChange={(e) => setAudience(e.target.value)}>
                {AUDIENCES.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
          </div>

          <div className="text-[11px] text-slate-500 italic">{section.hint}</div>

          <div>
            <div className="field-label">Extra notes (optional)</div>
            <textarea
              className="field-value min-h-[50px] resize-y"
              placeholder="e.g. Client cares deeply about local labour content. Push that into the narrative."
              value={extraNotes}
              onChange={(e) => setExtraNotes(e.target.value)}
            />
          </div>

          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <div className="field-label flex-1">Generated prompt</div>
              {aiStatus?.configured && (
                <button
                  onClick={draftWithAi}
                  disabled={drafting}
                  className="text-[11px] border border-sai-blue text-sai-blue px-3 py-1 rounded font-semibold hover:bg-sai-bluepale disabled:opacity-40"
                  title={`Sends the prompt directly to ${aiStatus.provider}/${aiStatus.model} and lands the result below.`}
                >
                  {drafting ? "Drafting…" : "✨ Draft with AI"}
                </button>
              )}
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
              <li>Pick the section, voice, and audience above.</li>
              <li>Click <strong>Copy prompt</strong> and paste it into ChatGPT (or any LLM).</li>
              <li>Paste the response into the box below — keep it here as a draft, or copy it into your Doc Template for this section.</li>
            </ol>
          </div>

          <div>
            <div className="field-label">Paste ChatGPT's response (draft holding pen)</div>
            <textarea
              className="field-value min-h-[120px] resize-y"
              placeholder="Paste the LLM output here while you decide where to use it. Not saved to the server."
              value={response}
              onChange={(e) => setResponse(e.target.value)}
            />
            {response && (
              <div className="text-[10px] text-slate-400 mt-1 italic">
                Draft is local to this view — copy it into your Doc Template or Internal Notes to keep it.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

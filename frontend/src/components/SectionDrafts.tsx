import { useEffect, useMemo, useState } from "react";
import { api, type AIDraftStatus, type Opportunity, type Template, type TemplateSection } from "../api";

type Props = {
  opp: Opportunity;
  template: Template | null;
  onSaved: () => void;
};

// Renders one paste-back textarea per section in the template that has
// `paste_key` set. Saves on blur. Optionally offers a "Draft with AI" button
// when the backend reports OPENAI_API_KEY is configured.
export default function SectionDrafts({ opp, template, onSaved }: Props) {
  const drafts = useMemo<Record<string, string>>(() => {
    try {
      const raw = JSON.parse(opp.section_drafts_json || "{}");
      return raw && typeof raw === "object" ? raw : {};
    } catch {
      return {};
    }
  }, [opp.section_drafts_json]);

  const pasteSections = useMemo(() => {
    if (!template) return [] as Array<{ section: TemplateSection; key: string }>;
    return template.sections
      .filter((s) => s.enabled !== false && typeof s.config?.paste_key === "string" && s.config.paste_key.trim() !== "")
      .map((s) => ({ section: s, key: String(s.config.paste_key).trim() }));
  }, [template]);

  const [local, setLocal] = useState<Record<string, string>>(drafts);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [aiStatus, setAiStatus] = useState<AIDraftStatus | null>(null);

  useEffect(() => setLocal(drafts), [drafts]);
  useEffect(() => {
    api.ai.draftStatus().then(setAiStatus).catch(() => setAiStatus(null));
  }, []);

  if (!template) {
    return (
      <div className="bg-white border border-ui-border rounded-md p-4 text-[12px] text-slate-500">
        Select a template above to enable per-section AI drafts.
      </div>
    );
  }

  if (pasteSections.length === 0) {
    return (
      <div className="bg-white border border-ui-border rounded-md p-4 text-[12px] text-slate-500">
        No sections in “{template.name}” have a <code className="bg-slate-100 px-1 rounded">paste_key</code> configured.
        Open the template editor and add one to any text-bearing section to enable per-opportunity overrides.
      </div>
    );
  }

  const commit = async (key: string, value: string) => {
    const next = { ...local, [key]: value };
    setLocal(next);
    setBusyKey(key);
    try {
      await api.opportunities.update(opp.id, { section_drafts_json: JSON.stringify(next) });
      onSaved();
    } catch (e: any) {
      alert("Could not save draft: " + (e?.message || e));
    } finally {
      setBusyKey(null);
    }
  };

  const draftWithAi = async (key: string, section: TemplateSection) => {
    if (!aiStatus?.configured) return;
    const heading = section.config?.heading || section.kind;
    const prompt =
      `You are drafting a section of a B2B proposal titled "${opp.title}" for "${opp.client?.name ?? "the client"}".\n` +
      `Section: ${heading}.\n` +
      `Tone: concise, professional, South African English. 2-4 short paragraphs.\n` +
      `Mention the client by name once. Do not invent commercial terms — they are handled elsewhere.\n` +
      `Existing draft (refine if non-empty):\n---\n${local[key] || "(empty)"}\n---`;
    setBusyKey(key);
    try {
      const out = await api.ai.draft(prompt, key);
      await commit(key, (out.text || "").trim());
    } catch (e: any) {
      alert("AI draft failed: " + (e?.message || e));
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div className="bg-white border border-ui-border rounded-md p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-display font-bold text-sai-navy text-[14px]">Per-section drafts</div>
          <div className="text-[11px] text-slate-500">
            Paste ChatGPT output here. The .docx renderer uses these whenever non-empty,
            falling back to template defaults otherwise.
          </div>
        </div>
        {aiStatus && (
          <div className={`text-[10px] uppercase tracking-wider font-semibold px-2 py-1 rounded ${
            aiStatus.configured ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
          }`}>
            {aiStatus.configured ? `AI ready (${aiStatus.model})` : "AI off"}
          </div>
        )}
      </div>

      <div className="space-y-3">
        {pasteSections.map(({ section, key }) => {
          const heading = String(section.config?.heading || section.kind);
          const val = local[key] ?? "";
          return (
            <div key={key} className="border border-ui-border rounded p-3 bg-slate-50">
              <div className="flex items-center justify-between mb-1">
                <div className="text-[12px] font-semibold text-sai-navy">
                  {heading}
                  <span className="ml-2 text-[10px] text-slate-400 font-mono font-normal">key: {key}</span>
                </div>
                {aiStatus?.configured && (
                  <button
                    onClick={() => draftWithAi(key, section)}
                    disabled={busyKey === key}
                    className="text-[10px] border border-sai-blue text-sai-blue px-2 py-0.5 rounded font-semibold hover:bg-sai-bluepale disabled:opacity-40"
                  >
                    {busyKey === key ? "Drafting…" : "✨ Draft with AI"}
                  </button>
                )}
              </div>
              <textarea
                className="field-value min-h-[120px] resize-y bg-white"
                value={val}
                onChange={(e) => setLocal({ ...local, [key]: e.target.value })}
                onBlur={(e) => {
                  if (e.target.value !== (drafts[key] ?? "")) {
                    commit(key, e.target.value);
                  }
                }}
                placeholder={`Paste a draft for the “${heading}” section. Blank uses the template default.`}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

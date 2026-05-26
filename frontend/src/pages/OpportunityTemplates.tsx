import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type Item, type OpportunityTemplate, type TemplateLine } from "../api";
import CataloguePicker from "../components/CataloguePicker";
import RightDrawer, { DrawerCloseButton } from "../components/RightDrawer";

// Curated AMBS-relevant industries. Existing template values not in this list
// are still preserved via the "Other" sentinel option so legacy rows render.
const TEMPLATE_INDUSTRIES = [
  "Mining",
  "Education",
  "Healthcare",
  "Industrial / Construction",
  "Petrochemical",
  "Agriculture",
  "Hospitality",
  "Government / Defence",
  "Residential",
  "Commercial",
  "Logistics / Transport",
  "NGO / Humanitarian",
  "Telecoms / Utilities",
  "Events",
];

// Curated emoji set matching the kinds of modular projects AMBS sells.
const TEMPLATE_ICONS = [
  "📋", "🏗️", "⛏️", "🏫", "🏥", "🏢", "🏠", "🛏️", "🍽️",
  "📦", "🚛", "🐔", "🌱", "🏕️", "🛠️", "⚡", "🛡️", "🏭",
];

function money(v: number) {
  return "R " + v.toLocaleString("en-ZA", { maximumFractionDigits: 0 });
}

function lineTotal(ln: TemplateLine) {
  return (ln.quantity || 0) * (ln.unit_rate || 0);
}

export default function OpportunityTemplates() {
  const [templates, setTemplates] = useState<OpportunityTemplate[]>([]);
  const [editing, setEditing] = useState<OpportunityTemplate | null>(null);

  const reload = () => {
    api.opportunityTemplates.list().then(setTemplates).catch(() => setTemplates([]));
  };
  useEffect(reload, []);

  const createBlank = async () => {
    const name = prompt("Template name?");
    if (!name) return;
    const t = await api.opportunityTemplates.create({
      name,
      icon: "📋",
      title_hint: name,
      default_delivery_weeks: 6,
      default_deposit_pct: 40,
      default_lines: [],
    });
    reload();
    setEditing(t);
  };

  const del = async (t: OpportunityTemplate) => {
    if (!confirm(`Delete template "${t.name}"?`)) return;
    await api.opportunityTemplates.delete(t.id);
    reload();
  };

  return (
    <div className="min-h-[calc(100vh-44px)]">
      <div className="bg-white border-b border-ui-border px-4 py-2 flex items-center gap-3">
        <Link to="/" className="text-[12px] text-slate-500 hover:text-sai-navy">← Apps</Link>
        <div className="text-slate-300">/</div>
        <div className="text-[13px] font-semibold text-sai-navy font-display">Project Templates</div>
        <div className="flex-1" />
        <button
          onClick={createBlank}
          className="text-[11px] bg-sai-blue text-white px-3 py-1.5 rounded font-semibold hover:opacity-90"
        >
          + New Template
        </button>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-6">
        <div className="text-[12px] text-slate-500 mb-4">
          Pre-built starting points for common AMBS project types. When creating a new opportunity, the user picks a template and the line items, delivery weeks, and deposit % are pre-filled.
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((t) => {
            const subtotal = t.default_lines.filter(l => !l.is_optional).reduce((s, l) => s + lineTotal(l), 0);
            return (
              <div
                key={t.id}
                className={`bg-white border border-ui-border rounded-md p-4 shadow-card ${t.is_active ? "" : "opacity-60"}`}
              >
                <div className="flex items-start gap-3">
                  <div className="text-3xl">{t.icon}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[14px] font-display font-bold text-sai-navy">{t.name}</div>
                    <div className="text-[11px] text-slate-500">{t.industry}</div>
                  </div>
                </div>
                <div className="text-[12px] text-slate-600 mt-2 line-clamp-3">{t.description}</div>

                <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
                  <div>
                    <div className="text-[9px] uppercase tracking-wider text-slate-400">Lines</div>
                    <div className="font-semibold text-sai-navy">{t.default_lines.length}</div>
                  </div>
                  <div>
                    <div className="text-[9px] uppercase tracking-wider text-slate-400">Delivery</div>
                    <div className="font-semibold text-sai-navy">{t.default_delivery_weeks}w</div>
                  </div>
                  <div>
                    <div className="text-[9px] uppercase tracking-wider text-slate-400">Subtotal</div>
                    <div className="font-semibold text-sai-blue">{money(subtotal)}</div>
                  </div>
                </div>

                <div className="mt-3 pt-3 border-t border-ui-border flex justify-end gap-2">
                  <button
                    onClick={() => setEditing(t)}
                    className="text-[11px] border border-sai-blue text-sai-blue px-2 py-1 rounded font-semibold hover:bg-sai-bluepale"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => del(t)}
                    className="text-[11px] text-red-500 hover:text-red-700"
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
          {templates.length === 0 && (
            <div className="col-span-full bg-white border border-ui-border rounded-md p-10 text-center text-slate-400 italic">
              No templates yet. Click + New Template to add one.
            </div>
          )}
        </div>
      </div>

      {editing && (
        <TemplateEditor
          template={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); reload(); }}
        />
      )}
    </div>
  );
}

function TemplateEditor({
  template,
  onClose,
  onSaved,
}: {
  template: OpportunityTemplate;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<OpportunityTemplate>(template);
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);

  const update = <K extends keyof OpportunityTemplate>(k: K, v: OpportunityTemplate[K]) =>
    setDraft({ ...draft, [k]: v });

  const updateLine = (i: number, patch: Partial<TemplateLine>) => {
    const next = draft.default_lines.slice();
    next[i] = { ...next[i], ...patch };
    setDraft({ ...draft, default_lines: next });
  };
  const removeLine = (i: number) =>
    setDraft({ ...draft, default_lines: draft.default_lines.filter((_, j) => j !== i) });
  const addLine = () =>
    setDraft({
      ...draft,
      default_lines: [
        ...draft.default_lines,
        { item_code: "", description: "", quantity: 1, unit_of_measure: "each", unit_rate: 0, product_line: "", structure_type: "", is_optional: false },
      ],
    });

  const appendCatalogueItems = (picks: { item: Item; quantity: number }[]) => {
    const next: TemplateLine[] = [
      ...draft.default_lines,
      ...picks.map((p) => ({
        item_code: p.item.code,
        description: p.item.description || p.item.name,
        quantity: p.quantity,
        unit_of_measure: p.item.unit_of_measure,
        unit_rate: p.item.default_rate,
        product_line: p.item.product_line,
        structure_type: p.item.structure_type,
        is_optional: false,
      })),
    ];
    setDraft({ ...draft, default_lines: next });
    setPicking(false);
  };

  const appendTemplateLines = (tpl: OpportunityTemplate) => {
    setDraft({ ...draft, default_lines: [...draft.default_lines, ...tpl.default_lines] });
    setPicking(false);
  };

  const industryInList = TEMPLATE_INDUSTRIES.includes(draft.industry);

  const save = async () => {
    setBusy(true);
    try {
      await api.opportunityTemplates.update(draft.id, {
        name: draft.name,
        description: draft.description,
        icon: draft.icon,
        industry: draft.industry,
        title_hint: draft.title_hint,
        default_delivery_weeks: draft.default_delivery_weeks,
        default_deposit_pct: draft.default_deposit_pct,
        default_lines: draft.default_lines,
        is_active: draft.is_active,
      });
      onSaved();
    } catch (e: any) {
      alert("Save failed: " + (e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <RightDrawer
      drawerKey="opp-template-editor"
      defaultWidth={860}
      minWidth={620}
      closeOnBackdropClick={false}
      onClose={onClose}
    >
      <div className="px-5 py-3 border-b border-ui-border flex items-center">
        <div className="text-[14px] font-display font-bold text-sai-navy">
          Edit Template: {draft.name}
        </div>
        <div className="flex-1" />
        <button onClick={save} disabled={busy}
                className="text-[11px] bg-sai-blue text-white px-3 py-1.5 rounded font-semibold disabled:opacity-40 hover:opacity-90 mr-2">
          {busy ? "Saving…" : "Save"}
        </button>
        <DrawerCloseButton onClose={onClose} />
      </div>

        <div className="flex-1 overflow-y-auto scroll-thin px-5 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="field-label">Name</div>
              <input className="field-value" value={draft.name} onChange={(e) => update("name", e.target.value)} />
            </div>
            <div>
              <div className="field-label">Icon</div>
              <div className="flex flex-wrap gap-1 border border-ui-border rounded px-1.5 py-1.5 bg-white">
                {TEMPLATE_ICONS.map((emo) => {
                  const on = draft.icon === emo;
                  return (
                    <button
                      key={emo}
                      type="button"
                      onClick={() => update("icon", emo)}
                      title={on ? "Selected" : "Use this icon"}
                      className={`w-7 h-7 text-[18px] leading-none rounded flex items-center justify-center transition ${
                        on
                          ? "bg-sai-blue text-white ring-2 ring-sai-blue"
                          : "hover:bg-slate-100"
                      }`}
                    >
                      {emo}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <div className="field-label">Industry</div>
              <select
                className="field-value"
                value={industryInList || !draft.industry ? draft.industry : "__other__"}
                onChange={(e) => update("industry", e.target.value === "__other__" ? draft.industry : e.target.value)}
              >
                <option value="">— select —</option>
                {TEMPLATE_INDUSTRIES.map((ind) => (
                  <option key={ind} value={ind}>{ind}</option>
                ))}
                {!industryInList && draft.industry && (
                  <option value="__other__">{draft.industry} (legacy)</option>
                )}
              </select>
            </div>
            <div>
              <div className="field-label">Title hint for new opportunities</div>
              <input className="field-value" value={draft.title_hint} onChange={(e) => update("title_hint", e.target.value)} />
            </div>
            <div>
              <div className="field-label">Default delivery (weeks)</div>
              <input type="number" className="field-value" value={draft.default_delivery_weeks}
                     onChange={(e) => update("default_delivery_weeks", Number(e.target.value) || 0)} />
            </div>
            <div>
              <div className="field-label">Default deposit (%)</div>
              <input type="number" className="field-value" value={draft.default_deposit_pct}
                     onChange={(e) => update("default_deposit_pct", Number(e.target.value) || 0)} />
            </div>
          </div>

          <div>
            <div className="field-label">Description</div>
            <textarea className="field-value min-h-[60px] resize-y"
                      value={draft.description}
                      onChange={(e) => update("description", e.target.value)} />
          </div>

          <label className="flex items-center gap-2 text-[12px]">
            <input type="checkbox" checked={draft.is_active}
                   onChange={(e) => update("is_active", e.target.checked)} />
            Active (show in New Opportunity quick-start chips)
          </label>

          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="field-label">Default line items</div>
              <div className="flex gap-1.5">
                <button onClick={() => setPicking(true)}
                        className="text-[10px] bg-sai-blue text-white px-2 py-0.5 rounded font-semibold hover:opacity-90"
                        title="Browse the catalogue with category and tag filters">
                  🗂️ Pick from catalogue
                </button>
                <button onClick={addLine}
                        className="text-[10px] border border-sai-blue text-sai-blue px-2 py-0.5 rounded font-semibold hover:bg-sai-bluepale">
                  + Blank line
                </button>
              </div>
            </div>
            {picking && (
              <CataloguePicker
                onClose={() => setPicking(false)}
                onPick={appendCatalogueItems}
                onPickTemplate={appendTemplateLines}
                excludeTemplateId={draft.id}
              />
            )}
            <div className="border border-ui-border rounded-md overflow-hidden">
              <div className="grid grid-cols-[60px_1fr_70px_60px_80px_44px_24px] gap-x-1 bg-slate-50 border-b border-ui-border px-2 py-1 text-[9px] uppercase tracking-wider font-semibold text-slate-500">
                <div>Code</div><div>Description</div><div className="text-right">Qty</div><div>UoM</div><div className="text-right">Unit Rate</div><div className="text-center">Opt</div><div />
              </div>
              {draft.default_lines.map((ln, i) => (
                <div key={i} className="grid grid-cols-[60px_1fr_70px_60px_80px_44px_24px] gap-x-1 items-center border-b border-ui-border last:border-0 px-2 py-1 text-[11px]">
                  <input className="line-input font-mono" value={ln.item_code} onChange={(e) => updateLine(i, { item_code: e.target.value })} />
                  <input className="line-input" value={ln.description} onChange={(e) => updateLine(i, { description: e.target.value })} />
                  <input type="number" min={0} step={ln.unit_of_measure === "each" ? 1 : 0.01} className="line-input text-right" value={ln.quantity} onChange={(e) => updateLine(i, { quantity: Number(e.target.value) || 0 })} />
                  <input className="line-input" value={ln.unit_of_measure} onChange={(e) => updateLine(i, { unit_of_measure: e.target.value })} />
                  <input type="number" className="line-input text-right" value={ln.unit_rate} onChange={(e) => updateLine(i, { unit_rate: Number(e.target.value) || 0 })} />
                  <div className="text-center"><input type="checkbox" checked={ln.is_optional} onChange={(e) => updateLine(i, { is_optional: e.target.checked })} /></div>
                  <button onClick={() => removeLine(i)} className="text-slate-300 hover:text-red-500">×</button>
                </div>
              ))}
              {draft.default_lines.length === 0 && (
                <div className="px-3 py-5 text-[11px] text-slate-400 italic text-center">No lines yet.</div>
              )}
            </div>
          </div>
        </div>
    </RightDrawer>
  );
}

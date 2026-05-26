import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, type Template, type TemplateSection } from "../api";
import TemplatePreview from "../components/TemplatePreview";

const KIND_LABELS: Record<string, string> = {
  header: "Header (brand bar + title)",
  hero: "Hero Image (full-width banner)",
  toc: "Table of Contents (static text)",
  client_info: "Client Info (auto-filled table)",
  text: "Text Block (free text, supports {{variables}})",
  scope: "Scope of Work (bullets + auto-lines)",
  line_items: "Line Items Table (auto-generated)",
  image_gallery: "Image Gallery (line-item photos)",
  commercial: "Commercial Summary (auto-totals)",
  why_us: "Why Us (bullet list)",
  risks: "Risks & Mitigations (table)",
  warranty: "Warranty (paste-back enabled)",
  site_logistics: "Site & Logistics (paste-back enabled)",
  compliance: "Company Information & Compliance",
  appendix: "Appendix (drawings & supporting docs)",
  signature: "Signature Block",
  page_break: "Page Break",
};

const VAR_HELP =
  "Variables you can use in text: {{client.name}}, {{client.contact_person}}, {{client.site_location}}, {{client.email}}, {{client.phone}}, {{opportunity.title}}, {{opportunity.delivery_weeks}}, {{ref}}, {{date}}, {{amount}}, {{n_items}}, {{total_area_m2}}.";

function defaultConfig(kind: string): Record<string, any> {
  switch (kind) {
    case "header": return { title: "PROJECT PROPOSAL", show_reference: true };
    case "hero": return { heading: "" };
    case "toc": return { heading: "Contents" };
    case "client_info": return { heading: "Prepared For" };
    case "text": return { heading: "New Section", paste_key: "", body: "Write some text here. You can use {{variables}} like {{client.name}}." };
    case "scope": return { heading: "Scope of Work", auto_include_lines: true, items: [] };
    case "line_items": return { heading: "Line Items" };
    case "image_gallery": return { heading: "Module Gallery" };
    case "commercial": return { heading: "Commercial Summary", vat_percent: 15, payment_terms: "40% deposit · 40% on delivery · 20% on handover", validity_days: 30 };
    case "why_us": return { heading: "Why Us", bullets: [] };
    case "risks": return { heading: "Risks & Mitigations" };
    case "warranty": return { heading: "Warranty", paste_key: "warranty" };
    case "site_logistics": return { heading: "Site & Logistics", paste_key: "site_logistics" };
    case "compliance": return { heading: "Company Information & Compliance" };
    case "appendix": return { heading: "Appendix — Drawings & Supporting Documents" };
    case "signature": return { heading: "Acceptance", preface: "Acceptance of this proposal may be indicated by signature below and an official purchase order.", client_label: "Signed for the Client", company_label: "Signed for Company" };
    case "page_break": return {};
    default: return {};
  }
}

export default function TemplateEditor() {
  const { id } = useParams();
  const nav = useNavigate();
  const tid = Number(id);
  const [tpl, setTpl] = useState<Template | null>(null);
  const [addingKind, setAddingKind] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadingHero, setUploadingHero] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const heroInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    api.templates.get(tid).then((t) => { setTpl(t); setDirty(false); });
  }, [tid]);

  if (!tpl) return <div className="p-8 text-slate-500">Loading…</div>;

  const patch = (p: Partial<Template>) => { setTpl({ ...tpl, ...p }); setDirty(true); };

  const patchSection = (i: number, p: Partial<TemplateSection>) => {
    const sections = tpl.sections.slice();
    sections[i] = { ...sections[i], ...p };
    patch({ sections });
  };

  const patchConfig = (i: number, p: Record<string, any>) => {
    patchSection(i, { config: { ...tpl.sections[i].config, ...p } });
  };

  const move = (i: number, delta: number) => {
    const j = i + delta;
    if (j < 0 || j >= tpl.sections.length) return;
    const sections = tpl.sections.slice();
    [sections[i], sections[j]] = [sections[j], sections[i]];
    patch({ sections });
  };

  const remove = (i: number) => {
    patch({ sections: tpl.sections.filter((_, j) => j !== i) });
  };

  const addSection = () => {
    if (!addingKind) return;
    patch({ sections: [...tpl.sections, { kind: addingKind, enabled: true, config: defaultConfig(addingKind) }] });
    setAddingKind("");
  };

  const save = async () => {
    setBusy(true);
    try {
      const updated = await api.templates.update(tpl.id, tpl);
      setTpl(updated);
      setDirty(false);
    } catch (e: any) {
      alert("Save failed: " + (e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  const uploadLogo = async (file: File) => {
    setUploading(true);
    try {
      const updated = await api.templates.uploadLogo(tpl.id, file);
      setTpl(updated);
    } catch (e: any) {
      alert("Upload failed: " + (e?.message || e));
    } finally {
      setUploading(false);
    }
  };

  const clearLogo = async () => {
    if (!confirm("Remove this logo?")) return;
    const updated = await api.templates.clearLogo(tpl.id);
    setTpl(updated);
  };

  const uploadHero = async (file: File) => {
    setUploadingHero(true);
    try {
      const updated = await api.templates.uploadHero(tpl.id, file);
      setTpl(updated);
    } catch (e: any) {
      alert("Hero upload failed: " + (e?.message || e));
    } finally {
      setUploadingHero(false);
    }
  };

  const clearHero = async () => {
    if (!confirm("Remove this hero image?")) return;
    const updated = await api.templates.clearHero(tpl.id);
    setTpl(updated);
  };

  const openPreview = async () => {
    if (dirty) await save();
    setPreviewing(true);
  };

  return (
    <div className="min-h-[calc(100vh-44px)]">
      <div className="bg-white border-b border-ui-border px-4 py-2 flex items-center gap-3">
        <Link to="/" className="text-[12px] text-slate-500 hover:text-sai-navy">Apps</Link>
        <div className="text-slate-300">/</div>
        <Link to="/templates" className="text-[12px] text-slate-500 hover:text-sai-navy">Templates</Link>
        <div className="text-slate-300">/</div>
        <div className="text-[13px] font-semibold text-sai-navy font-display truncate">{tpl.name}</div>
        <div className="flex-1" />
        <button
          onClick={openPreview}
          className="text-[11px] border border-sai-blue text-sai-blue px-3 py-1.5 rounded font-semibold hover:bg-sai-bluepale"
        >
          Preview
        </button>
        <button
          onClick={save}
          disabled={!dirty || busy}
          className="text-[11px] bg-sai-blue text-white px-3 py-1.5 rounded font-semibold disabled:opacity-40 hover:opacity-90"
        >
          {busy ? "Saving…" : dirty ? "Save Template" : "Saved"}
        </button>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-6 space-y-4">
        {/* Template meta + brand */}
        <div className="bg-white border border-ui-border rounded-md p-5 space-y-3">
          <div className="font-display font-bold text-sai-navy">Template Details</div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-3">
            <Field label="Name"><input className="field-value" value={tpl.name} onChange={(e) => patch({ name: e.target.value })} /></Field>
            <Field label="Description"><input className="field-value" value={tpl.description} onChange={(e) => patch({ description: e.target.value })} /></Field>
            <Field label="Brand Company Name"><input className="field-value" value={tpl.brand_company_name} onChange={(e) => patch({ brand_company_name: e.target.value })} /></Field>
            <Field label="Tagline"><input className="field-value" value={tpl.brand_tagline} onChange={(e) => patch({ brand_tagline: e.target.value })} /></Field>
            <Field label="Address Line"><input className="field-value" value={tpl.brand_address_line} onChange={(e) => patch({ brand_address_line: e.target.value })} /></Field>
            <Field label="Contact Line"><input className="field-value" value={tpl.brand_contact_line} onChange={(e) => patch({ brand_contact_line: e.target.value })} /></Field>
            <Field label="Primary Colour">
              <div className="flex items-center gap-2">
                <input type="color" value={tpl.brand_primary_color} onChange={(e) => patch({ brand_primary_color: e.target.value })} className="h-6 w-8 border border-ui-border rounded cursor-pointer" />
                <input className="field-value flex-1" value={tpl.brand_primary_color} onChange={(e) => patch({ brand_primary_color: e.target.value })} />
              </div>
            </Field>
            <Field label="Accent Colour">
              <div className="flex items-center gap-2">
                <input type="color" value={tpl.brand_accent_color} onChange={(e) => patch({ brand_accent_color: e.target.value })} className="h-6 w-8 border border-ui-border rounded cursor-pointer" />
                <input className="field-value flex-1" value={tpl.brand_accent_color} onChange={(e) => patch({ brand_accent_color: e.target.value })} />
              </div>
            </Field>
            <Field label="Logo">
              <div className="flex items-center gap-3">
                {tpl.logo_filename ? (
                  <img
                    src={api.templates.logoUrl(tpl.logo_filename)}
                    alt="Logo"
                    className="h-12 w-auto max-w-[140px] object-contain border border-ui-border rounded bg-white p-1"
                  />
                ) : (
                  <div className="h-12 w-[140px] border border-dashed border-ui-border rounded text-[10px] text-slate-400 flex items-center justify-center italic bg-slate-50">
                    no logo
                  </div>
                )}
                <div className="flex flex-col gap-1">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="text-[11px] bg-sai-blue text-white px-2 py-1 rounded font-semibold hover:opacity-90 disabled:opacity-40"
                  >
                    {uploading ? "Uploading…" : tpl.logo_filename ? "Replace…" : "Upload…"}
                  </button>
                  {tpl.logo_filename && (
                    <button
                      onClick={clearLogo}
                      className="text-[11px] border border-ui-border text-slate-600 px-2 py-1 rounded font-semibold hover:bg-slate-50"
                    >
                      Remove
                    </button>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/gif,image/bmp"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) uploadLogo(f);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                />
              </div>
              <div className="text-[10px] text-slate-400 mt-1">
                PNG, JPG, GIF or BMP — max 5 MB. Sits in the header of the generated .docx.
              </div>
            </Field>
            <Field label="Default Template">
              <label className="flex items-center gap-2 text-[12px]">
                <input type="checkbox" checked={tpl.is_default} onChange={(e) => patch({ is_default: e.target.checked })} />
                Use this as the default template for generating proposals
              </label>
            </Field>
          </div>
        </div>

        {/* Hero image (v0.4.1) */}
        <div className="bg-white border border-ui-border rounded-md p-5 space-y-3">
          <div className="font-display font-bold text-sai-navy">Hero Image</div>
          <div className="text-[11px] text-slate-500">
            Rendered by the “Hero” section near the top of every generated proposal.
            Per-opportunity overrides win when set.
          </div>
          <div className="flex items-start gap-4">
            {tpl.hero_filename ? (
              <img
                src={api.templates.heroUrl(tpl.id)}
                alt="Hero"
                className="h-32 w-auto max-w-[280px] object-contain border border-ui-border rounded bg-white p-1"
              />
            ) : (
              <div className="h-32 w-[280px] border border-dashed border-ui-border rounded text-[11px] text-slate-400 flex items-center justify-center italic bg-slate-50">
                no hero image
              </div>
            )}
            <div className="flex flex-col gap-1">
              <button
                onClick={() => heroInputRef.current?.click()}
                disabled={uploadingHero}
                className="text-[11px] bg-sai-blue text-white px-2 py-1 rounded font-semibold hover:opacity-90 disabled:opacity-40"
              >
                {uploadingHero ? "Uploading…" : tpl.hero_filename ? "Replace…" : "Upload…"}
              </button>
              {tpl.hero_filename && (
                <button
                  onClick={clearHero}
                  className="text-[11px] border border-ui-border text-slate-600 px-2 py-1 rounded font-semibold hover:bg-slate-50"
                >
                  Remove
                </button>
              )}
              <div className="text-[10px] text-slate-400 mt-1 max-w-[180px]">
                PNG, JPG or JPEG — max 8 MB. Sized to ~16 cm wide in the docx.
              </div>
            </div>
            <input
              ref={heroInputRef}
              type="file"
              accept="image/png,image/jpeg"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadHero(f);
                if (heroInputRef.current) heroInputRef.current.value = "";
              }}
            />
          </div>
        </div>

        {/* Tax / Compliance (v0.4.1) */}
        <div className="bg-white border border-ui-border rounded-md p-5 space-y-3">
          <div className="font-display font-bold text-sai-navy">Company Information & Compliance</div>
          <div className="text-[11px] text-slate-500">
            Rendered by the “Compliance” section. Leave blank to hide that row.
            Template-level only — no per-opportunity override.
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-3">
            <Field label="Company Registration">
              <input className="field-value" value={tpl.tax_company_reg ?? ""} onChange={(e) => patch({ tax_company_reg: e.target.value })} />
            </Field>
            <Field label="VAT Number">
              <input className="field-value" value={tpl.tax_vat_number ?? ""} onChange={(e) => patch({ tax_vat_number: e.target.value })} />
            </Field>
            <Field label="B-BBEE Level">
              <input className="field-value" value={tpl.tax_bbbee_level ?? ""} onChange={(e) => patch({ tax_bbbee_level: e.target.value })} />
            </Field>
            <Field label="B-BBEE Cert Expiry">
              <input className="field-value" value={tpl.tax_bbbee_cert_expiry ?? ""} placeholder="YYYY-MM-DD or free text" onChange={(e) => patch({ tax_bbbee_cert_expiry: e.target.value })} />
            </Field>
            <Field label="Registered Address">
              <input className="field-value" value={tpl.tax_address ?? ""} onChange={(e) => patch({ tax_address: e.target.value })} />
            </Field>
            <Field label="Directors">
              <input className="field-value" value={tpl.tax_directors ?? ""} onChange={(e) => patch({ tax_directors: e.target.value })} />
            </Field>
          </div>
        </div>

        {/* Default content (v0.4.1) */}
        <div className="bg-white border border-ui-border rounded-md p-5 space-y-3">
          <div className="font-display font-bold text-sai-navy">Section Defaults</div>
          <div className="text-[11px] text-slate-500">
            Boilerplate used by the Warranty, Site & Logistics, and Risks sections when an
            opportunity doesn't override them. Per-opportunity overrides — and any per-section
            paste-back — win at render time.
          </div>
          <Field label="Default Warranty">
            <textarea
              className="field-value min-h-[100px] resize-y"
              value={tpl.default_warranty_md ?? ""}
              onChange={(e) => patch({ default_warranty_md: e.target.value })}
              placeholder="Warranty terms — blank paragraphs become paragraph breaks in the docx."
            />
          </Field>
          <Field label="Default Site & Logistics">
            <textarea
              className="field-value min-h-[100px] resize-y"
              value={tpl.default_site_logistics_md ?? ""}
              onChange={(e) => patch({ default_site_logistics_md: e.target.value })}
              placeholder="Site access requirements, what the client needs to provide, etc."
            />
          </Field>
          <RisksJsonEditor
            value={tpl.default_risks_json ?? "[]"}
            onChange={(v) => patch({ default_risks_json: v })}
          />
        </div>

        {/* Sections */}
        <div className="bg-white border border-ui-border rounded-md p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="font-display font-bold text-sai-navy">Sections</div>
            <div className="flex items-center gap-2">
              <select
                value={addingKind}
                onChange={(e) => setAddingKind(e.target.value)}
                className="text-[11px] border border-ui-border rounded px-2 py-1 outline-none focus:border-sai-blue"
              >
                <option value="">+ Add section…</option>
                {Object.entries(KIND_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>{label}</option>
                ))}
              </select>
              <button onClick={addSection} disabled={!addingKind}
                      className="text-[11px] bg-sai-blue text-white px-3 py-1 rounded font-semibold hover:opacity-90 disabled:opacity-40">
                Add
              </button>
            </div>
          </div>

          <div className="text-[11px] text-slate-500 italic">{VAR_HELP}</div>

          <div className="space-y-2">
            {tpl.sections.map((s, i) => (
              <SectionCard
                key={i}
                section={s}
                index={i}
                total={tpl.sections.length}
                onToggle={() => patchSection(i, { enabled: !s.enabled })}
                onConfig={(p) => patchConfig(i, p)}
                onMove={(d) => move(i, d)}
                onRemove={() => remove(i)}
              />
            ))}
            {tpl.sections.length === 0 && (
              <div className="text-[12px] text-slate-400 italic text-center py-8">
                No sections yet. Use the dropdown above to add your first section.
              </div>
            )}
          </div>
        </div>
      </div>

      {previewing && (
        <TemplatePreview template={tpl} onClose={() => setPreviewing(false)} />
      )}
    </div>
  );
}

function SectionCard({
  section, index, total, onToggle, onConfig, onMove, onRemove,
}: {
  section: TemplateSection;
  index: number;
  total: number;
  onToggle: () => void;
  onConfig: (p: Record<string, any>) => void;
  onMove: (delta: number) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`border rounded-md overflow-hidden ${section.enabled ? "border-ui-border" : "border-dashed border-slate-300 bg-slate-50"}`}>
      <div className="flex items-center gap-2 px-3 py-2">
        <button onClick={onToggle} title={section.enabled ? "Disable" : "Enable"}
                className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded font-semibold ${
                  section.enabled ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-500"
                }`}>
          {section.enabled ? "ON" : "OFF"}
        </button>
        <div className="flex-1 min-w-0">
          <div className="text-[12px] font-semibold text-sai-navy truncate">
            {KIND_LABELS[section.kind] ?? section.kind}
          </div>
          {section.config.heading && (
            <div className="text-[11px] text-slate-500 truncate">{section.config.heading}</div>
          )}
        </div>
        <button onClick={() => onMove(-1)} disabled={index === 0}
                className="text-slate-400 hover:text-sai-navy disabled:opacity-30 text-[14px] leading-none px-1">↑</button>
        <button onClick={() => onMove(1)} disabled={index === total - 1}
                className="text-slate-400 hover:text-sai-navy disabled:opacity-30 text-[14px] leading-none px-1">↓</button>
        <button onClick={() => setOpen(!open)}
                className="text-[10px] text-slate-500 hover:text-sai-navy px-2 py-0.5 border border-ui-border rounded">
          {open ? "Close" : "Edit"}
        </button>
        <button onClick={onRemove} title="Remove section"
                className="text-slate-300 hover:text-red-500 text-[14px] leading-none px-1">×</button>
      </div>
      {open && (
        <div className="border-t border-ui-border px-4 py-3 bg-white">
          <SectionConfigForm kind={section.kind} config={section.config} onChange={onConfig} />
        </div>
      )}
    </div>
  );
}

function SectionConfigForm({ kind, config, onChange }: { kind: string; config: Record<string, any>; onChange: (p: Record<string, any>) => void }) {
  const Text = (k: string, label: string, ph?: string) => (
    <Field label={label}>
      <input className="field-value" value={config[k] ?? ""} placeholder={ph} onChange={(e) => onChange({ [k]: e.target.value })} />
    </Field>
  );
  const Area = (k: string, label: string, ph?: string) => (
    <Field label={label}>
      <textarea className="field-value min-h-[80px] resize-y" value={config[k] ?? ""} placeholder={ph} onChange={(e) => onChange({ [k]: e.target.value })} />
    </Field>
  );
  const Num = (k: string, label: string) => (
    <Field label={label}>
      <input type="number" step="0.01" className="field-value" value={config[k] ?? 0} onChange={(e) => onChange({ [k]: Number(e.target.value) })} />
    </Field>
  );
  const Bool = (k: string, label: string) => (
    <label className="flex items-center gap-2 text-[12px]">
      <input type="checkbox" checked={!!config[k]} onChange={(e) => onChange({ [k]: e.target.checked })} /> {label}
    </label>
  );
  const ListEditor = (k: string, label: string, itemPh: string) => {
    const items: string[] = config[k] ?? [];
    return (
      <div>
        <div className="flex items-center justify-between mb-1">
          <div className="field-label mb-0">{label}</div>
          <button onClick={() => onChange({ [k]: [...items, ""] })}
                  className="text-[10px] border border-sai-blue text-sai-blue px-2 py-0.5 rounded font-semibold hover:bg-sai-bluepale">+ Add</button>
        </div>
        <div className="space-y-1">
          {items.map((it, i) => (
            <div key={i} className="flex items-start gap-1">
              <textarea
                className="field-value flex-1 min-h-[40px] resize-y"
                placeholder={itemPh}
                value={it}
                onChange={(e) => { const next = items.slice(); next[i] = e.target.value; onChange({ [k]: next }); }}
              />
              <button onClick={() => onChange({ [k]: items.filter((_, j) => j !== i) })}
                      className="text-slate-300 hover:text-red-500 text-[14px] leading-none mt-1">×</button>
            </div>
          ))}
          {items.length === 0 && <div className="text-[11px] text-slate-400 italic">No entries.</div>}
        </div>
      </div>
    );
  };

  switch (kind) {
    case "header":
      return (<div className="space-y-3">{Text("title", "Title")}{Bool("show_reference", "Show reference number & issue date")}</div>);
    case "client_info":
      return (<div>{Text("heading", "Heading")}</div>);
    case "text":
      return (<div className="space-y-3">
        {Text("heading", "Heading (optional)")}
        {Text("paste_key", "Paste key (optional — set to enable per-opportunity paste-back)", "e.g. executive_summary")}
        {Area("body", "Body (supports {{variables}})", "Write body text…")}
      </div>);
    case "hero":
      return (<div className="text-[11px] text-slate-500 italic">
        Uses the template hero image (configured above), or the per-opportunity hero override when set.
      </div>);
    case "toc":
      return (<div>{Text("heading", "Heading")}</div>);
    case "image_gallery":
      return (<div className="space-y-2">
        {Text("heading", "Heading")}
        <div className="text-[11px] text-slate-500 italic">
          Auto-renders a 2-column grid of every line item's catalogue image. Section is skipped when no line items have images.
        </div>
      </div>);
    case "risks":
      return (<div className="space-y-2">
        {Text("heading", "Heading")}
        <div className="text-[11px] text-slate-500 italic">
          Renders the default risks table from this template, or the per-opportunity override when non-empty.
        </div>
      </div>);
    case "warranty":
    case "site_logistics":
      return (<div className="space-y-2">
        {Text("heading", "Heading")}
        {Text("paste_key", "Paste key (optional — for per-opportunity drafts)", kind === "warranty" ? "warranty" : "site_logistics")}
        {Area("body", "Fallback body (optional — used only when template & opp defaults are blank)", "Leave blank to fall back to the template default.")}
      </div>);
    case "compliance":
      return (<div className="space-y-2">
        {Text("heading", "Heading")}
        <div className="text-[11px] text-slate-500 italic">
          Renders the company-information & compliance fields configured above.
        </div>
      </div>);
    case "appendix":
      return (<div className="space-y-2">
        {Text("heading", "Heading")}
        <div className="text-[11px] text-slate-500 italic">
          Renders files attached to each opportunity. Images embed inline; other types are listed by filename. Section is skipped when no files are attached.
        </div>
      </div>);
    case "scope":
      return (<div className="space-y-3">
        {Text("heading", "Heading")}
        {Bool("auto_include_lines", "Automatically include bullet points from the opportunity's line items (grouped by product line)")}
        {ListEditor("items", "Additional bullets (standard clauses)", "e.g. Site establishment and snag-list close-out.")}
      </div>);
    case "line_items":
      return (<div>{Text("heading", "Heading")}</div>);
    case "commercial":
      return (<div className="space-y-3">
        {Text("heading", "Heading")}
        {Num("vat_percent", "VAT %")}
        {Text("payment_terms", "Payment terms")}
        {Num("validity_days", "Validity (days)")}
      </div>);
    case "why_us":
      return (<div className="space-y-3">
        {Text("heading", "Heading")}
        {ListEditor("bullets", "Bullets", "e.g. ISO 9001:2015 certified — every build audited.")}
      </div>);
    case "signature":
      return (<div className="space-y-3">
        {Text("heading", "Heading")}
        {Area("preface", "Preface text")}
        {Text("client_label", "Client signature label")}
        {Text("company_label", "Company signature label")}
      </div>);
    case "page_break":
      return <div className="text-[11px] text-slate-500 italic">No configuration — forces a page break.</div>;
    default:
      return <div className="text-[11px] text-slate-500 italic">Unknown section kind.</div>;
  }
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="field-label">{label}</div>
      {children}
    </div>
  );
}

type RiskRowDraft = { risk: string; likelihood: string; impact: string; mitigation: string };

function RisksJsonEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  // Visual editor for the risks JSON array. Falls back to a raw textarea when
  // the value can't be parsed so users aren't locked out of fixing bad data.
  let parsed: RiskRowDraft[] | null = null;
  try {
    const raw = JSON.parse(value || "[]");
    if (Array.isArray(raw)) {
      parsed = raw.map((r) => ({
        risk: String(r?.risk ?? ""),
        likelihood: String(r?.likelihood ?? "Medium"),
        impact: String(r?.impact ?? "Medium"),
        mitigation: String(r?.mitigation ?? ""),
      }));
    }
  } catch {
    parsed = null;
  }

  const commit = (rows: RiskRowDraft[]) => onChange(JSON.stringify(rows));

  if (parsed === null) {
    return (
      <div>
        <div className="flex items-center justify-between mb-1">
          <div className="field-label mb-0">Default Risks (raw JSON — couldn't parse)</div>
          <button
            onClick={() => commit([])}
            className="text-[10px] border border-ui-border text-slate-600 px-2 py-0.5 rounded font-semibold hover:bg-slate-50"
          >
            Reset to empty list
          </button>
        </div>
        <textarea
          className="field-value min-h-[120px] resize-y font-mono"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <div className="field-label mb-0">Default Risks</div>
        <button
          onClick={() => commit([...parsed!, { risk: "", likelihood: "Medium", impact: "Medium", mitigation: "" }])}
          className="text-[10px] border border-sai-blue text-sai-blue px-2 py-0.5 rounded font-semibold hover:bg-sai-bluepale"
        >
          + Add risk
        </button>
      </div>
      <div className="space-y-2">
        {parsed.length === 0 && <div className="text-[11px] text-slate-400 italic">No risks yet — add one above.</div>}
        {parsed.map((row, i) => {
          const update = (p: Partial<RiskRowDraft>) => {
            const next = parsed!.slice();
            next[i] = { ...next[i], ...p };
            commit(next);
          };
          const remove = () => commit(parsed!.filter((_, j) => j !== i));
          return (
            <div key={i} className="grid grid-cols-[1fr_100px_100px_1fr_24px] gap-2 items-start">
              <textarea
                className="field-value min-h-[42px] resize-y"
                placeholder="Risk description"
                value={row.risk}
                onChange={(e) => update({ risk: e.target.value })}
              />
              <select className="field-value" value={row.likelihood} onChange={(e) => update({ likelihood: e.target.value })}>
                <option>Low</option><option>Medium</option><option>High</option>
              </select>
              <select className="field-value" value={row.impact} onChange={(e) => update({ impact: e.target.value })}>
                <option>Low</option><option>Medium</option><option>High</option>
              </select>
              <textarea
                className="field-value min-h-[42px] resize-y"
                placeholder="Mitigation"
                value={row.mitigation}
                onChange={(e) => update({ mitigation: e.target.value })}
              />
              <button onClick={remove} title="Remove risk" className="text-slate-300 hover:text-red-500 text-[14px] leading-none mt-2">×</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

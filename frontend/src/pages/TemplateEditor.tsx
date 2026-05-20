import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, type Template, type TemplateSection } from "../api";
import TemplatePreview from "../components/TemplatePreview";

const KIND_LABELS: Record<string, string> = {
  header: "Header (brand bar + title)",
  client_info: "Client Info (auto-filled table)",
  text: "Text Block (free text, supports {{variables}})",
  scope: "Scope of Work (bullets + auto-lines)",
  line_items: "Line Items Table (auto-generated)",
  commercial: "Commercial Summary (auto-totals)",
  why_us: "Why Us (bullet list)",
  signature: "Signature Block",
  page_break: "Page Break",
};

const VAR_HELP =
  "Variables you can use in text: {{client.name}}, {{client.contact_person}}, {{client.site_location}}, {{client.email}}, {{client.phone}}, {{opportunity.title}}, {{opportunity.delivery_weeks}}, {{ref}}, {{date}}, {{amount}}, {{n_items}}, {{total_area_m2}}.";

function defaultConfig(kind: string): Record<string, any> {
  switch (kind) {
    case "header": return { title: "PROJECT PROPOSAL", show_reference: true };
    case "client_info": return { heading: "Prepared For" };
    case "text": return { heading: "New Section", body: "Write some text here. You can use {{variables}} like {{client.name}}." };
    case "scope": return { heading: "Scope of Work", auto_include_lines: true, items: [] };
    case "line_items": return { heading: "Line Items" };
    case "commercial": return { heading: "Commercial Summary", vat_percent: 15, payment_terms: "40% deposit · 40% on delivery · 20% on handover", validity_days: 30 };
    case "why_us": return { heading: "Why Us", bullets: [] };
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
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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

  const openPreview = async () => {
    if (dirty) await save();
    setPreviewing(true);
  };

  return (
    <div className="min-h-[calc(100vh-44px)]">
      <div className="bg-white border-b border-odoo-border px-4 py-2 flex items-center gap-3">
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
        <div className="bg-white border border-odoo-border rounded-md p-5 space-y-3">
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
                <input type="color" value={tpl.brand_primary_color} onChange={(e) => patch({ brand_primary_color: e.target.value })} className="h-6 w-8 border border-odoo-border rounded cursor-pointer" />
                <input className="field-value flex-1" value={tpl.brand_primary_color} onChange={(e) => patch({ brand_primary_color: e.target.value })} />
              </div>
            </Field>
            <Field label="Accent Colour">
              <div className="flex items-center gap-2">
                <input type="color" value={tpl.brand_accent_color} onChange={(e) => patch({ brand_accent_color: e.target.value })} className="h-6 w-8 border border-odoo-border rounded cursor-pointer" />
                <input className="field-value flex-1" value={tpl.brand_accent_color} onChange={(e) => patch({ brand_accent_color: e.target.value })} />
              </div>
            </Field>
            <Field label="Logo">
              <div className="flex items-center gap-3">
                {tpl.logo_filename ? (
                  <img
                    src={api.templates.logoUrl(tpl.logo_filename)}
                    alt="Logo"
                    className="h-12 w-auto max-w-[140px] object-contain border border-odoo-border rounded bg-white p-1"
                  />
                ) : (
                  <div className="h-12 w-[140px] border border-dashed border-odoo-border rounded text-[10px] text-slate-400 flex items-center justify-center italic bg-slate-50">
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
                      className="text-[11px] border border-odoo-border text-slate-600 px-2 py-1 rounded font-semibold hover:bg-slate-50"
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

        {/* Sections */}
        <div className="bg-white border border-odoo-border rounded-md p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="font-display font-bold text-sai-navy">Sections</div>
            <div className="flex items-center gap-2">
              <select
                value={addingKind}
                onChange={(e) => setAddingKind(e.target.value)}
                className="text-[11px] border border-odoo-border rounded px-2 py-1 outline-none focus:border-sai-blue"
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
    <div className={`border rounded-md overflow-hidden ${section.enabled ? "border-odoo-border" : "border-dashed border-slate-300 bg-slate-50"}`}>
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
                className="text-[10px] text-slate-500 hover:text-sai-navy px-2 py-0.5 border border-odoo-border rounded">
          {open ? "Close" : "Edit"}
        </button>
        <button onClick={onRemove} title="Remove section"
                className="text-slate-300 hover:text-red-500 text-[14px] leading-none px-1">×</button>
      </div>
      {open && (
        <div className="border-t border-odoo-border px-4 py-3 bg-white">
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
      return (<div className="space-y-3">{Text("heading", "Heading (optional)")}{Area("body", "Body (supports {{variables}})", "Write body text…")}</div>);
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

import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, type Template } from "../api";

export default function Templates() {
  const [list, setList] = useState<Template[]>([]);
  const nav = useNavigate();

  const load = () => { api.templates.list().then(setList).catch(() => {}); };
  useEffect(() => { load(); }, []);

  const create = async () => {
    const name = prompt("New template name?");
    if (!name) return;
    const t = await api.templates.create({
      name,
      description: "",
      is_default: false,
      brand_company_name: "AMBS",
      brand_tagline: "African Modular Building Solutions",
      brand_address_line: "",
      brand_contact_line: "",
      brand_primary_color: "#2563B0",
      brand_accent_color: "#0B1120",
      logo_filename: "",
      sections: [
        { kind: "header", enabled: true, config: { title: "PROJECT PROPOSAL", show_reference: true } },
        { kind: "client_info", enabled: true, config: { heading: "Prepared For" } },
        { kind: "line_items", enabled: true, config: { heading: "Line Items" } },
        { kind: "commercial", enabled: true, config: { heading: "Commercial Summary", vat_percent: 15, payment_terms: "40% deposit · 40% on delivery · 20% on handover", validity_days: 30 } },
        { kind: "signature", enabled: true, config: { heading: "Acceptance" } },
      ],
    });
    nav(`/templates/${t.id}`);
  };

  const duplicate = async (t: Template) => {
    const clone = await api.templates.duplicate(t.id);
    load();
    nav(`/templates/${clone.id}`);
  };

  const remove = async (t: Template) => {
    if (!confirm(`Delete template '${t.name}'?`)) return;
    try {
      await api.templates.delete(t.id);
      load();
    } catch (e: any) {
      alert("Delete failed: " + (e?.message || e));
    }
  };

  return (
    <div className="min-h-[calc(100vh-44px)]">
      <div className="bg-white border-b border-odoo-border px-4 py-2 flex items-center gap-3">
        <Link to="/" className="text-[12px] text-slate-500 hover:text-sai-navy">← Apps</Link>
        <div className="text-slate-300">/</div>
        <div className="text-[13px] font-semibold text-sai-navy font-display">Proposal Templates</div>
        <div className="flex-1" />
        <button
          onClick={create}
          className="text-[11px] bg-sai-blue text-white px-3 py-1.5 rounded font-semibold hover:opacity-90"
        >
          + New Template
        </button>
      </div>

      <div className="px-4 py-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {list.map((t) => (
            <div
              key={t.id}
              className="bg-white border border-odoo-border rounded-md p-4 shadow-card hover:shadow-kanban transition cursor-pointer"
              onClick={() => nav(`/templates/${t.id}`)}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="font-display font-bold text-sai-navy truncate">{t.name}</div>
                    {t.is_default && (
                      <span className="text-[9px] uppercase tracking-wider bg-sai-blue text-white px-1.5 py-0.5 rounded font-semibold">Default</span>
                    )}
                  </div>
                  {t.description && <div className="text-[11px] text-slate-500 mt-1">{t.description}</div>}
                </div>
                <div className="w-10 h-10 rounded flex-shrink-0 ml-3" style={{ background: t.brand_primary_color }} />
              </div>
              <div className="mt-3 text-[11px] text-slate-500">
                {t.sections.filter((s) => s.enabled).length} of {t.sections.length} sections enabled
              </div>
              <div className="mt-3 pt-3 border-t border-odoo-border flex gap-2">
                <button
                  onClick={(e) => { e.stopPropagation(); nav(`/templates/${t.id}`); }}
                  className="text-[10px] bg-sai-blue text-white px-2 py-1 rounded font-semibold hover:opacity-90"
                >
                  Edit
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); duplicate(t); }}
                  className="text-[10px] border border-odoo-border text-slate-600 px-2 py-1 rounded font-semibold hover:bg-slate-50"
                >
                  Duplicate
                </button>
                <div className="flex-1" />
                <button
                  onClick={(e) => { e.stopPropagation(); remove(t); }}
                  title="Delete"
                  className="text-slate-300 hover:text-red-500 text-[14px] leading-none"
                >×</button>
              </div>
            </div>
          ))}
          {list.length === 0 && (
            <div className="col-span-full bg-white border border-odoo-border rounded-md p-10 text-center text-slate-400 italic">
              No templates yet. Click + New Template.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

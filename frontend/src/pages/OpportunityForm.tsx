import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  api,
  type Activity,
  type Catalogue,
  type Opportunity,
  type OpportunityLineDraft,
  type Proposal,
  type Salesperson,
  type Status,
  type Template,
} from "../api";
import LineEditor from "../components/LineEditor";
import HelpPopover from "../components/HelpPopover";
import PromptBuilder from "../components/PromptBuilder";
import OppHeroAndAssets from "../components/OppHeroAndAssets";
import SectionDrafts from "../components/SectionDrafts";

const FIELD_HELP = {
  salesperson: {
    id: "opp.salesperson",
    title: "Salesperson",
    body: "AMBS team member to credit on this deal. Shows on the .docx as the named contact and as initials on the Pipeline card.",
    example: "Vernon van Emmenis",
  },
  valid_until: {
    id: "opp.valid_until",
    title: "Quotation valid until",
    body: "After this date the quote is treated as expired. The Pipeline card flips to a red 'Expired' badge so you can chase or re-issue. Typical validity for AMBS quotes is 30 days from issue.",
  },
  deposit_pct: {
    id: "opp.deposit_pct",
    title: "Deposit on signature (%)",
    body: "Percentage of the subtotal the client pays on acceptance. Surfaced in the .docx commercial section as 'Deposit due on signature'. AMBS standard is 40% deposit, 40% on delivery, 20% on handover — adjust as the deal requires.",
    example: "40% on R 11 200 000 = R 4 480 000 deposit.",
  },
} as const;

const STAGES = ["new", "qualified", "proposal", "won", "lost"] as const;
type Stage = (typeof STAGES)[number];
const STAGE_LABEL: Record<Stage, string> = {
  new: "New",
  qualified: "Qualified",
  proposal: "Proposal Sent",
  won: "Won",
  lost: "Lost",
};

function money(v: number) {
  return "R " + v.toLocaleString("en-ZA", { maximumFractionDigits: 2 });
}

type LineDraft = OpportunityLineDraft & { id?: number };

function toDraft(lines: Opportunity["lines"]): LineDraft[] {
  return lines.map((l) => ({
    id: l.id,
    sequence: l.sequence,
    item_code: l.item_code,
    product_line: l.product_line,
    structure_type: l.structure_type,
    description: l.description,
    quantity: l.quantity,
    unit_of_measure: l.unit_of_measure,
    unit_rate: l.unit_rate,
    discount_pct: l.discount_pct ?? 0,
    is_optional: l.is_optional ?? false,
    cost_rate: l.cost_rate ?? 0,
    bundle_label: l.bundle_label ?? "",
  }));
}

const PROPOSAL_STATUS_ORDER: Proposal["status"][] = ["draft", "sent", "viewed", "signed", "paid"];

function StatusPill({ status }: { status: Proposal["status"] }) {
  const COLORS: Record<Proposal["status"], string> = {
    draft:  "bg-slate-100 text-slate-600",
    sent:   "bg-blue-100 text-blue-700",
    viewed: "bg-violet-100 text-violet-700",
    signed: "bg-emerald-100 text-emerald-700",
    paid:   "bg-emerald-600 text-white",
  };
  return (
    <span className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded font-semibold ${COLORS[status]}`}>
      {status}
    </span>
  );
}

export default function OpportunityForm() {
  const { id } = useParams();
  const nav = useNavigate();
  const oppId = Number(id);
  const [opp, setOpp] = useState<Opportunity | null>(null);
  const [catalogue, setCatalogue] = useState<Catalogue | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [salespeople, setSalespeople] = useState<Salesperson[]>([]);
  const [newNote, setNewNote] = useState("");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"message" | "note" | "log">("message");

  const load = () => {
    api.opportunities.get(oppId).then((o) => {
      setOpp(o);
      setLines(toDraft(o.lines));
    }).catch(() => {});
    api.opportunities.activities(oppId).then(setActivities).catch(() => {});
    api.proposals.list().then(setProposals).catch(() => {});
    api.status().then(setStatus).catch(() => {});
  };

  useEffect(() => {
    load();
    api.catalogue().then(setCatalogue).catch(() => {});
    api.templates.list().then((list) => {
      setTemplates(list);
      const def = list.find((t) => t.is_default) ?? list[0];
      if (def) setSelectedTemplateId(def.id);
    }).catch(() => {});
    api.salespeople.list().then(setSalespeople).catch(() => setSalespeople([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oppId]);

  const lineSubtotal = useMemo(
    () =>
      lines.reduce(
        (s, ln) => s + (Number(ln.quantity) || 0) * (Number(ln.unit_rate) || 0),
        0
      ),
    [lines]
  );

  if (!opp) {
    return <div className="p-8 text-slate-500">Loading…</div>;
  }

  const updateHeader = <K extends keyof Opportunity>(k: K, v: Opportunity[K]) => {
    setOpp({ ...opp, [k]: v });
    setDirty(true);
  };

  const onLinesChange = (next: LineDraft[]) => {
    setLines(next);
    setDirty(true);
  };

  const syncLines = async () => {
    const server = opp.lines;
    const keptIds = new Set<number>();
    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i];
      const payload: OpportunityLineDraft = {
        item_code: ln.item_code || "",
        product_line: ln.product_line,
        structure_type: ln.structure_type,
        description: ln.description,
        quantity: Number(ln.quantity) || 0,
        unit_of_measure: ln.unit_of_measure || "each",
        unit_rate: Number(ln.unit_rate) || 0,
        sequence: i,
        discount_pct: Number(ln.discount_pct) || 0,
        is_optional: !!ln.is_optional,
        cost_rate: Number(ln.cost_rate) || 0,
        bundle_label: ln.bundle_label ?? "",
      };
      if (ln.id) {
        await api.opportunities.updateLine(oppId, ln.id, payload);
        keptIds.add(ln.id);
      } else {
        const created = await api.opportunities.addLine(oppId, payload);
        ln.id = created.id;
        keptIds.add(created.id);
      }
    }
    for (const s of server) {
      if (!keptIds.has(s.id)) {
        await api.opportunities.deleteLine(oppId, s.id);
      }
    }
  };

  const save = async () => {
    setBusy(true);
    try {
      await api.opportunities.update(opp.id, {
        title: opp.title,
        delivery_weeks: opp.delivery_weeks,
        priority: opp.priority,
        notes: opp.notes,
        valid_until: opp.valid_until,
        salesperson: opp.salesperson,
        deposit_pct: opp.deposit_pct,
      });
      await syncLines();
      const fresh = await api.opportunities.get(oppId);
      setOpp(fresh);
      setLines(toDraft(fresh.lines));
      setDirty(false);
    } catch (e: any) {
      alert("Save failed: " + (e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  const advanceStatus = async (p: Proposal, status: Proposal["status"]) => {
    try {
      await api.proposals.setStatus(p.id, status);
      api.proposals.list().then(setProposals);
    } catch (e: any) {
      alert("Could not update status: " + (e?.message || e));
    }
  };

  const setStage = async (s: Stage) => {
    await api.opportunities.update(opp.id, { stage: s });
    load();
  };

  const generate = async () => {
    setBusy(true);
    try {
      if (dirty) await save();
      const p = await api.proposals.generate(opp.id, selectedTemplateId ?? undefined);
      window.location.href = api.proposals.downloadUrl(p.id);
      setTimeout(load, 600);
    } catch (e: any) {
      alert("Generate failed: " + (e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  const postActivity = async () => {
    if (!newNote.trim()) return;
    await api.opportunities.addActivity(opp.id, { body: newNote, kind: tab });
    setNewNote("");
    api.opportunities.activities(opp.id).then(setActivities);
  };

  return (
    <div className="min-h-[calc(100vh-44px)]">
      <div className="bg-white border-b border-ui-border px-4 py-2 flex items-center gap-3">
        <Link to="/" className="text-[12px] text-slate-500 hover:text-sai-navy">Apps</Link>
        <div className="text-slate-300">/</div>
        <Link to="/proposals" className="text-[12px] text-slate-500 hover:text-sai-navy">Pipeline</Link>
        <div className="text-slate-300">/</div>
        <div className="text-[13px] font-semibold text-sai-navy font-display truncate">{opp.title}</div>
        <div className="flex-1" />
        <button
          onClick={save}
          disabled={!dirty || busy}
          className="text-[11px] bg-sai-blue text-white px-3 py-1.5 rounded font-semibold disabled:opacity-40 hover:opacity-90"
        >
          {busy ? "Saving…" : dirty ? "Save" : "Saved"}
        </button>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-6 space-y-4">
        {/* Chevron + action buttons */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="chevron-bar">
            {STAGES.map((s) => (
              <div key={s}
                   className={`chevron ${opp.stage === s ? "is-active" : ""}`}
                   onClick={() => setStage(s)}>
                {STAGE_LABEL[s]}
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <select
              value={selectedTemplateId ?? ""}
              onChange={(e) => setSelectedTemplateId(e.target.value ? Number(e.target.value) : null)}
              title="Template used when generating"
              className="text-[12px] border border-ui-border rounded px-2 py-2 outline-none focus:border-sai-blue bg-white"
            >
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}{t.is_default ? " (default)" : ""}
                </option>
              ))}
              {templates.length === 0 && <option value="">No templates</option>}
            </select>
            <button
              onClick={generate}
              disabled={busy || lines.length === 0 || templates.length === 0}
              title={
                lines.length === 0
                  ? "Add at least one line item first"
                  : templates.length === 0
                  ? "Create a template first"
                  : ""
              }
              className="text-[12px] bg-sai-navy text-white px-4 py-2 rounded font-semibold hover:opacity-90 disabled:opacity-40"
            >
              Generate .docx
            </button>
            <Link
              to={selectedTemplateId ? `/templates/${selectedTemplateId}` : "/templates"}
              className="text-[11px] border border-sai-blue text-sai-blue px-3 py-2 rounded font-semibold hover:bg-sai-bluepale"
              title="Edit the selected template"
            >
              Edit template
            </Link>
          </div>
        </div>

        {/* Smart stats */}
        <div className="bg-white border border-ui-border rounded-md px-4 py-3 flex gap-6 flex-wrap">
          <SmartStat label="Line Items" value={lines.length} />
          <SmartStat label="Deal Value" value={money(lineSubtotal)} />
          <SmartStat label="Total (incl VAT)" value={money(lineSubtotal * 1.15)} />
          <SmartStat label="Delivery" value={`${opp.delivery_weeks}w`} />
          <SmartStat label="Proposals" value={proposals.length} />
          <SmartStat label="Activities" value={activities.length} />
        </div>

        {/* Header fields */}
        <div className="bg-white border border-ui-border rounded-md p-6 grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-4">
          <Field label="Title">
            <input className="field-value" value={opp.title} onChange={(e) => updateHeader("title", e.target.value)} />
          </Field>
          <Field label="Client">
            <input className="field-value" readOnly value={opp.client?.name ?? ""} />
          </Field>
          <Field label="Site Location">
            <input className="field-value" readOnly value={opp.client?.site_location ?? ""} />
          </Field>
          <Field label="Delivery (weeks)">
            <input className="field-value" type="number" value={opp.delivery_weeks}
                   onChange={(e) => updateHeader("delivery_weeks", Number(e.target.value))} />
          </Field>
          <Field label="Priority">
            <div className="star-row">
              {[1, 2, 3].map((n) => (
                <span key={n}
                      onClick={() => updateHeader("priority", opp.priority === n ? 0 : n)}
                      className={`star cursor-pointer text-lg ${opp.priority >= n ? "is-on" : ""}`}>★</span>
              ))}
            </div>
          </Field>
          <Field label="Salesperson" help={<HelpPopover help={FIELD_HELP.salesperson} />}>
            {(() => {
              const current = opp.salesperson ?? "";
              const knownNames = new Set(salespeople.map((s) => s.name));
              const legacy = current && !knownNames.has(current) ? current : null;
              return (
                <select
                  className="field-value"
                  value={current}
                  onChange={(e) => updateHeader("salesperson", e.target.value)}
                >
                  <option value="">— Unassigned —</option>
                  {salespeople.map((s) => (
                    <option key={s.id} value={s.name}>
                      {s.name}{s.role ? ` · ${s.role}` : ""}
                    </option>
                  ))}
                  {legacy && (
                    <option value={legacy}>Other — {legacy}</option>
                  )}
                </select>
              );
            })()}
            {salespeople.length === 0 && (
              <div className="text-[10px] text-amber-600 mt-1">
                No salespeople yet — add the team on the <Link to="/hr" className="underline">HR app</Link>.
              </div>
            )}
          </Field>
          <Field label="Quotation valid until" help={<HelpPopover help={FIELD_HELP.valid_until} />}>
            <input
              type="date"
              className="field-value"
              value={opp.valid_until ?? ""}
              onChange={(e) => updateHeader("valid_until", e.target.value || null)}
            />
          </Field>
          <Field label="Deposit on signature (%)" help={<HelpPopover help={FIELD_HELP.deposit_pct} />}>
            <input
              type="number"
              min={0}
              max={100}
              step="1"
              className="field-value"
              value={opp.deposit_pct ?? 0}
              onChange={(e) => updateHeader("deposit_pct", Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
            />
          </Field>
          {opp.project_id && (
            <Field label="Construction Project">
              <Link
                to={`/projects/${opp.project_id}`}
                className="text-[12px] text-sai-blue hover:underline font-semibold"
              >
                Open project board →
              </Link>
            </Field>
          )}
          <div className="col-span-full">
            <div className="field-label">Internal Notes</div>
            <textarea className="field-value min-h-[60px] resize-y" value={opp.notes ?? ""}
                      onChange={(e) => updateHeader("notes", e.target.value)} />
          </div>
        </div>

        {/* Proposal status / send tracking */}
        {proposals.length > 0 && (
          <div className="bg-white border border-ui-border rounded-md p-4">
            <div className="flex items-center mb-2">
              <div className="text-[11px] uppercase tracking-wider font-semibold text-slate-500">
                Generated proposals
              </div>
            </div>
            <div className="space-y-2">
              {proposals.map((p) => {
                const next = PROPOSAL_STATUS_ORDER[
                  PROPOSAL_STATUS_ORDER.indexOf(p.status) + 1
                ];
                const nextLabels: Record<Proposal["status"], string> = {
                  draft: "Mark as Sent",
                  sent: "Mark as Viewed",
                  viewed: "Mark as Signed",
                  signed: "Mark as Paid",
                  paid: "",
                };
                const nextLabel = nextLabels[p.status];
                return (
                  <div key={p.id} className="flex items-center gap-3 border border-ui-border rounded px-3 py-2 text-[12px]">
                    <div className="font-mono text-slate-700">{p.ref}</div>
                    <StatusPill status={p.status} />
                    <div className="flex-1 text-slate-400 text-[11px]">
                      Generated {new Date(p.generated_at).toLocaleDateString()}
                      {p.status_updated_at && p.status !== "draft" && (
                        <span> · {p.status} {new Date(p.status_updated_at).toLocaleDateString()}</span>
                      )}
                    </div>
                    <a
                      href={api.proposals.downloadUrl(p.id)}
                      className="text-[11px] text-sai-blue hover:underline"
                    >
                      Download
                    </a>
                    {next && nextLabel && (
                      <button
                        onClick={() => advanceStatus(p, next)}
                        className="text-[10px] border border-sai-blue text-sai-blue px-2 py-1 rounded hover:bg-sai-bluepale font-semibold"
                      >
                        {nextLabel}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Line items */}
        <div className="bg-white border border-ui-border rounded-md p-4">
          <LineEditor lines={lines} catalogue={catalogue} onChange={onLinesChange} />
          {dirty && (
            <div className="mt-2 text-[11px] text-amber-600">
              Unsaved changes — click Save (top right) to persist.
            </div>
          )}
        </div>

        {/* Hero override + appendix uploads (v0.4.1) */}
        <OppHeroAndAssets opp={opp} onChanged={(fresh) => setOpp(fresh)} />

        {/* Per-section paste-back drafts (v0.4.1) */}
        <SectionDrafts
          opp={opp}
          template={templates.find((t) => t.id === selectedTemplateId) ?? null}
          onSaved={load}
        />

        {/* ChatGPT prompt builder */}
        <PromptBuilder opp={opp} lines={lines} subtotal={lineSubtotal} />

        {/* Chatter */}
        <div className="bg-white border border-ui-border rounded-md">
          <div className="px-4 py-2 border-b border-ui-border flex gap-4 text-[11px] font-semibold uppercase tracking-wider">
            {(["message", "note", "log"] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                      className={`py-1 border-b-2 ${tab === t ? "border-sai-blue text-sai-blue" : "border-transparent text-slate-400 hover:text-slate-600"}`}>
                {t === "message" ? "Send message" : t === "note" ? "Log note" : "Activity log"}
              </button>
            ))}
          </div>
          {tab !== "log" && (
            <div className="p-3 flex gap-2">
              <textarea value={newNote} onChange={(e) => setNewNote(e.target.value)}
                        placeholder={tab === "message" ? "Write a message..." : "Log an internal note..."}
                        className="flex-1 text-[13px] border border-ui-border rounded px-2 py-1.5 resize-y min-h-[60px] outline-none focus:border-sai-blue" />
              <button onClick={postActivity}
                      className="self-start bg-sai-blue text-white text-[11px] px-3 py-1.5 rounded font-semibold hover:opacity-90">
                Send
              </button>
            </div>
          )}
          <div className="px-4 py-3 space-y-3 max-h-[300px] overflow-y-auto scroll-thin">
            {activities.map(a => (
              <div key={a.id} className="flex gap-3">
                <div className={`h-8 w-8 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold text-white ${
                  a.kind === "log" ? "bg-slate-400" : a.kind === "message" ? "bg-sai-blue" : "bg-amber-500"
                }`}>
                  {a.author.slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1">
                  <div className="text-[12px] font-semibold text-sai-navy">
                    {a.author}
                    <span className="ml-2 text-[10px] uppercase tracking-wider text-slate-400 font-normal">{a.kind}</span>
                    <span className="ml-2 text-[10px] text-slate-400 font-normal">
                      {new Date(a.created_at).toLocaleString()}
                    </span>
                  </div>
                  <div className="text-[12px] text-slate-700 whitespace-pre-wrap">{a.body}</div>
                </div>
              </div>
            ))}
            {activities.length === 0 && (
              <div className="text-[12px] text-slate-400 italic">No activity yet.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children, help }: { label: string; children: React.ReactNode; help?: React.ReactNode }) {
  return (
    <div>
      <div className="field-label flex items-center">
        {label}
        {help}
      </div>
      {children}
    </div>
  );
}

function SmartStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{label}</div>
      <div className="text-[15px] font-display font-bold text-sai-navy">{value}</div>
    </div>
  );
}

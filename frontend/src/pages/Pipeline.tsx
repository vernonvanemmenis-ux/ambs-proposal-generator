import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, type Catalogue, type Client, type Opportunity, type OpportunityLineDraft, type OpportunityTemplate } from "../api";
import LineEditor from "../components/LineEditor";
import KanbanBoard, { type KanbanColumn } from "../components/KanbanBoard";

const STAGES: KanbanColumn[] = [
  { id: "new",       label: "New",            color: "#94a3b8" },
  { id: "qualified", label: "Qualified",      color: "#3b82f6" },
  { id: "proposal",  label: "Proposal Sent",  color: "#8b5cf6" },
  { id: "won",       label: "Won",            color: "#10b981" },
  { id: "lost",      label: "Lost",           color: "#ef4444" },
];

function money(v: number) {
  return "R " + v.toLocaleString("en-ZA", { maximumFractionDigits: 0 });
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]!.toUpperCase())
    .join("");
}

function isExpired(validUntil: string | null): boolean {
  if (!validUntil) return false;
  const d = new Date(validUntil);
  if (Number.isNaN(d.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d < today;
}

type OppCard = Opportunity & { columnId: string };

export default function Pipeline() {
  const [opps, setOpps] = useState<Opportunity[]>([]);
  const [creating, setCreating] = useState(false);
  const nav = useNavigate();

  useEffect(() => {
    api.opportunities.list().then(setOpps).catch(() => {});
  }, []);

  const columns = useMemo<KanbanColumn[]>(() => {
    return STAGES.map((s) => {
      const inCol = opps.filter((o) => o.stage === s.id);
      const total = inCol.reduce((a, b) => a + b.amount, 0);
      return { ...s, meta: `${inCol.length} · ${money(total)}` };
    });
  }, [opps]);

  const items = useMemo<OppCard[]>(
    () => opps.map((o) => ({ ...o, columnId: o.stage })),
    [opps]
  );

  const move = async (o: OppCard, newStage: string | number) => {
    const stage = String(newStage);
    if (o.stage === stage) return;
    setOpps((xs) => xs.map((x) => (x.id === o.id ? { ...x, stage } : x)));
    try {
      await api.opportunities.update(o.id, { stage });
      if (stage === "won") {
        const fresh = await api.opportunities.get(o.id);
        setOpps((xs) => xs.map((x) => (x.id === o.id ? fresh : x)));
      }
    } catch (e) {
      setOpps((xs) => xs.map((x) => (x.id === o.id ? { ...x, stage: o.stage } : x)));
      alert("Could not move card: " + (e as Error).message);
    }
  };

  const renderCard = (o: OppCard) => {
    const topPL = o.lines[0]?.product_line ?? "";
    const expired = isExpired(o.valid_until);
    return (
      <div className="kanban-card relative">
        {o.stage === "won" && <div className="ribbon">Won</div>}
        <div className="text-[13px] font-semibold text-sai-navy leading-tight pr-12">
          {o.title}
        </div>
        <div className="text-[11px] text-slate-500 mt-0.5">{o.client?.name}</div>
        <div className="text-[11px] text-slate-400">
          {o.lines.length} line item{o.lines.length === 1 ? "" : "s"}
          {topPL ? ` · ${topPL}` : ""}
        </div>
        <div className="mt-2 flex items-center justify-between">
          <div className="text-[12px] font-bold text-sai-blue">{money(o.amount)}</div>
          <div className="star-row">
            {[1, 2, 3].map((n) => (
              <span key={n} className={`star ${o.priority >= n ? "is-on" : ""}`}>★</span>
            ))}
          </div>
        </div>
        <div className="mt-2 flex items-center gap-1 flex-wrap">
          {expired && (
            <span className="text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-semibold">
              Expired
            </span>
          )}
          {o.salesperson && (
            <span
              title={`Salesperson: ${o.salesperson}`}
              className="text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-semibold"
            >
              {initialsOf(o.salesperson)}
            </span>
          )}
          {o.project_id && (
            <span
              title="Has a construction project"
              className="text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-semibold"
            >
              Project
            </span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-[calc(100vh-44px)]">
      <div className="bg-white border-b border-ui-border px-4 py-2 flex items-center gap-3">
        <Link to="/" className="text-[12px] text-slate-500 hover:text-sai-navy">← Apps</Link>
        <div className="text-slate-300">/</div>
        <div className="text-[13px] font-semibold text-sai-navy font-display">Proposals Pipeline</div>
        <div className="flex-1" />
        <Link
          to="/projects"
          className="text-[11px] border border-ui-border text-slate-600 px-3 py-1.5 rounded font-semibold hover:bg-slate-50"
        >
          View Projects →
        </Link>
        <button
          className="text-[11px] bg-sai-blue text-white px-3 py-1.5 rounded font-semibold hover:opacity-90"
          onClick={() => setCreating(true)}
        >
          + New Opportunity
        </button>
      </div>

      <div className="px-4 pt-2 text-[10px] text-slate-400 italic">
        Tip: drag cards between columns to change stage. Moving to <span className="font-semibold text-emerald-600">Won</span> auto-creates a construction project.
      </div>

      <KanbanBoard<OppCard>
        columns={columns}
        items={items}
        renderCard={renderCard}
        onMove={move}
        onCardClick={(o) => nav(`/proposals/${o.id}`)}
        emptyHint="No opportunities in this stage"
      />

      {creating && (
        <NewOpportunityDrawer
          onClose={() => setCreating(false)}
          onCreated={(o) => {
            setCreating(false);
            nav(`/proposals/${o.id}`);
          }}
        />
      )}
    </div>
  );
}

function NewOpportunityDrawer({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (opp: Opportunity) => void;
}) {
  const [clients, setClients] = useState<Client[]>([]);
  const [catalogue, setCatalogue] = useState<Catalogue | null>(null);
  const [oppTemplates, setOppTemplates] = useState<OpportunityTemplate[]>([]);
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [clientId, setClientId] = useState<number | "">("");
  const [newClient, setNewClient] = useState({
    name: "",
    industry: "",
    contact_person: "",
    email: "",
    phone: "",
    site_location: "",
  });
  const [header, setHeader] = useState({
    title: "",
    delivery_weeks: 6,
    priority: 0,
    notes: "",
    deposit_pct: 40,
  });
  const [lines, setLines] = useState<OpportunityLineDraft[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.clients.list().then((list) => {
      setClients(list);
      if (list.length) {
        setMode("existing");
        setClientId(list[0].id);
      } else {
        setMode("new");
      }
    });
    api.catalogue().then(setCatalogue);
    api.opportunityTemplates.list().then(setOppTemplates).catch(() => setOppTemplates([]));
  }, []);

  const applyTemplate = (tpl: OpportunityTemplate) => {
    setHeader((h) => ({
      ...h,
      title: tpl.title_hint || tpl.name,
      delivery_weeks: tpl.default_delivery_weeks,
      deposit_pct: tpl.default_deposit_pct,
    }));
    setLines(
      tpl.default_lines.map((ln, i) => ({
        sequence: i,
        item_code: ln.item_code,
        product_line: ln.product_line,
        structure_type: ln.structure_type,
        description: ln.description,
        quantity: ln.quantity,
        unit_of_measure: ln.unit_of_measure,
        unit_rate: ln.unit_rate,
        discount_pct: 0,
        is_optional: ln.is_optional,
        cost_rate: 0,
      }))
    );
  };

  const canSubmit =
    !!header.title.trim() &&
    ((mode === "existing" && clientId !== "") || (mode === "new" && !!newClient.name.trim()));

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    try {
      let targetId: number;
      if (mode === "new") {
        const created = await api.clients.create(newClient);
        targetId = created.id;
      } else {
        targetId = Number(clientId);
      }
      const created = await api.opportunities.create({
        title: header.title,
        client_id: targetId,
        stage: "new",
        delivery_weeks: header.delivery_weeks,
        priority: header.priority,
        notes: header.notes,
        deposit_pct: header.deposit_pct,
        lines: lines.map((ln, i) => ({ ...ln, sequence: i })),
      } as any);
      onCreated(created);
    } catch (e: any) {
      alert("Create failed: " + (e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex justify-end" onClick={onClose}>
      <div
        className="bg-white w-[780px] h-full shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-3 border-b border-ui-border flex items-center">
          <div className="text-[14px] font-display font-bold text-sai-navy">New Opportunity</div>
          <div className="flex-1" />
          <button onClick={onClose}
                  className="text-slate-400 hover:text-slate-700 text-lg leading-none px-1">×</button>
        </div>

        <div className="flex-1 overflow-y-auto scroll-thin px-5 py-4 space-y-4">
          {/* Quick-start templates */}
          {oppTemplates.length > 0 && (
            <div className="bg-sai-bluepale border border-sai-blue/30 rounded-md p-3">
              <div className="text-[11px] uppercase tracking-wider font-semibold text-sai-blue mb-2">
                ⚡ Quick start from a project template
              </div>
              <div className="flex flex-wrap gap-2">
                {oppTemplates.filter((t) => t.is_active).map((tpl) => (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => applyTemplate(tpl)}
                    title={tpl.description}
                    className="text-[11px] bg-white border border-sai-blue text-sai-blue px-3 py-1.5 rounded font-semibold hover:bg-sai-blue hover:text-white transition flex items-center gap-1.5"
                  >
                    <span>{tpl.icon}</span>
                    <span>{tpl.name}</span>
                  </button>
                ))}
              </div>
              <div className="text-[10px] text-slate-500 mt-2 italic">
                Picks pre-fill the title, delivery, deposit, and line items. You can still edit everything below.
              </div>
            </div>
          )}

          {/* Client */}
          <div>
            <div className="field-label mb-1">Client</div>
            <div className="flex gap-1 mb-2">
              <button
                onClick={() => setMode("existing")}
                disabled={clients.length === 0}
                className={`text-[11px] px-3 py-1 rounded border ${
                  mode === "existing"
                    ? "bg-sai-blue text-white border-sai-blue"
                    : "bg-white text-slate-600 border-ui-border hover:bg-slate-50"
                } disabled:opacity-40`}
              >
                Existing client
              </button>
              <button
                onClick={() => setMode("new")}
                className={`text-[11px] px-3 py-1 rounded border ${
                  mode === "new"
                    ? "bg-sai-blue text-white border-sai-blue"
                    : "bg-white text-slate-600 border-ui-border hover:bg-slate-50"
                }`}
              >
                + Create new client
              </button>
            </div>

            {mode === "existing" ? (
              <select
                value={clientId}
                onChange={(e) => setClientId(e.target.value ? Number(e.target.value) : "")}
                className="field-value w-full"
              >
                <option value="">— select a client —</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}{c.industry ? ` · ${c.industry}` : ""}
                  </option>
                ))}
              </select>
            ) : (
              <div className="space-y-2 bg-slate-50 border border-ui-border rounded p-3">
                <DField label="Name" value={newClient.name} onChange={(v) => setNewClient({ ...newClient, name: v })} />
                <DField label="Industry" value={newClient.industry} onChange={(v) => setNewClient({ ...newClient, industry: v })} />
                <DField label="Contact Person" value={newClient.contact_person} onChange={(v) => setNewClient({ ...newClient, contact_person: v })} />
                <DField label="Email" value={newClient.email} onChange={(v) => setNewClient({ ...newClient, email: v })} />
                <DField label="Phone" value={newClient.phone} onChange={(v) => setNewClient({ ...newClient, phone: v })} />
                <DField label="Site Location" value={newClient.site_location} onChange={(v) => setNewClient({ ...newClient, site_location: v })} />
              </div>
            )}
          </div>

          {/* Opportunity header */}
          <div className="pt-2 border-t border-ui-border space-y-3">
            <DField label="Opportunity Title" value={header.title} onChange={(v) => setHeader({ ...header, title: v })} />
            <div className="grid grid-cols-2 gap-3">
              <DNumField label="Delivery (weeks)" value={header.delivery_weeks}
                         onChange={(v) => setHeader({ ...header, delivery_weeks: v })} />
              <div>
                <div className="field-label">Priority</div>
                <div className="star-row">
                  {[1, 2, 3].map((n) => (
                    <span key={n}
                          onClick={() => setHeader({ ...header, priority: header.priority === n ? 0 : n })}
                          className={`star cursor-pointer text-lg ${header.priority >= n ? "is-on" : ""}`}>★</span>
                  ))}
                </div>
              </div>
            </div>
            <div>
              <div className="field-label">Internal Notes</div>
              <textarea
                className="field-value min-h-[60px] resize-y"
                value={header.notes}
                onChange={(e) => setHeader({ ...header, notes: e.target.value })}
              />
            </div>
          </div>

          {/* Line items */}
          <div className="pt-2 border-t border-ui-border">
            <LineEditor lines={lines} catalogue={catalogue} onChange={setLines} />
          </div>
        </div>

        <div className="px-5 py-3 border-t border-ui-border flex justify-end gap-2">
          <button onClick={onClose} className="text-[12px] px-3 py-1.5 text-slate-500 hover:text-slate-800">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!canSubmit || busy}
            className="text-[12px] bg-sai-blue text-white px-4 py-1.5 rounded font-semibold hover:opacity-90 disabled:opacity-40"
          >
            {busy ? "Creating…" : "Create & open"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <div className="field-label">{label}</div>
      <input className="field-value" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function DNumField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <div className="field-label">{label}</div>
      <input type="number" className="field-value" value={value}
             onChange={(e) => onChange(Number(e.target.value) || 0)} />
    </div>
  );
}

/**
 * Sales Order workspace.
 *
 * Header summary + lifecycle actions (Deliver / Cancel), invoices
 * table, and an inline "+ New invoice" form (defaults total to remaining
 * balance for regular / deposit % for down-payment). Each invoice card
 * expands to its payments list + "+ Record payment" form.
 */

import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  api,
  type Invoice,
  type InvoiceKind,
  type Opportunity,
  type Payment,
  type PaymentMethod,
  type SalesOrder,
} from "../api";


export default function SalesOrderForm() {
  const { id } = useParams<{ id: string }>();
  const soId = Number(id);
  const navigate = useNavigate();
  const [so, setSo] = useState<SalesOrder | null>(null);
  const [opp, setOpp] = useState<Opportunity | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const reload = async () => {
    if (!soId || Number.isNaN(soId)) return;
    setLoading(true);
    try {
      const fresh = await api.salesOrders.get(soId);
      setSo(fresh);
      if (fresh.opportunity_id) {
        try {
          const o = await api.opportunities.get(fresh.opportunity_id);
          setOpp(o);
        } catch { /* ignore */ }
      }
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { reload(); }, [soId]);

  const deliver = async () => {
    if (!so) return;
    if (!confirm(`Deliver ${so.ref}? Any reserved stock will be moved to the customer location.`)) return;
    setBusy(true);
    try { await api.salesOrders.deliver(so.id); await reload(); }
    catch (e: any) { alert("Deliver failed: " + (e?.message || e)); }
    finally { setBusy(false); }
  };

  const cancelSo = async () => {
    if (!so) return;
    if (!confirm(`Cancel ${so.ref}? Any reserved stock will be released.`)) return;
    setBusy(true);
    try { await api.salesOrders.cancel(so.id); await reload(); }
    catch (e: any) { alert("Cancel failed: " + (e?.message || e)); }
    finally { setBusy(false); }
  };

  if (loading) return <div className="px-4 py-8 text-[12px] text-slate-400 italic">Loading…</div>;
  if (!so) return (
    <div className="px-4 py-10 text-center">
      <div className="text-[14px] text-sai-navy font-display font-bold mb-2">Sales order not found</div>
      <Link to="/sales-orders" className="text-[12px] text-sai-blue hover:underline">Back to Sales Orders</Link>
    </div>
  );

  const stateBadgeClass: Record<string, string> = {
    confirmed: "bg-blue-100 text-blue-700",
    delivered: "bg-purple-100 text-purple-700",
    invoiced:  "bg-amber-100 text-amber-700",
    paid:      "bg-emerald-100 text-emerald-700",
    cancelled: "bg-red-100 text-red-700",
  };

  return (
    <div className="min-h-[calc(100vh-44px)]">
      <div className="bg-white border-b border-ui-border px-4 py-2 flex items-center gap-3">
        <Link to="/" className="text-[12px] text-slate-500 hover:text-sai-navy">← Apps</Link>
        <div className="text-slate-300">/</div>
        <Link to="/sales-orders" className="text-[12px] text-slate-500 hover:text-sai-navy">Sales Orders</Link>
        <div className="text-slate-300">/</div>
        <div className="text-[13px] font-semibold text-sai-navy font-display">{so.ref}</div>
        <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded font-semibold ${stateBadgeClass[so.state]}`}>{so.state}</span>
        <div className="flex-1" />
        {so.state === "confirmed" && (
          <button onClick={deliver} disabled={busy}
            className="text-[11px] border border-sai-blue text-sai-blue px-3 py-1 rounded font-semibold hover:bg-sai-bluepale disabled:opacity-40">
            Deliver
          </button>
        )}
        {so.state !== "paid" && so.state !== "cancelled" && (
          <button onClick={cancelSo} disabled={busy}
            className="text-[11px] text-red-600 hover:text-red-700 underline disabled:opacity-40">
            Cancel SO
          </button>
        )}
      </div>

      <div className="px-4 py-4 max-w-5xl mx-auto space-y-4">
        {/* Summary */}
        <div className="bg-white border border-ui-border rounded-md p-4 grid grid-cols-4 gap-3 text-[12px]">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Opportunity</div>
            {opp ? (
              <Link to={`/proposals/${opp.id}`} className="text-sai-blue hover:underline font-semibold">
                {opp.title}
              </Link>
            ) : (
              <div className="text-slate-400 italic">opp #{so.opportunity_id}</div>
            )}
            <div className="text-[10px] text-slate-500 mt-0.5">{opp?.client?.name ?? ""}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Total</div>
            <div className="text-[15px] font-display font-bold text-sai-blue tabular-nums">
              {so.currency} {so.total.toLocaleString("en-ZA", { maximumFractionDigits: 2 })}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Invoiced</div>
            <div className="text-[13px] font-semibold text-slate-700 tabular-nums">
              {so.invoiced_total.toLocaleString("en-ZA", { maximumFractionDigits: 2 })}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Paid</div>
            <div className={`text-[13px] font-semibold tabular-nums ${so.paid_total >= so.total ? "text-emerald-600" : "text-slate-700"}`}>
              {so.paid_total.toLocaleString("en-ZA", { maximumFractionDigits: 2 })}
            </div>
            {so.deposit_pct > 0 && (
              <div className="text-[10px] text-slate-400 mt-0.5">Deposit: {so.deposit_pct}%</div>
            )}
          </div>
        </div>

        {/* Invoices */}
        <div className="bg-white border border-ui-border rounded-md">
          <div className="px-4 py-2.5 border-b border-ui-border flex items-center">
            <div className="text-[13px] font-semibold text-sai-navy">Invoices</div>
            <div className="text-[11px] text-slate-500 ml-2">{so.invoices.length} issued</div>
            <div className="flex-1" />
            {so.state !== "cancelled" && (
              <NewInvoiceForm
                so={so}
                onCreated={reload}
                disabled={busy}
              />
            )}
          </div>
          <div className="divide-y divide-ui-border">
            {so.invoices.length === 0 ? (
              <div className="px-4 py-6 text-center text-[12px] text-slate-400 italic">
                No invoices yet. Use the form above to issue a {so.deposit_pct > 0 ? "down-payment" : "regular"} invoice.
              </div>
            ) : (
              so.invoices.map((inv) => (
                <InvoiceRow key={inv.id} invoice={inv} onChange={reload} />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}


function NewInvoiceForm({ so, onCreated, disabled }: {
  so: SalesOrder;
  onCreated: () => void | Promise<void>;
  disabled?: boolean;
}) {
  // Suggested defaults: down-payment if SO has deposit_pct AND no DP issued yet.
  const hasDpIssued = so.invoices.some((i) => i.kind === "down_payment" && i.state !== "cancelled");
  const defaultKind: InvoiceKind = so.deposit_pct > 0 && !hasDpIssued ? "down_payment" : "regular";

  const [kind, setKind] = useState<InvoiceKind>(defaultKind);
  const [total, setTotal] = useState<number>(0);
  const [dueDate, setDueDate] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await api.invoices.create({
        sales_order_id: so.id,
        kind,
        total: total > 0 ? total : 0,
        due_date: dueDate || null,
      });
      setTotal(0);
      setDueDate("");
      await onCreated();
    } catch (e: any) {
      alert("Create invoice failed: " + (e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-2 text-[11px]">
      <select value={kind} onChange={(e) => setKind(e.target.value as InvoiceKind)}
        className="border border-ui-border rounded px-1.5 py-0.5">
        <option value="regular">Regular</option>
        <option value="down_payment">Down payment</option>
      </select>
      <input type="number" min={0} step={0.01} placeholder="auto" value={total || ""} onChange={(e) => setTotal(Number(e.target.value) || 0)}
        className="w-24 border border-ui-border rounded px-1.5 py-0.5 text-right" />
      <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}
        className="border border-ui-border rounded px-1.5 py-0.5" />
      <button onClick={submit} disabled={disabled || busy}
        className="bg-sai-blue text-white px-3 py-0.5 rounded font-semibold hover:opacity-90 disabled:opacity-40">
        {busy ? "Adding…" : "+ Invoice"}
      </button>
    </div>
  );
}


function InvoiceRow({ invoice, onChange }: { invoice: Invoice; onChange: () => void | Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const stateBadge: Record<string, string> = {
    draft: "bg-slate-200 text-slate-700",
    sent:  "bg-blue-100 text-blue-700",
    paid:  "bg-emerald-100 text-emerald-700",
    cancelled: "bg-red-100 text-red-700",
  };

  const send = async () => {
    setBusy(true);
    try { await api.invoices.send(invoice.id); await onChange(); }
    catch (e: any) { alert("Send failed: " + (e?.message || e)); }
    finally { setBusy(false); }
  };
  const cancel = async () => {
    if (!confirm(`Cancel ${invoice.ref}?`)) return;
    setBusy(true);
    try { await api.invoices.cancel(invoice.id); await onChange(); }
    catch (e: any) { alert("Cancel failed: " + (e?.message || e)); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    if (!confirm(`Delete ${invoice.ref}? Only allowed for draft/cancelled invoices.`)) return;
    setBusy(true);
    try { await api.invoices.delete(invoice.id); await onChange(); }
    catch (e: any) { alert("Delete failed: " + (e?.message || e)); }
    finally { setBusy(false); }
  };

  return (
    <div>
      <div className="px-4 py-2 flex items-center gap-3 cursor-pointer hover:bg-slate-50" onClick={() => setOpen((v) => !v)}>
        <span className="text-[11px] font-mono text-slate-500">{invoice.ref}</span>
        <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded font-semibold ${stateBadge[invoice.state]}`}>{invoice.state}</span>
        <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{invoice.kind.replace("_", " ")}</span>
        <div className="flex-1" />
        <div className="text-[12px] text-slate-600 tabular-nums">
          {invoice.currency} {invoice.total.toLocaleString("en-ZA", { maximumFractionDigits: 2 })}
        </div>
        <div className="text-[11px] text-slate-400">
          paid <span className="tabular-nums font-semibold text-slate-700">{invoice.paid_total.toLocaleString("en-ZA", { maximumFractionDigits: 2 })}</span>
        </div>
        {invoice.outstanding > 0 && (
          <div className="text-[11px] text-amber-600 tabular-nums">
            outstanding {invoice.outstanding.toLocaleString("en-ZA", { maximumFractionDigits: 2 })}
          </div>
        )}
        <span className="text-[10px] text-slate-400">{open ? "▼" : "▶"}</span>
      </div>
      {open && (
        <div className="px-4 py-3 border-t border-ui-border bg-slate-50 space-y-3">
          <div className="flex items-center gap-2 text-[11px]">
            {invoice.state === "draft" && (
              <button onClick={send} disabled={busy}
                className="border border-sai-blue text-sai-blue px-2 py-0.5 rounded font-semibold hover:bg-sai-bluepale disabled:opacity-40">
                Mark sent
              </button>
            )}
            {invoice.state !== "paid" && invoice.state !== "cancelled" && (
              <button onClick={cancel} disabled={busy}
                className="text-red-600 hover:text-red-700 underline disabled:opacity-40">
                Cancel invoice
              </button>
            )}
            {(invoice.state === "draft" || invoice.state === "cancelled") && (
              <button onClick={remove} disabled={busy}
                className="text-slate-500 hover:text-red-600 underline disabled:opacity-40">
                Delete
              </button>
            )}
            <div className="flex-1" />
            {invoice.due_date && <span className="text-slate-500">Due {invoice.due_date}</span>}
          </div>

          <div className="bg-white border border-ui-border rounded p-2">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1">Payments</div>
            {invoice.payments.length === 0 ? (
              <div className="text-[11px] text-slate-400 italic">No payments recorded yet.</div>
            ) : (
              <ul className="divide-y divide-ui-border text-[11px]">
                {invoice.payments.map((p) => (
                  <PaymentRow key={p.id} invoiceId={invoice.id} payment={p} onChange={onChange} />
                ))}
              </ul>
            )}
            {invoice.state !== "cancelled" && (
              <RecordPaymentForm invoiceId={invoice.id} suggested={invoice.outstanding} onCreated={onChange} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}


function PaymentRow({ invoiceId, payment, onChange }: {
  invoiceId: number;
  payment: Payment;
  onChange: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const del = async () => {
    if (!confirm(`Delete payment of ${payment.amount}?`)) return;
    setBusy(true);
    try { await api.invoices.deletePayment(invoiceId, payment.id); await onChange(); }
    catch (e: any) { alert("Delete failed: " + (e?.message || e)); }
    finally { setBusy(false); }
  };
  return (
    <li className="py-1 flex items-center gap-2">
      <span className="text-slate-500">{new Date(payment.received_at).toLocaleDateString("en-ZA")}</span>
      <span className="uppercase font-semibold text-slate-700">{payment.method}</span>
      {payment.reference && <span className="text-slate-500">{payment.reference}</span>}
      <div className="flex-1" />
      <span className="tabular-nums font-semibold text-sai-blue">{payment.amount.toLocaleString("en-ZA", { maximumFractionDigits: 2 })}</span>
      <button onClick={del} disabled={busy} className="text-slate-400 hover:text-red-600 text-[12px]">×</button>
    </li>
  );
}


function RecordPaymentForm({ invoiceId, suggested, onCreated }: {
  invoiceId: number;
  suggested: number;
  onCreated: () => void | Promise<void>;
}) {
  const [amount, setAmount] = useState<number>(suggested);
  const [method, setMethod] = useState<PaymentMethod>("eft");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { setAmount(suggested); }, [suggested]);

  const submit = async () => {
    if (amount <= 0) return;
    setBusy(true);
    try {
      await api.invoices.addPayment(invoiceId, { amount, method, reference });
      setReference("");
      await onCreated();
    } catch (e: any) {
      alert("Record payment failed: " + (e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-2 flex items-center gap-2 text-[11px]">
      <input type="number" min={0} step={0.01} value={amount} onChange={(e) => setAmount(Number(e.target.value) || 0)}
        className="w-24 border border-ui-border rounded px-1.5 py-0.5 text-right" />
      <select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}
        className="border border-ui-border rounded px-1.5 py-0.5">
        <option value="eft">EFT</option>
        <option value="cash">Cash</option>
        <option value="card">Card</option>
        <option value="other">Other</option>
      </select>
      <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Reference (optional)"
        className="flex-1 border border-ui-border rounded px-1.5 py-0.5" />
      <button onClick={submit} disabled={busy || amount <= 0}
        className="bg-sai-blue text-white px-3 py-0.5 rounded font-semibold hover:opacity-90 disabled:opacity-40">
        {busy ? "Saving…" : "+ Record payment"}
      </button>
    </div>
  );
}

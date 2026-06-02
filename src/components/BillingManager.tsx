"use client";

import { useEffect, useMemo, useState } from "react";

type Billing = {
  id: string;
  client_id: string;
  billed_on: string;
  period_start: string | null;
  period_end: string | null;
  amount: number;
  status: string;
  paid_on: string | null;
  method: string | null;
  invoice_ref: string | null;
  note: string | null;
  created_at: string;
};

type ClientBilling = {
  id: string;
  name: string;
  is_live: boolean | null;
  mrr: number | null;
  billing_type: string | null;
  date_signed: string | null;
  contract_end_date: string | null;
  next_billing_date: string | null;
  next_billing_status: "upcoming" | "due_soon" | "overdue" | null;
  last_billing: Billing | null;
  billings: Billing[];
};

type Totals = {
  active_mrr: number;
  billed_this_month: number;
  overdue_total: number;
  open_total: number;
};

const NEXT_STATUS_STYLE: Record<string, { label: string; color: string; bg: string }> = {
  upcoming: { label: "Upcoming", color: "#60a5fa", bg: "rgba(96,165,250,0.12)" },
  due_soon: { label: "Due soon", color: "#f59e0b", bg: "rgba(245,158,11,0.12)" },
  overdue: { label: "Overdue", color: "#ef4444", bg: "rgba(239,68,68,0.12)" },
};

const BILLING_STATUS_STYLE: Record<string, { color: string; bg: string }> = {
  paid: { color: "#22c55e", bg: "rgba(34,197,94,0.12)" },
  pending: { color: "#f59e0b", bg: "rgba(245,158,11,0.12)" },
  overdue: { color: "#ef4444", bg: "rgba(239,68,68,0.12)" },
  failed: { color: "#ef4444", bg: "rgba(239,68,68,0.12)" },
  refunded: { color: "#94a3b8", bg: "rgba(148,163,184,0.12)" },
};

function money(n: number | null | undefined): string {
  if (typeof n !== "number" || Number.isNaN(n)) return "—";
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

function fieldStyle() {
  return { background: "#0f2040", border: "1px solid rgba(255,255,255,0.12)", color: "#e2e8f0" } as const;
}

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-xl p-5 flex-1 min-w-[160px]" style={{ background: "#0a1628", border: "1px solid rgba(255,255,255,0.06)" }}>
      <p className="text-xs uppercase tracking-wider mb-1" style={{ color: "#475569" }}>{label}</p>
      <p className="text-2xl font-bold" style={{ color }}>{value}</p>
    </div>
  );
}

function NextStatusBadge({ status }: { status: ClientBilling["next_billing_status"] }) {
  if (!status) return <span className="text-xs" style={{ color: "#334155" }}>—</span>;
  const s = NEXT_STATUS_STYLE[status];
  return (
    <span className="px-2.5 py-1 rounded-full text-xs font-semibold" style={{ color: s.color, background: s.bg }}>
      {s.label}
    </span>
  );
}

export default function BillingManager() {
  const [clients, setClients] = useState<ClientBilling[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/billings");
    const d = await res.json();
    setClients(d.clients ?? []);
    setTotals(d.totals ?? null);
    setLoading(false);
  }

  useEffect(() => {
    fetch("/api/billings")
      .then(r => r.json())
      .then(d => { setClients(d.clients ?? []); setTotals(d.totals ?? null); setLoading(false); });
  }, []);

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function updateClientField(clientId: string, field: string, value: string) {
    setBusy(clientId);
    await fetch(`/api/clients/${clientId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
    await load();
    setBusy(null);
  }

  async function markPaid(billingId: string) {
    setBusy(billingId);
    await fetch(`/api/billings/${billingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "paid" }),
    });
    await load();
    setBusy(null);
  }

  async function deleteBilling(billingId: string) {
    setBusy(billingId);
    await fetch(`/api/billings/${billingId}`, { method: "DELETE" });
    await load();
    setBusy(null);
  }

  const sorted = useMemo(() => {
    const rank = (s: ClientBilling["next_billing_status"]) =>
      s === "overdue" ? 0 : s === "due_soon" ? 1 : s === "upcoming" ? 2 : 3;
    return [...clients].sort((a, b) => {
      const r = rank(a.next_billing_status) - rank(b.next_billing_status);
      if (r !== 0) return r;
      return a.name.localeCompare(b.name);
    });
  }, [clients]);

  if (loading) return <p className="text-sm py-8 text-center" style={{ color: "#334155" }}>Loading…</p>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold" style={{ color: "#e2e8f0" }}>Client Billing</h2>
        <p className="text-sm mt-0.5" style={{ color: "#475569" }}>
          Billing dates, next-due status, and the full history of billings made for each client.
        </p>
      </div>

      <div className="flex gap-4 flex-wrap">
        <StatCard label="Active MRR" value={money(totals?.active_mrr ?? 0)} color="#22c55e" />
        <StatCard label="Billed this month" value={money(totals?.billed_this_month ?? 0)} color="#e2e8f0" />
        <StatCard label="Overdue" value={money(totals?.overdue_total ?? 0)} color="#ef4444" />
        <StatCard label="Open (unpaid)" value={money(totals?.open_total ?? 0)} color="#f59e0b" />
      </div>

      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: "#0a1628" }}>
              {["Client", "Monthly", "Billing Type", "Date Signed", "Next Billing", "Status", ""].map((h, i) => (
                <th key={i} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: "#334155" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-sm" style={{ color: "#334155" }}>No clients yet.</td></tr>
            ) : sorted.map((c, i) => (
              <BillingRow
                key={c.id}
                client={c}
                striped={i % 2 === 0}
                expanded={expanded.has(c.id)}
                busy={busy}
                onToggle={() => toggleExpand(c.id)}
                onUpdateField={updateClientField}
                onRecorded={load}
                onMarkPaid={markPaid}
                onDelete={deleteBilling}
              />
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs" style={{ color: "#334155" }}>
        Next billing date is computed from the billing type and date signed plus the latest recorded billing. PIF (paid in full) clients have no recurring next date.
      </p>
    </div>
  );
}

function BillingRow({
  client, striped, expanded, busy, onToggle, onUpdateField, onRecorded, onMarkPaid, onDelete,
}: {
  client: ClientBilling;
  striped: boolean;
  expanded: boolean;
  busy: string | null;
  onToggle: () => void;
  onUpdateField: (clientId: string, field: string, value: string) => void;
  onRecorded: () => void;
  onMarkPaid: (billingId: string) => void;
  onDelete: (billingId: string) => void;
}) {
  const rowBg = striped ? "#080f1e" : "#060d1a";

  return (
    <>
      <tr style={{ background: rowBg, borderTop: "1px solid rgba(255,255,255,0.04)" }}>
        <td className="px-4 py-3">
          <button onClick={onToggle} className="flex items-center gap-2 text-left">
            <span className="text-xs" style={{ color: "#475569" }}>{expanded ? "▾" : "▸"}</span>
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: client.is_live ? "#22c55e" : "#475569" }} />
            <span className="font-medium" style={{ color: "#e2e8f0" }}>{client.name}</span>
          </button>
        </td>
        <td className="px-4 py-3" style={{ color: "#e2e8f0" }}>{money(client.mrr)}</td>
        <td className="px-4 py-3">
          <select
            value={client.billing_type ?? ""}
            onChange={e => onUpdateField(client.id, "billing_type", e.target.value)}
            disabled={busy === client.id}
            className="px-2 py-1 rounded-lg text-xs outline-none cursor-pointer"
            style={fieldStyle()}
          >
            <option value="">—</option>
            <option value="monthly">Monthly</option>
            <option value="pif">PIF</option>
            <option value="pif_monthly">PIF + Monthly</option>
          </select>
        </td>
        <td className="px-4 py-3">
          <input
            type="date"
            value={client.date_signed ?? ""}
            onChange={e => onUpdateField(client.id, "date_signed", e.target.value)}
            disabled={busy === client.id}
            className="px-2 py-1 rounded-lg text-xs outline-none"
            style={fieldStyle()}
          />
        </td>
        <td className="px-4 py-3" style={{ color: "#cbd5e1" }}>{client.next_billing_date ?? "—"}</td>
        <td className="px-4 py-3"><NextStatusBadge status={client.next_billing_status} /></td>
        <td className="px-4 py-3 text-right">
          <button onClick={onToggle} className="text-xs font-semibold" style={{ color: "#f59e0b" }}>
            {expanded ? "Hide" : "History"}
          </button>
        </td>
      </tr>

      {expanded && (
        <tr style={{ background: "#040a14" }}>
          <td colSpan={7} className="px-4 py-4">
            <LedgerPanel
              client={client}
              busy={busy}
              onRecorded={onRecorded}
              onMarkPaid={onMarkPaid}
              onDelete={onDelete}
            />
          </td>
        </tr>
      )}
    </>
  );
}

function LedgerPanel({
  client, busy, onRecorded, onMarkPaid, onDelete,
}: {
  client: ClientBilling;
  busy: string | null;
  onRecorded: () => void;
  onMarkPaid: (billingId: string) => void;
  onDelete: (billingId: string) => void;
}) {
  const [billedOn, setBilledOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState(client.mrr != null ? String(client.mrr) : "");
  const [method, setMethod] = useState("");
  const [saving, setSaving] = useState(false);

  async function record() {
    if (!billedOn || amount === "" || Number.isNaN(Number(amount))) return;
    setSaving(true);
    await fetch("/api/billings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: client.id,
        billed_on: billedOn,
        amount: Number(amount),
        method: method || undefined,
      }),
    });
    setMethod("");
    setSaving(false);
    onRecorded();
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2 rounded-lg p-3" style={{ background: "#0a1628", border: "1px solid rgba(255,255,255,0.06)" }}>
        <div>
          <label className="block text-[10px] uppercase tracking-wider mb-1" style={{ color: "#475569" }}>Billed on</label>
          <input type="date" value={billedOn} onChange={e => setBilledOn(e.target.value)} className="px-2 py-1 rounded-lg text-xs outline-none" style={fieldStyle()} />
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wider mb-1" style={{ color: "#475569" }}>Amount</label>
          <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" className="px-2 py-1 rounded-lg text-xs outline-none w-28" style={fieldStyle()} />
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wider mb-1" style={{ color: "#475569" }}>Method</label>
          <select value={method} onChange={e => setMethod(e.target.value)} className="px-2 py-1 rounded-lg text-xs outline-none cursor-pointer" style={fieldStyle()}>
            <option value="">—</option>
            <option value="card">Card</option>
            <option value="ach">ACH</option>
            <option value="wire">Wire</option>
            <option value="stripe">Stripe</option>
            <option value="manual">Manual</option>
          </select>
        </div>
        <button
          onClick={record}
          disabled={saving || amount === ""}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold"
          style={{ background: "#f59e0b", color: "#fff", opacity: saving || amount === "" ? 0.5 : 1 }}
        >
          {saving ? "Recording…" : "Record billing"}
        </button>
      </div>

      {client.billings.length === 0 ? (
        <p className="text-xs px-1" style={{ color: "#334155" }}>No billings recorded yet for this client.</p>
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr>
              {["Billed", "Amount", "Status", "Method", "Paid", ""].map((h, i) => (
                <th key={i} className="text-left px-2 py-1.5 uppercase tracking-wider" style={{ color: "#334155" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {client.billings.map(b => {
              const s = BILLING_STATUS_STYLE[b.status] ?? BILLING_STATUS_STYLE.pending;
              return (
                <tr key={b.id} style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                  <td className="px-2 py-2" style={{ color: "#cbd5e1" }}>{b.billed_on}</td>
                  <td className="px-2 py-2" style={{ color: "#e2e8f0" }}>{money(b.amount)}</td>
                  <td className="px-2 py-2">
                    <span className="px-2 py-0.5 rounded-full font-semibold" style={{ color: s.color, background: s.bg }}>{b.status}</span>
                  </td>
                  <td className="px-2 py-2" style={{ color: "#94a3b8" }}>{b.method ?? "—"}</td>
                  <td className="px-2 py-2" style={{ color: "#94a3b8" }}>{b.paid_on ?? "—"}</td>
                  <td className="px-2 py-2 text-right whitespace-nowrap">
                    {b.status !== "paid" && (
                      <button onClick={() => onMarkPaid(b.id)} disabled={busy === b.id} className="text-xs font-semibold mr-3" style={{ color: "#22c55e" }}>
                        Mark paid
                      </button>
                    )}
                    <button onClick={() => onDelete(b.id)} disabled={busy === b.id} className="text-xs" style={{ color: "#475569" }}>
                      Remove
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

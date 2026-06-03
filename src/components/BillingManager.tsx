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
  launch_date: string | null;
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

const OPEN_STATUSES = new Set(["pending", "overdue", "failed"]);

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

function daysFromToday(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const d = new Date(`${dateStr}T00:00:00`);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - now.getTime()) / 86_400_000);
}

function relativeLabel(dateStr: string | null): string {
  const days = daysFromToday(dateStr);
  if (days === null) return "—";
  if (days === 0) return "today";
  if (days > 0) return `in ${days} day${days === 1 ? "" : "s"}`;
  return `${-days} day${days === -1 ? "" : "s"} ago`;
}

function fieldStyle() {
  return { background: "#0f2040", border: "1px solid rgba(255,255,255,0.12)", color: "#e2e8f0" } as const;
}

// A derived worklist row: either a forecasted (not-yet-billed) cycle, or a recorded billing.
type ForecastRow = { kind: "forecast"; client: ClientBilling; date: string | null; status: string; amount: number | null };
type RecordedRow = { kind: "recorded"; client: ClientBilling; billing: Billing };
type WorkRow = ForecastRow | RecordedRow;

export default function BillingManager() {
  const [clients, setClients] = useState<ClientBilling[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [showSetup, setShowSetup] = useState(true);

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

  async function patchBilling(id: string, body: Record<string, unknown>) {
    setBusy(id);
    await fetch(`/api/billings/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    await load();
    setBusy(null);
  }

  async function deleteBilling(id: string) {
    setBusy(id);
    await fetch(`/api/billings/${id}`, { method: "DELETE" });
    await load();
    setBusy(null);
  }

  async function recordBilling(client: ClientBilling, opts: { amount: number; billedOn: string; method?: string; markPaid?: boolean }) {
    const key = `rec-${client.id}`;
    setBusy(key);
    await fetch("/api/billings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: client.id,
        billed_on: opts.billedOn,
        amount: opts.amount,
        method: opts.method || undefined,
        status: opts.markPaid ? "paid" : "pending",
        paid_on: opts.markPaid ? opts.billedOn : undefined,
      }),
    });
    await load();
    setBusy(null);
  }

  async function updateClientField(clientId: string, field: string, value: string) {
    setBusy(`cfg-${clientId}`);
    await fetch(`/api/clients/${clientId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
    await load();
    setBusy(null);
  }

  // Split everything into the three disposition buckets.
  const { pastDue, upcoming, paid } = useMemo(() => {
    const pastDue: WorkRow[] = [];
    const upcoming: WorkRow[] = [];
    const paid: RecordedRow[] = [];

    for (const c of clients) {
      const openRows = c.billings.filter(b => OPEN_STATUSES.has(b.status));

      // Recorded billings: route by paid vs open, and open by past-due vs upcoming.
      for (const b of c.billings) {
        if (b.status === "paid" || b.status === "refunded") {
          paid.push({ kind: "recorded", client: c, billing: b });
        } else {
          const d = daysFromToday(b.billed_on);
          const isPastDue = b.status === "overdue" || b.status === "failed" || (d !== null && d < 0);
          (isPastDue ? pastDue : upcoming).push({ kind: "recorded", client: c, billing: b });
        }
      }

      // Forecast: active (live) clients only, and only when nothing is
      // outstanding (otherwise collect that first).
      if (c.is_live && openRows.length === 0 && c.next_billing_date && c.next_billing_status) {
        const row: ForecastRow = {
          kind: "forecast",
          client: c,
          date: c.next_billing_date,
          status: c.next_billing_status,
          amount: c.mrr,
        };
        (c.next_billing_status === "overdue" ? pastDue : upcoming).push(row);
      }
    }

    const key = (r: WorkRow) => (r.kind === "forecast" ? r.date : r.billing.billed_on) ?? "";
    pastDue.sort((a, b) => key(a).localeCompare(key(b)));   // oldest due first
    upcoming.sort((a, b) => key(a).localeCompare(key(b)));  // soonest first
    paid.sort((a, b) => (b.billing.paid_on ?? b.billing.billed_on).localeCompare(a.billing.paid_on ?? a.billing.billed_on));

    return { pastDue, upcoming, paid };
  }, [clients]);

  if (loading) return <p className="text-sm py-8 text-center" style={{ color: "#334155" }}>Loading…</p>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold" style={{ color: "#e2e8f0" }}>Client Billing</h2>
        <p className="text-sm mt-0.5" style={{ color: "#475569" }}>
          Every active client is projected onto a monthly billing day anchored to their launch date. Collect what is past due, bill what is coming up, and keep the paid history. Set per-client type or amount in Billing setup below.
        </p>
      </div>

      <div className="flex gap-4 flex-wrap">
        <StatCard label="Active MRR" value={money(totals?.active_mrr ?? 0)} color="#22c55e" />
        <StatCard label="Billed this month" value={money(totals?.billed_this_month ?? 0)} color="#e2e8f0" />
        <StatCard label="Past due" value={money(totals?.overdue_total ?? 0)} color="#ef4444" />
        <StatCard label="Open (unpaid)" value={money(totals?.open_total ?? 0)} color="#f59e0b" />
      </div>

      <WorklistSection
        title="Past Due"
        accent="#ef4444"
        emptyText="Nothing past due. Nice."
        rows={pastDue}
        busy={busy}
        onPatch={patchBilling}
        onDelete={deleteBilling}
        onRecord={recordBilling}
      />

      <WorklistSection
        title="Upcoming"
        accent="#f59e0b"
        emptyText="No upcoming billings on the schedule."
        rows={upcoming}
        busy={busy}
        onPatch={patchBilling}
        onDelete={deleteBilling}
        onRecord={recordBilling}
      />

      <PaidSection rows={paid} busy={busy} onPatch={patchBilling} onDelete={deleteBilling} />

      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
        <button
          onClick={() => setShowSetup(s => !s)}
          className="w-full flex items-center justify-between px-4 py-3 text-left"
          style={{ background: "#0a1628", color: "#cbd5e1" }}
        >
          <span className="text-sm font-semibold">Active clients — billing schedule (anchored to launch date)</span>
          <span className="text-xs" style={{ color: "#475569" }}>{showSetup ? "Hide" : "Show"}</span>
        </button>
        {showSetup && <SetupTable clients={clients} busy={busy} onUpdate={updateClientField} />}
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-xl p-5 flex-1 min-w-[160px]" style={{ background: "#0a1628", border: "1px solid rgba(255,255,255,0.06)" }}>
      <p className="text-xs uppercase tracking-wider mb-1" style={{ color: "#475569" }}>{label}</p>
      <p className="text-2xl font-bold" style={{ color }}>{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const s = BILLING_STATUS_STYLE[status] ?? BILLING_STATUS_STYLE.pending;
  return <span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={{ color: s.color, background: s.bg }}>{status}</span>;
}

function WorklistSection({
  title, accent, emptyText, rows, busy, onPatch, onDelete, onRecord,
}: {
  title: string;
  accent: string;
  emptyText: string;
  rows: WorkRow[];
  busy: string | null;
  onPatch: (id: string, body: Record<string, unknown>) => void;
  onDelete: (id: string) => void;
  onRecord: (client: ClientBilling, opts: { amount: number; billedOn: string; method?: string; markPaid?: boolean }) => void;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className="w-2.5 h-2.5 rounded-full" style={{ background: accent }} />
        <h3 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "#cbd5e1" }}>{title}</h3>
        <span className="text-xs" style={{ color: "#475569" }}>({rows.length})</span>
      </div>
      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: "#0a1628" }}>
              {["Client", "Amount", "Due", "When", "State", "Action"].map((h, i) => (
                <th key={i} className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider" style={{ color: "#334155" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-xs" style={{ color: "#334155" }}>{emptyText}</td></tr>
            ) : rows.map((r, i) => (
              <WorkRowView key={r.kind === "forecast" ? `f-${r.client.id}` : r.billing.id} row={r} striped={i % 2 === 0} busy={busy} onPatch={onPatch} onDelete={onDelete} onRecord={onRecord} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function WorkRowView({
  row, striped, busy, onPatch, onDelete, onRecord,
}: {
  row: WorkRow;
  striped: boolean;
  busy: string | null;
  onPatch: (id: string, body: Record<string, unknown>) => void;
  onDelete: (id: string) => void;
  onRecord: (client: ClientBilling, opts: { amount: number; billedOn: string; method?: string; markPaid?: boolean }) => void;
}) {
  const rowBg = striped ? "#080f1e" : "#060d1a";
  const date = row.kind === "forecast" ? row.date : row.billing.billed_on;
  const amount = row.kind === "forecast" ? row.amount : row.billing.amount;

  return (
    <tr style={{ background: rowBg, borderTop: "1px solid rgba(255,255,255,0.04)" }}>
      <td className="px-4 py-3">
        <span className="font-medium" style={{ color: "#e2e8f0" }}>{row.client.name}</span>
      </td>
      <td className="px-4 py-3" style={{ color: "#e2e8f0" }}>{money(amount)}</td>
      <td className="px-4 py-3" style={{ color: "#cbd5e1" }}>{date ?? "—"}</td>
      <td className="px-4 py-3 text-xs" style={{ color: "#94a3b8" }}>{relativeLabel(date)}</td>
      <td className="px-4 py-3">
        {row.kind === "forecast"
          ? <span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={{ color: "#60a5fa", background: "rgba(96,165,250,0.12)" }}>scheduled</span>
          : <StatusBadge status={row.billing.status} />}
      </td>
      <td className="px-4 py-3 text-right whitespace-nowrap">
        {row.kind === "forecast"
          ? <ForecastActions row={row} busy={busy} onRecord={onRecord} />
          : <RecordedActions billing={row.billing} busy={busy} onPatch={onPatch} onDelete={onDelete} />}
      </td>
    </tr>
  );
}

function ForecastActions({
  row, busy, onRecord,
}: {
  row: ForecastRow;
  busy: string | null;
  onRecord: (client: ClientBilling, opts: { amount: number; billedOn: string; method?: string; markPaid?: boolean }) => void;
}) {
  const key = `rec-${row.client.id}`;
  const billedOn = row.date ?? new Date().toISOString().slice(0, 10);
  const amount = row.amount ?? 0;
  const disabled = busy === key || amount <= 0;
  return (
    <span className="inline-flex gap-3 items-center">
      <button onClick={() => onRecord(row.client, { amount, billedOn })} disabled={disabled} className="text-xs font-semibold" style={{ color: "#f59e0b", opacity: disabled ? 0.5 : 1 }}>
        Bill now
      </button>
      <button onClick={() => onRecord(row.client, { amount, billedOn, markPaid: true })} disabled={disabled} className="text-xs font-semibold" style={{ color: "#22c55e", opacity: disabled ? 0.5 : 1 }}>
        Bill + paid
      </button>
    </span>
  );
}

function RecordedActions({
  billing, busy, onPatch, onDelete,
}: {
  billing: Billing;
  busy: string | null;
  onPatch: (id: string, body: Record<string, unknown>) => void;
  onDelete: (id: string) => void;
}) {
  const isBusy = busy === billing.id;
  return (
    <span className="inline-flex gap-2 items-center">
      <button onClick={() => onPatch(billing.id, { status: "paid" })} disabled={isBusy} className="text-xs font-semibold px-2 py-1 rounded" style={{ color: "#22c55e", background: "rgba(34,197,94,0.1)", opacity: isBusy ? 0.5 : 1 }}>
        Mark paid
      </button>
      <select
        value=""
        disabled={isBusy}
        onChange={e => { if (e.target.value) onPatch(billing.id, { status: e.target.value }); }}
        className="px-2 py-1 rounded text-xs outline-none cursor-pointer"
        style={fieldStyle()}
        title="Disposition"
      >
        <option value="">Disposition…</option>
        <option value="failed">Mark failed</option>
        <option value="refunded">Mark refunded</option>
        <option value="pending">Reset to pending</option>
      </select>
      <button onClick={() => onDelete(billing.id)} disabled={isBusy} className="text-xs" style={{ color: "#475569" }}>Remove</button>
    </span>
  );
}

function PaidSection({
  rows, busy, onPatch, onDelete,
}: {
  rows: RecordedRow[];
  busy: string | null;
  onPatch: (id: string, body: Record<string, unknown>) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className="w-2.5 h-2.5 rounded-full" style={{ background: "#22c55e" }} />
        <h3 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "#cbd5e1" }}>Paid</h3>
        <span className="text-xs" style={{ color: "#475569" }}>({rows.length})</span>
      </div>
      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: "#0a1628" }}>
              {["Client", "Amount", "Billed", "Paid on", "Method", "State", "Action"].map((h, i) => (
                <th key={i} className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider" style={{ color: "#334155" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-xs" style={{ color: "#334155" }}>No paid billings yet.</td></tr>
            ) : rows.map((r, i) => {
              const b = r.billing;
              const isBusy = busy === b.id;
              return (
                <tr key={b.id} style={{ background: i % 2 === 0 ? "#080f1e" : "#060d1a", borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                  <td className="px-4 py-3 font-medium" style={{ color: "#e2e8f0" }}>{r.client.name}</td>
                  <td className="px-4 py-3" style={{ color: "#e2e8f0" }}>{money(b.amount)}</td>
                  <td className="px-4 py-3" style={{ color: "#94a3b8" }}>{b.billed_on}</td>
                  <td className="px-4 py-3" style={{ color: "#cbd5e1" }}>{b.paid_on ?? "—"}</td>
                  <td className="px-4 py-3" style={{ color: "#94a3b8" }}>{b.method ?? "—"}</td>
                  <td className="px-4 py-3"><StatusBadge status={b.status} /></td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {b.status === "paid" && (
                      <button onClick={() => onPatch(b.id, { status: "refunded" })} disabled={isBusy} className="text-xs font-semibold mr-3" style={{ color: "#94a3b8" }}>Refund</button>
                    )}
                    <button onClick={() => onPatch(b.id, { status: "pending", paid_on: null })} disabled={isBusy} className="text-xs mr-3" style={{ color: "#f59e0b" }}>Reopen</button>
                    <button onClick={() => onDelete(b.id)} disabled={isBusy} className="text-xs" style={{ color: "#475569" }}>Remove</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SetupTable({
  clients, busy, onUpdate,
}: {
  clients: ClientBilling[];
  busy: string | null;
  onUpdate: (clientId: string, field: string, value: string) => void;
}) {
  const sorted = clients.filter(c => c.is_live).sort((a, b) => a.name.localeCompare(b.name));
  const missing = sorted.filter(c => !c.next_billing_date).length;
  return (
    <div>
      {missing > 0 && (
        <p className="text-xs px-4 py-2" style={{ color: "#f59e0b", background: "rgba(245,158,11,0.06)" }}>
          {missing} active client{missing === 1 ? "" : "s"} have no launch date yet — set it below to project their billing day.
        </p>
      )}
      <table className="w-full text-sm">
        <thead>
          <tr style={{ background: "#081225" }}>
            {["Client", "Billing type", "Monthly $", "Launch date", "Next billing", "When"].map((h, i) => (
              <th key={i} className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider" style={{ color: "#334155" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((c, i) => {
            const isBusy = busy === `cfg-${c.id}`;
            return (
              <tr key={c.id} style={{ background: i % 2 === 0 ? "#080f1e" : "#060d1a", borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                <td className="px-4 py-2.5 font-medium" style={{ color: "#e2e8f0" }}>{c.name}</td>
                <td className="px-4 py-2.5">
                  <select value={c.billing_type ?? ""} disabled={isBusy} onChange={e => onUpdate(c.id, "billing_type", e.target.value)} className="px-2 py-1 rounded-lg text-xs outline-none cursor-pointer" style={fieldStyle()}>
                    <option value="">Monthly (default)</option>
                    <option value="monthly">Monthly</option>
                    <option value="pif">PIF</option>
                    <option value="pif_monthly">PIF + Monthly</option>
                  </select>
                </td>
                <td className="px-4 py-2.5">
                  <input type="number" defaultValue={c.mrr ?? ""} disabled={isBusy} onBlur={e => { if (String(c.mrr ?? "") !== e.target.value) onUpdate(c.id, "mrr", e.target.value); }} placeholder="0" className="px-2 py-1 rounded-lg text-xs outline-none w-24" style={fieldStyle()} />
                </td>
                <td className="px-4 py-2.5">
                  <input type="date" value={c.launch_date ?? ""} disabled={isBusy} onChange={e => onUpdate(c.id, "launch_date", e.target.value)} className="px-2 py-1 rounded-lg text-xs outline-none" style={fieldStyle()} />
                </td>
                <td className="px-4 py-2.5 text-xs" style={{ color: c.next_billing_date ? "#cbd5e1" : "#475569" }}>{c.next_billing_date ?? "needs launch date"}</td>
                <td className="px-4 py-2.5 text-xs" style={{ color: "#94a3b8" }}>{c.next_billing_date ? relativeLabel(c.next_billing_date) : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

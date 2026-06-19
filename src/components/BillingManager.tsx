"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import StatusChangeModal from "@/components/StatusChangeModal";
import { useNavigateChurnOffboard } from "@/hooks/useNavigateChurnOffboard";

const STICKY_TH_BG = "#0a1628";

function stickyThStyle(bg = STICKY_TH_BG): React.CSSProperties {
  return {
    position: "sticky",
    top: 0,
    zIndex: 10,
    background: bg,
    boxShadow: "0 1px 0 rgba(255,255,255,0.06)",
  };
}

type Billing = {
  id: string;
  client_id: string;
  billed_on: string;
  due_date: string | null;
  period_start: string | null;
  period_end: string | null;
  amount: number;
  base_amount: number | null;
  performance_amount: number | null;
  late_fee: number | null;
  discount: number | null;
  amount_paid: number | null;
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
  lifecycle_status: string | null;
  mrr: number | null;
  billing_type: string | null;
  billing_day: number | null;
  launch_date: string | null;
  date_signed: string | null;
  contract_end_date: string | null;
  performance_terms: string | null;
  next_billing_date: string | null;
  next_billing_status: "upcoming" | "due_soon" | "overdue" | null;
  last_billing: Billing | null;
  billings: Billing[];
};

const BILLING_STATUS_STYLE: Record<string, { color: string; bg: string }> = {
  paid: { color: "#22c55e", bg: "rgba(34,197,94,0.12)" },
  partial: { color: "#38bdf8", bg: "rgba(56,189,248,0.12)" },
  pending: { color: "#f59e0b", bg: "rgba(245,158,11,0.12)" },
  overdue: { color: "#ef4444", bg: "rgba(239,68,68,0.12)" },
  failed: { color: "#ef4444", bg: "rgba(239,68,68,0.12)" },
  refunded: { color: "#94a3b8", bg: "rgba(148,163,184,0.12)" },
};

function money(n: number | null | undefined): string {
  if (typeof n !== "number" || Number.isNaN(n)) return "—";
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

function balanceOf(b: Billing): number {
  return Math.max(0, (Number(b.amount) || 0) - (Number(b.amount_paid) || 0));
}

// Effective state of a recorded billing (mirrors src/lib/billing.ts recordedState).
function recordedState(b: Billing): string {
  if (b.status === "failed" || b.status === "refunded") return b.status;
  if (balanceOf(b) <= 0) return "paid";
  const dueRef = b.due_date ?? b.billed_on;
  const d = daysFromToday(dueRef);
  if (d !== null && d < 0) return "overdue";
  return (Number(b.amount_paid) || 0) > 0 ? "partial" : "pending";
}

// Compact "base (+perf) (+late)" subtitle, only when there's something to show.
function breakdownLabel(b: Billing): string | null {
  const parts: string[] = [];
  const perf = Number(b.performance_amount) || 0;
  const late = Number(b.late_fee) || 0;
  const disc = Number(b.discount) || 0;
  if (perf === 0 && late === 0 && disc === 0) return null;
  parts.push(`base ${money(Number(b.base_amount ?? b.amount))}`);
  if (perf) parts.push(`perf ${money(perf)}`);
  if (late) parts.push(`late ${money(late)}`);
  if (disc) parts.push(`− disc ${money(disc)}`);
  return parts.join(" + ").replace("+ −", "−");
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

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

function fieldStyle() {
  return { background: "#0f2040", border: "1px solid rgba(255,255,255,0.12)", color: "#e2e8f0" } as const;
}

// Record-billing payload built by the inline form.
type RecordOpts = {
  base: number;
  performance: number;
  lateFee: number;
  discount?: number;
  billedOn: string;
  dueDate: string;
  method?: string;
  note?: string;
  markPaid?: boolean;
};

// A derived worklist row: either a forecasted (not-yet-billed) cycle, or a recorded billing.
type ForecastRow = { kind: "forecast"; client: ClientBilling; date: string | null; status: string; amount: number | null };
type RecordedRow = { kind: "recorded"; client: ClientBilling; billing: Billing };
type WorkRow = ForecastRow | RecordedRow;

function isActive(c: ClientBilling): boolean {
  return c.lifecycle_status === 'active';
}

export default function BillingManager({ canViewRevenue: initialCanViewRevenue = false }: { canViewRevenue?: boolean }) {
  const [clients, setClients] = useState<ClientBilling[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [showSetup, setShowSetup] = useState(true);
  const [showInactive, setShowInactive] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [canViewRevenue, setCanViewRevenue] = useState(initialCanViewRevenue);
  const [statusChange, setStatusChange] = useState<{
    clientId: string;
    clientName: string;
    targetStatus: string;
  } | null>(null);
  const navigateChurnOffboard = useNavigateChurnOffboard();

  async function load() {
    const res = await fetch("/api/billings");
    const d = await res.json();
    setClients(d.clients ?? []);
    if (typeof d.can_view_revenue === "boolean") setCanViewRevenue(d.can_view_revenue);
    setLoading(false);
  }

  useEffect(() => {
    fetch("/api/billings")
      .then(r => r.json())
      .then(d => {
        setClients(d.clients ?? []);
        if (typeof d.can_view_revenue === "boolean") setCanViewRevenue(d.can_view_revenue);
        setLoading(false);
      });
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

  async function voidBilling(id: string) {
    if (!window.confirm("Void this billing? The row stays in the ledger for audit but is excluded from totals.")) return;
    setBusy(id);
    await fetch(`/api/billings/${id}`, { method: "DELETE" });
    await load();
    setBusy(null);
  }

  async function recordBilling(client: ClientBilling, opts: RecordOpts) {
    const key = `rec-${client.id}`;
    setBusy(key);
    await fetch("/api/billings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: client.id,
        billed_on: opts.billedOn,
        due_date: opts.dueDate || opts.billedOn,
        base_amount: opts.base,
        performance_amount: opts.performance,
        late_fee: opts.lateFee,
        discount: opts.discount ?? 0,
        method: opts.method || undefined,
        note: opts.note || undefined,
        status: opts.markPaid ? "paid" : undefined,
      }),
    });
    await load();
    setBusy(null);
  }

  async function patchClient(clientId: string, body: Record<string, unknown>) {
    setBusy(`cfg-${clientId}`);
    await fetch(`/api/clients/${clientId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    await load();
    setBusy(null);
  }

  async function confirmStatusChange(reason: string | null, note: string) {
    if (!statusChange) return;
    const { clientId, targetStatus } = statusChange;
    setBusy(`cfg-${clientId}`);
    await fetch(`/api/clients/${clientId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lifecycle_status: targetStatus,
        status_change_reason: reason,
        status_change_note: note || undefined,
      }),
    });
    setStatusChange(null);
    await load();
    setBusy(null);
  }

  // Split everything into the disposition buckets. Recorded billings always show
  // (so money owed by paused/churned clients is still collected); forecasts are
  // only projected for active clients with nothing outstanding.
  const { pastDue, upcoming, paid } = useMemo(() => {
    const pastDue: WorkRow[] = [];
    const upcoming: WorkRow[] = [];
    const paid: RecordedRow[] = [];

    for (const c of clients) {
      let openCount = 0;

      for (const b of c.billings) {
        const state = recordedState(b);
        if (state === "paid" || state === "refunded" || state === "voided") {
          if (state !== "voided") paid.push({ kind: "recorded", client: c, billing: b });
        } else {
          openCount += 1;
          (state === "overdue" || state === "failed" ? pastDue : upcoming)
            .push({ kind: "recorded", client: c, billing: b });
        }
      }

      if (isActive(c) && openCount === 0 && c.next_billing_date && c.next_billing_status) {
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

    const key = (r: WorkRow) => (r.kind === "forecast" ? r.date : (r.billing.due_date ?? r.billing.billed_on)) ?? "";
    pastDue.sort((a, b) => key(a).localeCompare(key(b)));
    upcoming.sort((a, b) => key(a).localeCompare(key(b)));
    paid.sort((a, b) => (b.billing.paid_on ?? b.billing.billed_on).localeCompare(a.billing.paid_on ?? a.billing.billed_on));

    return { pastDue, upcoming, paid };
  }, [clients]);

  const inactive = useMemo(
    () => clients.filter(c => !isActive(c)).sort((a, b) => a.name.localeCompare(b.name)),
    [clients],
  );

  if (loading) return <p className="text-sm py-8 text-center" style={{ color: "#334155" }}>Loading…</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold" style={{ color: "#e2e8f0" }}>Client Billing</h2>
          <p className="text-sm mt-0.5" style={{ color: "#475569" }}>
            Active clients project onto a monthly billing day anchored to their launch date. Collect what is past due, bill what is coming up (with base + performance + late-fee breakdown), and keep the paid history. Pause or churn from the schedule below.
          </p>
        </div>
        <button
          onClick={() => setShowImport(s => !s)}
          disabled={!canViewRevenue}
          className="text-xs font-semibold px-3 py-2 rounded-lg whitespace-nowrap"
          style={{ color: canViewRevenue ? "#38bdf8" : "#334155", background: canViewRevenue ? "rgba(56,189,248,0.1)" : "rgba(255,255,255,0.04)", border: `1px solid ${canViewRevenue ? "rgba(56,189,248,0.25)" : "rgba(255,255,255,0.06)"}`, opacity: canViewRevenue ? 1 : 0.6 }}
        >
          {showImport ? "Close" : "Record past payment"}
        </button>
      </div>

      {!canViewRevenue && (
        <p className="text-xs px-3 py-2 rounded-lg" style={{ color: "#94a3b8", background: "rgba(148,163,184,0.08)", border: "1px solid rgba(148,163,184,0.15)" }}>
          Billing schedules and status are visible; dollar amounts and payment actions require the &ldquo;View client revenue &amp; billing totals&rdquo; capability.
        </p>
      )}

      <p className="text-xs" style={{ color: "#475569" }}>
        Need to add a client or fill in missing client data? Use the Client Roster tab — billing reads launch date, MRR, and lifecycle from there.
      </p>

      {showImport && canViewRevenue && <RecordPastPaymentForm clients={clients} busy={busy} onRecord={recordBilling} />}

      <WorklistSection
        title="Past Due"
        accent="#ef4444"
        emptyText="Nothing past due. Nice."
        rows={pastDue}
        busy={busy}
        canViewRevenue={canViewRevenue}
        onPatch={patchBilling}
        onDelete={voidBilling}
        onRecord={recordBilling}
      />

      <WorklistSection
        title="Upcoming"
        accent="#f59e0b"
        emptyText="No upcoming billings on the schedule."
        rows={upcoming}
        busy={busy}
        canViewRevenue={canViewRevenue}
        onPatch={patchBilling}
        onDelete={voidBilling}
        onRecord={recordBilling}
      />

      <PaidSection rows={paid} busy={busy} canViewRevenue={canViewRevenue} onPatch={patchBilling} onDelete={voidBilling} />

      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
        <button
          onClick={() => setShowSetup(s => !s)}
          className="w-full flex items-center justify-between px-4 py-3 text-left"
          style={{ background: "#0a1628", color: "#cbd5e1" }}
        >
          <span className="text-sm font-semibold">Active clients — billing schedule (anchored to launch date)</span>
          <span className="text-xs" style={{ color: "#475569" }}>{showSetup ? "Hide" : "Show"}</span>
        </button>
        {showSetup && (
          <SetupTable
            clients={clients}
            busy={busy}
            canViewRevenue={canViewRevenue}
            onPatch={patchClient}
            onRequestPause={(clientId, clientName) =>
              setStatusChange({ clientId, clientName, targetStatus: "paused" })
            }
            onRequestOffboard={clientId => navigateChurnOffboard(clientId)}
          />
        )}
      </div>

      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
        <button
          onClick={() => setShowInactive(s => !s)}
          className="w-full flex items-center justify-between px-4 py-3 text-left"
          style={{ background: "#0a1628", color: "#cbd5e1" }}
        >
          <span className="text-sm font-semibold">Paused / Churned clients <span style={{ color: "#475569" }}>({inactive.length})</span></span>
          <span className="text-xs" style={{ color: "#475569" }}>{showInactive ? "Hide" : "Show"}</span>
        </button>
        {showInactive && <InactiveTable clients={inactive} busy={busy} canViewRevenue={canViewRevenue} onPatch={patchClient} />}
      </div>

      <StatusChangeModal
        open={!!statusChange}
        clientName={statusChange?.clientName ?? ""}
        targetStatus={statusChange?.targetStatus ?? "paused"}
        saving={statusChange ? busy === `cfg-${statusChange.clientId}` : false}
        onConfirm={confirmStatusChange}
        onCancel={() => setStatusChange(null)}
      />
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const s = BILLING_STATUS_STYLE[status] ?? BILLING_STATUS_STYLE.pending;
  return <span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={{ color: s.color, background: s.bg }}>{status}</span>;
}

function WorklistSection({
  title, accent, emptyText, rows, busy, canViewRevenue, onPatch, onDelete, onRecord,
}: {
  title: string;
  accent: string;
  emptyText: string;
  rows: WorkRow[];
  busy: string | null;
  canViewRevenue: boolean;
  onPatch: (id: string, body: Record<string, unknown>) => void;
  onDelete: (id: string) => void;
  onRecord: (client: ClientBilling, opts: RecordOpts) => void;
}) {
  const headers = canViewRevenue
    ? ["Client", "Amount", "Paid", "Balance", "Due date", "When", "State", "Action"]
    : ["Client", "Due date", "When", "State", "Action"];
  const colSpan = headers.length;
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className="w-2.5 h-2.5 rounded-full" style={{ background: accent }} />
        <h3 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "#cbd5e1" }}>{title}</h3>
        <span className="text-xs" style={{ color: "#475569" }}>({rows.length})</span>
      </div>
      <div className="rounded-xl overflow-x-auto" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: STICKY_TH_BG }}>
              {headers.map((h, i) => (
                <th key={i} className="sticky z-10 text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider" style={{ ...stickyThStyle(), color: "#334155" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={colSpan} className="px-4 py-6 text-center text-xs" style={{ color: "#334155" }}>{emptyText}</td></tr>
            ) : rows.map((r, i) => (
              <WorkRowView key={r.kind === "forecast" ? `f-${r.client.id}` : r.billing.id} row={r} striped={i % 2 === 0} busy={busy} canViewRevenue={canViewRevenue} onPatch={onPatch} onDelete={onDelete} onRecord={onRecord} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function WorkRowView({
  row, striped, busy, canViewRevenue, onPatch, onDelete, onRecord,
}: {
  row: WorkRow;
  striped: boolean;
  busy: string | null;
  canViewRevenue: boolean;
  onPatch: (id: string, body: Record<string, unknown>) => void;
  onDelete: (id: string) => void;
  onRecord: (client: ClientBilling, opts: RecordOpts) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const rowBg = striped ? "#080f1e" : "#060d1a";
  const colSpan = canViewRevenue ? 8 : 5;

  const dueDate = row.kind === "forecast" ? row.date : (row.billing.due_date ?? row.billing.billed_on);
  const amount = row.kind === "forecast" ? row.amount : row.billing.amount;
  const paid = row.kind === "forecast" ? null : (Number(row.billing.amount_paid) || 0);
  const balance = row.kind === "forecast" ? null : balanceOf(row.billing);
  const sub = row.kind === "recorded" && canViewRevenue ? breakdownLabel(row.billing) : null;

  return (
    <>
      <tr style={{ background: rowBg, borderTop: "1px solid rgba(255,255,255,0.04)" }}>
        <td className="px-4 py-3">
          <span className="font-medium" style={{ color: "#e2e8f0" }}>{row.client.name}</span>
          {sub && <div className="text-xs mt-0.5" style={{ color: "#475569" }}>{sub}</div>}
        </td>
        {canViewRevenue && (
          <>
            <td className="px-4 py-3" style={{ color: "#e2e8f0" }}>{money(amount)}</td>
            <td className="px-4 py-3" style={{ color: "#94a3b8" }}>{paid === null ? "—" : money(paid)}</td>
            <td className="px-4 py-3" style={{ color: balance && balance > 0 ? "#f59e0b" : "#94a3b8" }}>{balance === null ? "—" : money(balance)}</td>
          </>
        )}
        <td className="px-4 py-3" style={{ color: "#cbd5e1" }}>{dueDate ?? "—"}</td>
        <td className="px-4 py-3 text-xs" style={{ color: "#94a3b8" }}>{relativeLabel(dueDate)}</td>
        <td className="px-4 py-3">
          {row.kind === "forecast"
            ? <span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={{ color: "#60a5fa", background: "rgba(96,165,250,0.12)" }}>scheduled</span>
            : <StatusBadge status={recordedState(row.billing)} />}
        </td>
        <td className="px-4 py-3 text-right whitespace-nowrap">
          {canViewRevenue ? (
            <button onClick={() => setExpanded(e => !e)} className="text-xs font-semibold" style={{ color: "#60a5fa" }}>
              {expanded ? "Close" : (row.kind === "forecast" ? "Record" : "Manage")}
            </button>
          ) : (
            <span className="text-xs" style={{ color: "#334155" }}>—</span>
          )}
        </td>
      </tr>
      {expanded && canViewRevenue && (
        <tr style={{ background: "#04101f" }}>
          <td colSpan={colSpan} className="px-4 py-4">
            {row.kind === "forecast"
              ? <ForecastEditor row={row} busy={busy} onRecord={(c, o) => { onRecord(c, o); setExpanded(false); }} />
              : <RecordedEditor billing={row.billing} busy={busy} onPatch={onPatch} onDelete={onDelete} />}
          </td>
        </tr>
      )}
    </>
  );
}

function LabeledInput({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs uppercase tracking-wider" style={{ color: "#475569" }}>{label}</span>
      {children}
    </label>
  );
}

function ForecastEditor({
  row, busy, onRecord,
}: {
  row: ForecastRow;
  busy: string | null;
  onRecord: (client: ClientBilling, opts: RecordOpts) => void;
}) {
  const [base, setBase] = useState(String(row.amount ?? row.client.mrr ?? ""));
  const [performance, setPerformance] = useState("0");
  const [lateFee, setLateFee] = useState("0");
  const [billedOn, setBilledOn] = useState(row.date ?? todayYmd());
  const [dueDate, setDueDate] = useState(row.date ?? todayYmd());
  const [method, setMethod] = useState("");
  const [note, setNote] = useState("");

  const key = `rec-${row.client.id}`;
  const total = (Number(base) || 0) + (Number(performance) || 0) + (Number(lateFee) || 0);
  const disabled = busy === key || total <= 0;

  function submit(markPaid: boolean) {
    onRecord(row.client, {
      base: Number(base) || 0,
      performance: Number(performance) || 0,
      lateFee: Number(lateFee) || 0,
      billedOn,
      dueDate,
      method,
      note,
      markPaid,
    });
  }

  return (
    <div className="space-y-3">
      {row.client.performance_terms && (
        <p className="text-xs" style={{ color: "#64748b" }}>Performance terms: {row.client.performance_terms}</p>
      )}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <LabeledInput label="Base"><input type="number" value={base} onChange={e => setBase(e.target.value)} className="px-2 py-1.5 rounded-lg text-sm outline-none" style={fieldStyle()} /></LabeledInput>
        <LabeledInput label="Performance"><input type="number" value={performance} onChange={e => setPerformance(e.target.value)} className="px-2 py-1.5 rounded-lg text-sm outline-none" style={fieldStyle()} /></LabeledInput>
        <LabeledInput label="Late fee"><input type="number" value={lateFee} onChange={e => setLateFee(e.target.value)} className="px-2 py-1.5 rounded-lg text-sm outline-none" style={fieldStyle()} /></LabeledInput>
        <LabeledInput label="Method"><input value={method} onChange={e => setMethod(e.target.value)} placeholder="card / ach / wire" className="px-2 py-1.5 rounded-lg text-sm outline-none" style={fieldStyle()} /></LabeledInput>
        <LabeledInput label="Billed on"><input type="date" value={billedOn} onChange={e => setBilledOn(e.target.value)} className="px-2 py-1.5 rounded-lg text-sm outline-none" style={fieldStyle()} /></LabeledInput>
        <LabeledInput label="Due date"><input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="px-2 py-1.5 rounded-lg text-sm outline-none" style={fieldStyle()} /></LabeledInput>
        <LabeledInput label="Note"><input value={note} onChange={e => setNote(e.target.value)} className="px-2 py-1.5 rounded-lg text-sm outline-none" style={fieldStyle()} /></LabeledInput>
      </div>
      <div className="flex items-center gap-4 flex-wrap">
        <span className="text-sm" style={{ color: "#cbd5e1" }}>Total due: <strong style={{ color: "#e2e8f0" }}>{money(total)}</strong></span>
        <button onClick={() => submit(false)} disabled={disabled} className="text-xs font-semibold px-3 py-1.5 rounded" style={{ color: "#f59e0b", background: "rgba(245,158,11,0.1)", opacity: disabled ? 0.5 : 1 }}>Record billing</button>
        <button onClick={() => submit(true)} disabled={disabled} className="text-xs font-semibold px-3 py-1.5 rounded" style={{ color: "#22c55e", background: "rgba(34,197,94,0.1)", opacity: disabled ? 0.5 : 1 }}>Record + mark paid</button>
      </div>
    </div>
  );
}

function RecordedEditor({
  billing, busy, onPatch, onDelete,
}: {
  billing: Billing;
  busy: string | null;
  onPatch: (id: string, body: Record<string, unknown>) => void;
  onDelete: (id: string) => void;
}) {
  const isBusy = busy === billing.id;
  const [base, setBase] = useState(String(billing.base_amount ?? billing.amount ?? ""));
  const [performance, setPerformance] = useState(String(billing.performance_amount ?? 0));
  const [lateFee, setLateFee] = useState(String(billing.late_fee ?? 0));
  const [partial, setPartial] = useState(String(billing.amount_paid ?? ""));
  const [dueDate, setDueDate] = useState(billing.due_date ?? billing.billed_on);

  const balance = balanceOf(billing);

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        <button onClick={() => onPatch(billing.id, { status: "paid" })} disabled={isBusy} className="text-xs font-semibold px-3 py-1.5 rounded" style={{ color: "#22c55e", background: "rgba(34,197,94,0.1)", opacity: isBusy ? 0.5 : 1 }}>Mark fully paid</button>
        <button onClick={() => onPatch(billing.id, { status: "failed" })} disabled={isBusy} className="text-xs font-semibold px-3 py-1.5 rounded" style={{ color: "#ef4444", background: "rgba(239,68,68,0.1)", opacity: isBusy ? 0.5 : 1 }}>Mark failed</button>
        <button onClick={() => onPatch(billing.id, { status: "refunded" })} disabled={isBusy} className="text-xs font-semibold px-3 py-1.5 rounded" style={{ color: "#94a3b8", background: "rgba(148,163,184,0.1)", opacity: isBusy ? 0.5 : 1 }}>Refund</button>
        <button onClick={() => onPatch(billing.id, { status: "pending", paid_on: null, amount_paid: 0 })} disabled={isBusy} className="text-xs font-semibold px-3 py-1.5 rounded" style={{ color: "#f59e0b", background: "rgba(245,158,11,0.1)", opacity: isBusy ? 0.5 : 1 }}>Reopen / reset</button>
        <button onClick={() => onDelete(billing.id)} disabled={isBusy} className="text-xs px-3 py-1.5 rounded" style={{ color: "#475569" }}>Void</button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
        <div className="md:col-span-4 text-xs uppercase tracking-wider" style={{ color: "#334155" }}>Record a partial payment</div>
        <LabeledInput label={`Amount paid (balance ${money(balance)})`}>
          <input type="number" value={partial} onChange={e => setPartial(e.target.value)} className="px-2 py-1.5 rounded-lg text-sm outline-none" style={fieldStyle()} />
        </LabeledInput>
        <div>
          <button onClick={() => onPatch(billing.id, { amount_paid: Number(partial) || 0 })} disabled={isBusy} className="text-xs font-semibold px-3 py-1.5 rounded" style={{ color: "#38bdf8", background: "rgba(56,189,248,0.1)", opacity: isBusy ? 0.5 : 1 }}>Save payment</button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
        <div className="md:col-span-4 text-xs uppercase tracking-wider" style={{ color: "#334155" }}>Adjust amounts</div>
        <LabeledInput label="Base"><input type="number" value={base} onChange={e => setBase(e.target.value)} className="px-2 py-1.5 rounded-lg text-sm outline-none" style={fieldStyle()} /></LabeledInput>
        <LabeledInput label="Performance"><input type="number" value={performance} onChange={e => setPerformance(e.target.value)} className="px-2 py-1.5 rounded-lg text-sm outline-none" style={fieldStyle()} /></LabeledInput>
        <LabeledInput label="Late fee"><input type="number" value={lateFee} onChange={e => setLateFee(e.target.value)} className="px-2 py-1.5 rounded-lg text-sm outline-none" style={fieldStyle()} /></LabeledInput>
        <div>
          <button onClick={() => onPatch(billing.id, { base_amount: Number(base) || 0, performance_amount: Number(performance) || 0, late_fee: Number(lateFee) || 0 })} disabled={isBusy} className="text-xs font-semibold px-3 py-1.5 rounded" style={{ color: "#e2e8f0", background: "rgba(255,255,255,0.06)", opacity: isBusy ? 0.5 : 1 }}>Save amounts</button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
        <div className="md:col-span-4 text-xs uppercase tracking-wider" style={{ color: "#334155" }}>Extend due date</div>
        <LabeledInput label="Due date"><input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="px-2 py-1.5 rounded-lg text-sm outline-none" style={fieldStyle()} /></LabeledInput>
        <div>
          <button onClick={() => onPatch(billing.id, { due_date: dueDate })} disabled={isBusy} className="text-xs font-semibold px-3 py-1.5 rounded" style={{ color: "#e2e8f0", background: "rgba(255,255,255,0.06)", opacity: isBusy ? 0.5 : 1 }}>Extend</button>
        </div>
      </div>
    </div>
  );
}

function PaidSection({
  rows, busy, canViewRevenue, onPatch, onDelete,
}: {
  rows: RecordedRow[];
  busy: string | null;
  canViewRevenue: boolean;
  onPatch: (id: string, body: Record<string, unknown>) => void;
  onDelete: (id: string) => void;
}) {
  const headers = canViewRevenue
    ? ["Client", "Amount", "Billed", "Paid on", "Method", "State", "Action"]
    : ["Client", "Billed", "Paid on", "Method", "State"];
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className="w-2.5 h-2.5 rounded-full" style={{ background: "#22c55e" }} />
        <h3 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "#cbd5e1" }}>Paid</h3>
        <span className="text-xs" style={{ color: "#475569" }}>({rows.length})</span>
      </div>
      <div className="rounded-xl overflow-x-auto" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: STICKY_TH_BG }}>
              {headers.map((h, i) => (
                <th key={i} className="sticky z-10 text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider" style={{ ...stickyThStyle(), color: "#334155" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={headers.length} className="px-4 py-6 text-center text-xs" style={{ color: "#334155" }}>No paid billings yet.</td></tr>
            ) : rows.map((r, i) => {
              const b = r.billing;
              const isBusy = busy === b.id;
              const sub = canViewRevenue ? breakdownLabel(b) : null;
              return (
                <tr key={b.id} style={{ background: i % 2 === 0 ? "#080f1e" : "#060d1a", borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                  <td className="px-4 py-3 font-medium" style={{ color: "#e2e8f0" }}>
                    {r.client.name}
                    {sub && <div className="text-xs mt-0.5" style={{ color: "#475569" }}>{sub}</div>}
                  </td>
                  {canViewRevenue && (
                    <td className="px-4 py-3" style={{ color: "#e2e8f0" }}>{money(b.amount)}</td>
                  )}
                  <td className="px-4 py-3" style={{ color: "#94a3b8" }}>{b.billed_on}</td>
                  <td className="px-4 py-3" style={{ color: "#cbd5e1" }}>{b.paid_on ?? "—"}</td>
                  <td className="px-4 py-3" style={{ color: "#94a3b8" }}>{b.method ?? "—"}</td>
                  <td className="px-4 py-3"><StatusBadge status={b.status} /></td>
                  {canViewRevenue && (
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {b.status === "paid" && (
                        <button onClick={() => onPatch(b.id, { status: "refunded" })} disabled={isBusy} className="text-xs font-semibold mr-3" style={{ color: "#94a3b8" }}>Refund</button>
                      )}
                      <button onClick={() => onPatch(b.id, { status: "pending", paid_on: null, amount_paid: 0 })} disabled={isBusy} className="text-xs mr-3" style={{ color: "#f59e0b" }}>Reopen</button>
                      <button onClick={() => onDelete(b.id)} disabled={isBusy} className="text-xs" style={{ color: "#475569" }}>Void</button>
                    </td>
                  )}
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
  clients, busy, canViewRevenue, onPatch, onRequestPause, onRequestOffboard,
}: {
  clients: ClientBilling[];
  busy: string | null;
  canViewRevenue: boolean;
  onPatch: (clientId: string, body: Record<string, unknown>) => void;
  onRequestPause: (clientId: string, clientName: string) => void;
  onRequestOffboard: (clientId: string) => void;
}) {
  const sorted = clients.filter(isActive).sort((a, b) => a.name.localeCompare(b.name));
  const missing = sorted.filter(c => !c.next_billing_date).length;
  const headers = canViewRevenue
    ? ["Client", "Billing type", "Monthly $", "Billing day", "Launch date", "Next billing", "When", "Lifecycle"]
    : ["Client", "Billing type", "Billing day", "Launch date", "Next billing", "When", "Lifecycle"];
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
            {headers.map((h, i) => (
              <th key={i} className="sticky z-10 text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider" style={{ ...stickyThStyle("#081225"), color: "#334155" }}>{h}</th>
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
                  <select value={c.billing_type ?? ""} disabled={isBusy} onChange={e => onPatch(c.id, { billing_type: e.target.value })} className="px-2 py-1 rounded-lg text-xs outline-none cursor-pointer" style={fieldStyle()}>
                    <option value="">Monthly (default)</option>
                    <option value="monthly">Monthly</option>
                    <option value="pif">PIF</option>
                    <option value="pif_monthly">PIF + Monthly</option>
                  </select>
                </td>
                {canViewRevenue && (
                  <td className="px-4 py-2.5">
                    <input type="number" defaultValue={c.mrr ?? ""} disabled={isBusy} onBlur={e => { if (String(c.mrr ?? "") !== e.target.value) onPatch(c.id, { mrr: e.target.value }); }} placeholder="0" className="px-2 py-1 rounded-lg text-xs outline-none w-24" style={fieldStyle()} />
                  </td>
                )}
                <td className="px-4 py-2.5">
                  <input type="number" min={1} max={31} defaultValue={c.billing_day ?? ""} disabled={isBusy} onBlur={e => { if (String(c.billing_day ?? "") !== e.target.value) onPatch(c.id, { billing_day: e.target.value }); }} placeholder="—" title="Day of month (1-31); blank = launch day" className="px-2 py-1 rounded-lg text-xs outline-none w-16" style={fieldStyle()} />
                </td>
                <td className="px-4 py-2.5">
                  <input type="date" value={c.launch_date ?? ""} disabled={isBusy} onChange={e => onPatch(c.id, { launch_date: e.target.value })} className="px-2 py-1 rounded-lg text-xs outline-none" style={fieldStyle()} />
                </td>
                <td className="px-4 py-2.5 text-xs" style={{ color: c.next_billing_date ? "#cbd5e1" : "#475569" }}>{c.next_billing_date ?? "needs launch date"}</td>
                <td className="px-4 py-2.5 text-xs" style={{ color: "#94a3b8" }}>{c.next_billing_date ? relativeLabel(c.next_billing_date) : "—"}</td>
                <td className="px-4 py-2.5 whitespace-nowrap">
                  <button onClick={() => onRequestPause(c.id, c.name)} disabled={isBusy} className="text-xs font-semibold mr-3" style={{ color: "#f59e0b" }}>Pause</button>
                  <button onClick={() => onRequestOffboard(c.id)} disabled={isBusy} className="text-xs font-semibold" style={{ color: "#ef4444" }}>Churn</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function InactiveTable({
  clients, busy, canViewRevenue, onPatch,
}: {
  clients: ClientBilling[];
  busy: string | null;
  canViewRevenue: boolean;
  onPatch: (clientId: string, body: Record<string, unknown>) => void;
}) {
  if (clients.length === 0) {
    return <p className="px-4 py-6 text-center text-xs" style={{ color: "#334155" }}>No paused or churned clients.</p>;
  }
  const headers = canViewRevenue
    ? ["Client", "Status", "Outstanding balance", "Action"]
    : ["Client", "Status", "Action"];
  return (
    <table className="w-full text-sm">
      <thead>
        <tr style={{ background: "#081225" }}>
          {headers.map((h, i) => (
            <th key={i} className="sticky z-10 text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider" style={{ ...stickyThStyle("#081225"), color: "#334155" }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {clients.map((c, i) => {
          const isBusy = busy === `cfg-${c.id}`;
          const outstanding = c.billings.reduce((sum, b) => {
            const s = recordedState(b);
            return s === "paid" || s === "refunded" ? sum : sum + balanceOf(b);
          }, 0);
          return (
            <tr key={c.id} style={{ background: i % 2 === 0 ? "#080f1e" : "#060d1a", borderTop: "1px solid rgba(255,255,255,0.04)" }}>
              <td className="px-4 py-2.5 font-medium" style={{ color: "#e2e8f0" }}>{c.name}</td>
              <td className="px-4 py-2.5"><StatusBadge status={c.lifecycle_status === "churned" ? "failed" : "pending"} /><span className="ml-2 text-xs" style={{ color: "#94a3b8" }}>{c.lifecycle_status ?? "inactive"}</span></td>
              {canViewRevenue && (
                <td className="px-4 py-2.5" style={{ color: outstanding > 0 ? "#f59e0b" : "#94a3b8" }}>{money(outstanding)}</td>
              )}
              <td className="px-4 py-2.5">
                <button onClick={() => onPatch(c.id, { lifecycle_status: "active" })} disabled={isBusy} className="text-xs font-semibold" style={{ color: "#22c55e" }}>Reactivate</button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// Manually log a billing that happened a while back (e.g. if the billing tab
// missed it). Records a fully-paid billing with retainer + performance, minus
// any discount we extended.
function RecordPastPaymentForm({
  clients, busy, onRecord,
}: {
  clients: ClientBilling[];
  busy: string | null;
  onRecord: (client: ClientBilling, opts: RecordOpts) => void;
}) {
  const sorted = useMemo(() => [...clients].sort((a, b) => a.name.localeCompare(b.name)), [clients]);
  const [clientId, setClientId] = useState("");
  const [dueDate, setDueDate] = useState(todayYmd());
  const [paymentDate, setPaymentDate] = useState(todayYmd());
  const [retainer, setRetainer] = useState("");
  const [performance, setPerformance] = useState("0");
  const [discount, setDiscount] = useState("0");
  const [justRecorded, setJustRecorded] = useState(false);

  const client = sorted.find(c => c.id === clientId) ?? null;
  const total = (Number(retainer) || 0) + (Number(performance) || 0) - (Number(discount) || 0);
  const isBusy = client ? busy === `rec-${client.id}` : false;
  const disabled = isBusy || !client || total <= 0 || !paymentDate;

  function submit() {
    if (!client) return;
    onRecord(client, {
      base: Number(retainer) || 0,
      performance: Number(performance) || 0,
      lateFee: 0,
      discount: Number(discount) || 0,
      billedOn: paymentDate,
      dueDate: dueDate || paymentDate,
      markPaid: true,
    });
    setJustRecorded(true);
    setRetainer("");
    setPerformance("0");
    setDiscount("0");
  }

  return (
    <div className="rounded-xl p-5 space-y-4" style={{ background: "#0a1628", border: "1px solid rgba(56,189,248,0.2)" }}>
      <div>
        <h3 className="text-sm font-semibold" style={{ color: "#e2e8f0" }}>Record a past payment</h3>
        <p className="text-xs mt-1" style={{ color: "#475569" }}>
          Log a billing from a while back (e.g. if it wasn&rsquo;t captured automatically). It is recorded as fully paid on the payment date. Total collected = retainer + performance − discount.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <LabeledInput label="Client">
          <select value={clientId} onChange={e => { setClientId(e.target.value); setJustRecorded(false); }} className="px-2 py-1.5 rounded-lg text-sm outline-none cursor-pointer" style={fieldStyle()}>
            <option value="">Select client…</option>
            {sorted.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </LabeledInput>
        <LabeledInput label="Due date of payment"><input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="px-2 py-1.5 rounded-lg text-sm outline-none" style={fieldStyle()} /></LabeledInput>
        <LabeledInput label="Date payment conducted"><input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} className="px-2 py-1.5 rounded-lg text-sm outline-none" style={fieldStyle()} /></LabeledInput>
        <LabeledInput label="Total retainer"><input type="number" value={retainer} onChange={e => { setRetainer(e.target.value); setJustRecorded(false); }} placeholder="0" className="px-2 py-1.5 rounded-lg text-sm outline-none" style={fieldStyle()} /></LabeledInput>
        <LabeledInput label="Total performance fee"><input type="number" value={performance} onChange={e => { setPerformance(e.target.value); setJustRecorded(false); }} className="px-2 py-1.5 rounded-lg text-sm outline-none" style={fieldStyle()} /></LabeledInput>
        <LabeledInput label="Amount discounted"><input type="number" value={discount} onChange={e => { setDiscount(e.target.value); setJustRecorded(false); }} className="px-2 py-1.5 rounded-lg text-sm outline-none" style={fieldStyle()} /></LabeledInput>
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        <span className="text-sm" style={{ color: "#cbd5e1" }}>Total collected: <strong style={{ color: "#e2e8f0" }}>{money(total)}</strong></span>
        <button onClick={submit} disabled={disabled} className="text-xs font-semibold px-4 py-2 rounded-lg" style={{ color: "#22c55e", background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.25)", opacity: disabled ? 0.5 : 1 }}>
          {isBusy ? "Recording…" : "Record payment"}
        </button>
        {justRecorded && !isBusy && <span className="text-xs" style={{ color: "#22c55e" }}>Recorded — see the Paid section below.</span>}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import StatusChangeModal from "@/components/StatusChangeModal";
import { useNavigateChurnOffboard } from "@/hooks/useNavigateChurnOffboard";
import ViewHub from "@/components/nav/ViewHub";
import { CycleEditor } from "@/components/billing/PerformanceBilling";
import ReportingTypeBadge from "@/components/ReportingTypeBadge";
import {
  computeCycleTotal,
  cycleStatusLabel,
  isFixedBilling,
  isPerformanceBilling,
  type CycleStatus,
} from "@/lib/billing-model";
import {
  cadenceSetupHint,
  fixedMonthCovered,
  isCadenceLocked,
  modelBadgeLabel,
  openCadenceMonths,
} from "@/lib/billing-cadence";
import type {
  BillingCycle,
  ClientBilling,
  RecordOpts,
  RecordedRow,
  ScheduleOpts,
  WorkRow,
} from "@/components/billing/billing-types";
import {
  METHOD_OPTIONS,
  REVENUE_SEGMENT_OPTIONS,
  REVENUE_TYPE_OPTIONS,
  defaultRevenueType,
  revenueSegmentLabel,
  revenueTypeLabel,
} from "@/components/billing/billing-types";

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

type Billing = ClientBilling["billings"][number];

// Status → color palette. 'scheduled' gets an indigo tone to distinguish
// committed-but-not-yet-collected from issued invoices.
const BILLING_STATUS_STYLE: Record<string, { color: string; bg: string }> = {
  scheduled: { color: "#818cf8", bg: "rgba(129,140,248,0.12)" },
  paid:      { color: "#22c55e", bg: "rgba(34,197,94,0.12)"   },
  partial:   { color: "#38bdf8", bg: "rgba(56,189,248,0.12)"  },
  pending:   { color: "#f59e0b", bg: "rgba(245,158,11,0.12)"  },
  overdue:   { color: "#ef4444", bg: "rgba(239,68,68,0.12)"   },
  failed:    { color: "#ef4444", bg: "rgba(239,68,68,0.12)"   },
  refunded:  { color: "#94a3b8", bg: "rgba(148,163,184,0.12)" },
  draft:     { color: "#94a3b8", bg: "rgba(148,163,184,0.12)" },
  report_sent: { color: "#f59e0b", bg: "rgba(245,158,11,0.12)" },
  ready_to_bill: { color: "#22c55e", bg: "rgba(34,197,94,0.12)" },
  disputed:  { color: "#ef4444", bg: "rgba(239,68,68,0.12)" },
  billed:    { color: "#38bdf8", bg: "rgba(56,189,248,0.12)" },
  awaiting_report: { color: "#94a3b8", bg: "rgba(148,163,184,0.12)" },
  pending_setup: { color: "#a78bfa", bg: "rgba(167,139,250,0.12)" },
  cadence_due: { color: "#818cf8", bg: "rgba(129,140,248,0.12)" },
};

function money(n: number | null | undefined): string {
  if (typeof n !== "number" || Number.isNaN(n)) return "—";
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

function balanceOf(b: Billing): number {
  return Math.max(0, (Number(b.amount) || 0) - (Number(b.amount_paid) || 0));
}

function breakdownLabel(b: Billing): string | null {
  const parts: string[] = [];
  if (b.revenue_type) parts.push(revenueTypeLabel(b.revenue_type));
  const seg = revenueSegmentLabel(b.revenue_segment);
  if (seg) parts.push(seg);
  if (b.is_extension) parts.push("extension");
  if (b.is_first_payment) parts.push("first payment");
  if (b.term_months) parts.push(`${b.term_months} mo`);
  const perf = Number(b.performance_amount) || 0;
  const late = Number(b.late_fee) || 0;
  const disc = Number(b.discount) || 0;
  if (perf || late || disc) {
    parts.push(`base ${money(Number(b.base_amount ?? b.amount))}`);
    if (perf) parts.push(`perf ${money(perf)}`);
    if (late) parts.push(`late ${money(late)}`);
    if (disc) parts.push(`− disc ${money(disc)}`);
  }
  return parts.length ? parts.join(" · ") : null;
}

function revenuePayload(opts: {
  revenue_type?: string;
  revenue_segment?: string;
  term_months?: number;
  processing_fee?: number;
  method?: string;
  note?: string;
  stripe_invoice_id?: string;
}): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (opts.revenue_type) out.revenue_type = opts.revenue_type;
  if (opts.revenue_segment) out.revenue_segment = opts.revenue_segment;
  if (opts.term_months != null && opts.term_months > 0) out.term_months = opts.term_months;
  if (opts.processing_fee != null && opts.processing_fee > 0) out.processing_fee = opts.processing_fee;
  if (opts.method) out.method = opts.method;
  if (opts.note) out.note = opts.note;
  if (opts.stripe_invoice_id) out.stripe_invoice_id = opts.stripe_invoice_id;
  return out;
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

// Effective state of a recorded billing.  Mirrors src/lib/billing.ts recordedState
// but handles the new 'scheduled' status so it's never mis-classified as overdue.
function recordedState(b: Billing): string {
  if (b.status === "scheduled") return "scheduled";
  if (b.status === "failed" || b.status === "refunded") return b.status;
  if (balanceOf(b) <= 0) return "paid";
  const dueRef = b.due_date ?? b.billed_on;
  const d = daysFromToday(dueRef);
  if (d !== null && d < 0) return "overdue";
  return (Number(b.amount_paid) || 0) > 0 ? "partial" : "pending";
}

function isActive(c: ClientBilling): boolean {
  return c.lifecycle_status === "active";
}

/** Active lifecycle clients with billing not paused — eligible for the worklist. */
function isInBillingQueue(c: ClientBilling): boolean {
  return isActive(c) && !c.billing_paused;
}

/** Has an explicit billing schedule anchor (matches Billing configuration warnings). */
function isBillingConfigured(c: ClientBilling): boolean {
  if (typeof c.billing_day === "number" && c.billing_day >= 1 && c.billing_day <= 31) {
    return true;
  }
  return !!(c.launch_date?.trim());
}

function isBillingPaused(c: ClientBilling): boolean {
  return isActive(c) && !!c.billing_paused;
}

export default function BillingManager({ canViewRevenue: initialCanViewRevenue = false }: { canViewRevenue?: boolean }) {
  const [clients, setClients] = useState<ClientBilling[]>([]);
  const [cycles, setCycles] = useState<BillingCycle[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [showBillingPaused, setShowBillingPaused] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [canViewRevenue, setCanViewRevenue] = useState(initialCanViewRevenue);
  const [statusChange, setStatusChange] = useState<{
    clientId: string;
    clientName: string;
    targetStatus: string;
  } | null>(null);
  const navigateChurnOffboard = useNavigateChurnOffboard();

  async function load() {
    const [billingsRes, cyclesRes] = await Promise.all([
      fetch("/api/billings"),
      fetch("/api/billing-cycles"),
    ]);
    const [billingsData, cyclesData] = await Promise.all([billingsRes.json(), cyclesRes.json()]);
    setClients(billingsData.clients ?? []);
    setCycles(cyclesData.cycles ?? []);
    if (typeof billingsData.can_view_revenue === "boolean") {
      setCanViewRevenue(billingsData.can_view_revenue);
    }
    setLoading(false);
  }

  useEffect(() => {
    void load();
    // Initial data load only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  async function patchCycle(id: string, body: Record<string, unknown>) {
    setBusy(id);
    await fetch(`/api/billing-cycles/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    await load();
    setBusy(null);
  }

  async function billCycle(id: string, markPaid: boolean) {
    setBusy(id);
    await fetch(`/api/billing-cycles/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markPaid, billed_on: todayYmd() }),
    });
    await load();
    setBusy(null);
  }

  async function ensureCycle(
    client: ClientBilling,
    period?: { periodStart: string; periodEnd: string },
  ): Promise<BillingCycle | null> {
    setBusy(`ensure-${client.id}`);
    try {
      const body = period
        ? { client_id: client.id, period_start: period.periodStart, period_end: period.periodEnd }
        : { client_id: client.id, ensure_current: true };
      const res = await fetch("/api/billing-cycles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create billing cycle");
      await load();
      return data.cycle ? { ...data.cycle, client } as BillingCycle : null;
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Failed to create billing cycle");
      return null;
    } finally {
      setBusy(null);
    }
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
        status: opts.markPaid ? "paid" : undefined,
        ...revenuePayload(opts),
      }),
    });
    await load();
    setBusy(null);
  }

  // scheduleBilling: files the next billing cycle as 'scheduled' so it enters
  // the queue without immediately issuing an invoice.
  async function scheduleBilling(client: ClientBilling, opts: ScheduleOpts) {
    const key = `sch-${client.id}`;
    setBusy(key);
    await fetch("/api/billings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: client.id,
        billed_on: todayYmd(),
        due_date: opts.dueDate,
        base_amount: opts.base,
        performance_amount: opts.performance,
        late_fee: 0,
        discount: opts.discount,
        status: opts.markPaid ? "paid" : "scheduled",
        ...revenuePayload(opts),
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

  async function pauseClientBilling(client: ClientBilling) {
    const note = window.prompt(
      `Pause billing for ${client.name}? Optional note (e.g. reason):`,
      client.billing_paused_note ?? "",
    );
    if (note === null) return;
    await patchClient(client.id, {
      billing_paused: true,
      billing_paused_note: note.trim() || undefined,
    });
  }

  async function unpauseClientBilling(clientId: string) {
    await patchClient(clientId, { billing_paused: false });
  }

  async function unpauseAndSchedule(client: ClientBilling, opts: ScheduleOpts) {
    setBusy(`sch-${client.id}`);
    await fetch(`/api/clients/${client.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ billing_paused: false }),
    });
    await fetch("/api/billings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: client.id,
        billed_on: todayYmd(),
        due_date: opts.dueDate,
        base_amount: opts.base,
        performance_amount: opts.performance,
        late_fee: 0,
        discount: opts.discount,
        status: opts.markPaid ? "paid" : "scheduled",
        ...revenuePayload(opts),
      }),
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

  // Unified Fixed + Performance queue. Locked cadence replaces monthly
  // "unscheduled / File billing". Pending = needs day/rates disposition.
  const { pastDue, upcoming, paid } = useMemo(() => {
    const pastDue: WorkRow[] = [];
    const upcoming: WorkRow[] = [];
    const paid: RecordedRow[] = [];
    const cyclesByClient = new Map<string, BillingCycle[]>();
    for (const cycle of cycles) {
      const list = cyclesByClient.get(cycle.client_id) ?? [];
      list.push(cycle);
      cyclesByClient.set(cycle.client_id, list);
    }

    const pushByDue = (row: WorkRow, due: string | null) => {
      const days = daysFromToday(due);
      if (days !== null && days < 0) pastDue.push(row);
      else upcoming.push(row);
    };

    for (const c of clients) {
      // Paid history for everyone (both models)
      for (const b of c.billings) {
        const state = recordedState(b);
        if (state === "paid" || state === "refunded") {
          paid.push({ kind: "recorded", client: c, billing: b });
        }
      }

      if (!isInBillingQueue(c)) continue;

      if (!isCadenceLocked(c)) {
        upcoming.push({ kind: "pending_setup", client: c });
        continue;
      }

      if (isPerformanceBilling(c.billing_model)) {
        const clientCycles = cyclesByClient.get(c.id) ?? [];
        const day = typeof c.billing_day === "number" ? c.billing_day : 1;
        for (const cycle of clientCycles) {
          if (cycle.status === "billed" || cycle.status === "voided") continue;
          // Hide cycles already settled by paid revenue (Stripe/sheet backfill).
          const cycleYm = cycle.period_end?.slice(0, 7);
          const paidBillings = c.billings.filter(b => b.status === "paid" || b.status === "refunded");
          if (cycleYm && fixedMonthCovered(cycleYm, paidBillings)) continue;
          const periodYear = Number(cycle.period_end.slice(0, 4));
          const periodMonth = Number(cycle.period_end.slice(5, 7)) - 1;
          const dim = new Date(Date.UTC(periodYear, periodMonth + 1, 0)).getUTCDate();
          const reportDue = `${cycle.period_end.slice(0, 8)}${String(Math.min(day, dim)).padStart(2, "0")}`;
          pushByDue(
            { kind: "perf_cycle", client: c, cycle: { ...cycle, client: cycle.client ?? c }, dueDate: reportDue },
            reportDue,
          );
        }
        for (const month of openCadenceMonths(c, {
          cycles: clientCycles,
          // Paid ledger rows settle Performance months too (Stripe/revenue backfill).
          billings: c.billings,
        })) {
          pushByDue({
            kind: "cadence_due",
            client: c,
            yearMonth: month.yearMonth,
            periodStart: month.periodStart,
            periodEnd: month.periodEnd,
            dueDate: month.dueDate,
          }, month.dueDate);
        }
        continue;
      }

      // Fixed locked
      for (const b of c.billings) {
        const state = recordedState(b);
        if (state === "paid" || state === "refunded" || state === "voided") continue;
        if (state === "overdue" || state === "failed") {
          pastDue.push({ kind: "recorded", client: c, billing: b });
        } else if (state === "scheduled") {
          const days = daysFromToday(b.due_date ?? b.billed_on);
          (days !== null && days < 0 ? pastDue : upcoming).push({ kind: "recorded", client: c, billing: b });
        } else {
          // pending, partial — bucket by due date
          pushByDue({ kind: "recorded", client: c, billing: b }, b.due_date ?? b.billed_on);
        }
      }
      for (const month of openCadenceMonths(c, { billings: c.billings })) {
        pushByDue({
          kind: "cadence_due",
          client: c,
          yearMonth: month.yearMonth,
          periodStart: month.periodStart,
          periodEnd: month.periodEnd,
          dueDate: month.dueDate,
        }, month.dueDate);
      }
    }

    const dueKey = (r: WorkRow) => {
      if (r.kind === "pending_setup") return r.client.suggested_next_date ?? r.client.next_billing_date ?? "9999";
      if (r.kind === "cadence_due") return r.dueDate;
      if (r.kind === "perf_cycle") return r.dueDate;
      return (r.billing.due_date ?? r.billing.billed_on) ?? "";
    };

    pastDue.sort((a, b) => dueKey(a).localeCompare(dueKey(b)));
    upcoming.sort((a, b) => dueKey(a).localeCompare(dueKey(b)));
    paid.sort((a, b) =>
      (b.billing.paid_on ?? b.billing.billed_on).localeCompare(a.billing.paid_on ?? a.billing.billed_on)
    );

    return { pastDue, upcoming, paid };
  }, [clients, cycles]);

  const inactiveClients = useMemo(
    () => clients.filter(c => !isActive(c)).sort((a, b) => a.name.localeCompare(b.name)),
    [clients],
  );

  const setupCount = useMemo(
    () => clients.filter(c => isInBillingQueue(c)).length,
    [clients],
  );

  const billingPaused = useMemo(
    () => clients.filter(c => isBillingPaused(c)).sort((a, b) => a.name.localeCompare(b.name)),
    [clients],
  );

  if (loading) return <p className="text-sm py-8 text-center" style={{ color: "#334155" }}>Loading…</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold" style={{ color: "#e2e8f0" }}>Client Billing</h2>
          <p className="text-sm mt-0.5" style={{ color: "#475569" }}>
            One queue for Fixed and Performance. Lock billing/report day once in Setup — each month appears on that day until pause or churn.
            Performance: enter shows / live transfers / bailed, send report, then bill after the objection window.
          </p>
        </div>
        <button
          onClick={() => setShowImport(s => !s)}
          disabled={!canViewRevenue}
          className="text-xs font-semibold px-3 py-2 rounded-lg whitespace-nowrap"
          style={{
            color: canViewRevenue ? "#38bdf8" : "#334155",
            background: canViewRevenue ? "rgba(56,189,248,0.1)" : "rgba(255,255,255,0.04)",
            border: `1px solid ${canViewRevenue ? "rgba(56,189,248,0.25)" : "rgba(255,255,255,0.06)"}`,
            opacity: canViewRevenue ? 1 : 0.6,
          }}
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
        Need to add a client or update billing settings? Use the Client Roster tab — billing reads launch date, MRR, and lifecycle from there.
      </p>

      {/* Billing-paused chip + panel */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={() => setShowBillingPaused(s => !s)}
          className="inline-flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-full transition-colors"
          style={{
            color: billingPaused.length > 0 ? "#f59e0b" : "#64748b",
            background: billingPaused.length > 0 ? "rgba(245,158,11,0.12)" : "rgba(148,163,184,0.08)",
            border: `1px solid ${billingPaused.length > 0 ? "rgba(245,158,11,0.35)" : "rgba(148,163,184,0.15)"}`,
          }}
        >
          <span
            className="w-2 h-2 rounded-full"
            style={{ background: billingPaused.length > 0 ? "#f59e0b" : "#475569" }}
          />
          Billing paused
          <span
            className="px-1.5 py-0.5 rounded-full text-[10px] font-bold"
            style={{
              color: billingPaused.length > 0 ? "#fbbf24" : "#64748b",
              background: "rgba(0,0,0,0.25)",
            }}
          >
            {billingPaused.length}
          </span>
        </button>
        {billingPaused.length > 0 && !showBillingPaused && (
          <span className="text-xs" style={{ color: "#475569" }}>
            Click to view paused clients and resume billing when ready.
          </span>
        )}
      </div>

      {showBillingPaused && (
        <BillingPausedPanel
          clients={billingPaused}
          busy={busy}
          canViewRevenue={canViewRevenue}
          onUnpause={unpauseClientBilling}
          onUnpauseAndSchedule={unpauseAndSchedule}
          onClose={() => setShowBillingPaused(false)}
        />
      )}

      {showImport && canViewRevenue && (
        <RecordPastPaymentForm clients={clients.filter(c => isFixedBilling(c.billing_model))} busy={busy} onRecord={recordBilling} />
      )}

      <UnifiedBilling
        pastDue={pastDue}
        upcoming={upcoming}
        paid={paid}
        inactiveClients={inactiveClients}
        setupCount={setupCount}
        clients={clients}
        busy={busy}
        canViewRevenue={canViewRevenue}
        onPatchBilling={patchBilling}
        onDeleteBilling={voidBilling}
        onSchedule={scheduleBilling}
        onPatchClient={patchClient}
        onPatchCycle={patchCycle}
        onBillCycle={billCycle}
        onEnsureCycle={ensureCycle}
        onPauseBilling={pauseClientBilling}
        onRequestPause={(clientId, clientName) =>
          setStatusChange({ clientId, clientName, targetStatus: "paused" })
        }
        onRequestOffboard={clientId => navigateChurnOffboard(clientId)}
      />

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

// ─── Sub-components ──────────────────────────────────────────────────────────

type BillingSubView = "queue" | "paid" | "inactive" | "setup";

function UnifiedBilling({
  pastDue,
  upcoming,
  paid,
  inactiveClients,
  setupCount,
  clients,
  busy,
  canViewRevenue,
  onPatchBilling,
  onDeleteBilling,
  onSchedule,
  onPatchClient,
  onPatchCycle,
  onBillCycle,
  onEnsureCycle,
  onPauseBilling,
  onRequestPause,
  onRequestOffboard,
}: {
  pastDue: WorkRow[];
  upcoming: WorkRow[];
  paid: RecordedRow[];
  inactiveClients: ClientBilling[];
  setupCount: number;
  clients: ClientBilling[];
  busy: string | null;
  canViewRevenue: boolean;
  onPatchBilling: (id: string, body: Record<string, unknown>) => void;
  onDeleteBilling: (id: string) => void;
  onSchedule: (client: ClientBilling, opts: ScheduleOpts) => void;
  onPatchClient: (clientId: string, body: Record<string, unknown>) => void;
  onPatchCycle: (id: string, body: Record<string, unknown>) => Promise<void> | void;
  onBillCycle: (id: string, markPaid: boolean) => Promise<void> | void;
  onEnsureCycle: (
    client: ClientBilling,
    period?: { periodStart: string; periodEnd: string },
  ) => Promise<BillingCycle | null>;
  onPauseBilling: (client: ClientBilling) => void;
  onRequestPause: (clientId: string, clientName: string) => void;
  onRequestOffboard: (clientId: string) => void;
}) {
  const [subView, setSubView] = useState<BillingSubView>("queue");

  const queueCount = pastDue.length + upcoming.length;

  const subTabs = useMemo(() => {
    const tabs = [{ key: "queue", label: `Queue (${queueCount})` }];
    if (canViewRevenue) {
      tabs.push({ key: "paid", label: `Paid (${paid.length})` });
    }
    tabs.push(
      { key: "inactive", label: `Paused / churned (${inactiveClients.length})` },
      { key: "setup", label: `Setup (${setupCount})` },
    );
    return tabs;
  }, [queueCount, canViewRevenue, paid.length, inactiveClients.length, setupCount]);

  useEffect(() => {
    if (subView === "paid" && !canViewRevenue) setSubView("queue");
  }, [canViewRevenue, subView]);

  return (
    <ViewHub
      tabs={subTabs}
      activeTab={subView}
      onTabChange={k => setSubView(k as BillingSubView)}
    >
      {subView === "queue" && (
        <>
          <WorklistSection
            title="Past Due"
            accent="#ef4444"
            emptyText="Nothing past due."
            rows={pastDue}
            busy={busy}
            canViewRevenue={canViewRevenue}
            onPatch={onPatchBilling}
            onDelete={onDeleteBilling}
            onSchedule={onSchedule}
            onPatchCycle={onPatchCycle}
            onBillCycle={onBillCycle}
            onEnsureCycle={onEnsureCycle}
            onGoSetup={() => setSubView("setup")}
          />
          <WorklistSection
            title="Upcoming"
            accent="#f59e0b"
            emptyText="No upcoming billings in the queue."
            rows={upcoming}
            busy={busy}
            canViewRevenue={canViewRevenue}
            onPatch={onPatchBilling}
            onDelete={onDeleteBilling}
            onSchedule={onSchedule}
            onPatchCycle={onPatchCycle}
            onBillCycle={onBillCycle}
            onEnsureCycle={onEnsureCycle}
            onGoSetup={() => setSubView("setup")}
          />
        </>
      )}

      {subView === "paid" && canViewRevenue && (
        <PaidSection
          rows={paid}
          busy={busy}
          canViewRevenue={canViewRevenue}
          onPatch={onPatchBilling}
          onDelete={onDeleteBilling}
        />
      )}

      {subView === "inactive" && (
        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
          <InactiveTable
            clients={inactiveClients}
            busy={busy}
            canViewRevenue={canViewRevenue}
            onPatch={onPatchClient}
            onPatchBilling={onPatchBilling}
            onDelete={onDeleteBilling}
          />
        </div>
      )}

      {subView === "setup" && (
        <SetupTable
          clients={clients}
          busy={busy}
          canViewRevenue={canViewRevenue}
          onPatch={onPatchClient}
          onPauseBilling={onPauseBilling}
          onRequestPause={onRequestPause}
          onRequestOffboard={onRequestOffboard}
        />
      )}
    </ViewHub>
  );
}

function StatusBadge({ status, label }: { status: string; label?: string }) {
  const s = BILLING_STATUS_STYLE[status] ?? BILLING_STATUS_STYLE.pending;
  return (
    <span
      className="px-2 py-0.5 rounded-full text-xs font-semibold"
      style={{ color: s.color, background: s.bg }}
    >
      {label ?? status}
    </span>
  );
}

function ModelBadge({ model }: { model: string | null | undefined }) {
  const label = modelBadgeLabel(model);
  const perf = label === "Performance";
  return (
    <span
      className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider"
      style={{
        color: perf ? "#c4b5fd" : "#93c5fd",
        background: perf ? "rgba(167,139,250,0.12)" : "rgba(96,165,250,0.12)",
      }}
    >
      {label}
    </span>
  );
}

function workRowKey(r: WorkRow): string {
  if (r.kind === "pending_setup") return `pending-${r.client.id}`;
  if (r.kind === "cadence_due") return `cadence-${r.client.id}-${r.yearMonth}`;
  if (r.kind === "perf_cycle") return `cycle-${r.cycle.id}`;
  return r.billing.id;
}

function WorklistSection({
  title, accent, emptyText, rows, busy, canViewRevenue, onPatch, onDelete, onSchedule,
  onPatchCycle, onBillCycle, onEnsureCycle, onGoSetup,
}: {
  title: string;
  accent: string;
  emptyText: string;
  rows: WorkRow[];
  busy: string | null;
  canViewRevenue: boolean;
  onPatch: (id: string, body: Record<string, unknown>) => void;
  onDelete: (id: string) => void;
  onSchedule: (client: ClientBilling, opts: ScheduleOpts) => void;
  onPatchCycle: (id: string, body: Record<string, unknown>) => Promise<void> | void;
  onBillCycle: (id: string, markPaid: boolean) => Promise<void> | void;
  onEnsureCycle: (
    client: ClientBilling,
    period?: { periodStart: string; periodEnd: string },
  ) => Promise<BillingCycle | null>;
  onGoSetup: () => void;
}) {
  const headers = canViewRevenue
    ? ["Client", "Offer", "Model", "Amount", "Paid", "Balance", "Due date", "When", "Status", "Action"]
    : ["Client", "Offer", "Model", "Due date", "When", "Status", "Action"];
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
                <th
                  key={i}
                  className="sticky z-10 text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider"
                  style={{ ...stickyThStyle(), color: "#334155" }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={colSpan} className="px-4 py-6 text-center text-xs" style={{ color: "#334155" }}>
                  {emptyText}
                </td>
              </tr>
            ) : (
              rows.map((r, i) => (
                <WorkRowView
                  key={workRowKey(r)}
                  row={r}
                  striped={i % 2 === 0}
                  busy={busy}
                  canViewRevenue={canViewRevenue}
                  onPatch={onPatch}
                  onDelete={onDelete}
                  onSchedule={onSchedule}
                  onPatchCycle={onPatchCycle}
                  onBillCycle={onBillCycle}
                  onEnsureCycle={onEnsureCycle}
                  onGoSetup={onGoSetup}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function WorkRowView({
  row, striped, busy, canViewRevenue, onPatch, onDelete, onSchedule,
  onPatchCycle, onBillCycle, onEnsureCycle, onGoSetup,
}: {
  row: WorkRow;
  striped: boolean;
  busy: string | null;
  canViewRevenue: boolean;
  onPatch: (id: string, body: Record<string, unknown>) => void;
  onDelete: (id: string) => void;
  onSchedule: (client: ClientBilling, opts: ScheduleOpts) => void;
  onPatchCycle: (id: string, body: Record<string, unknown>) => Promise<void> | void;
  onBillCycle: (id: string, markPaid: boolean) => Promise<void> | void;
  onEnsureCycle: (
    client: ClientBilling,
    period?: { periodStart: string; periodEnd: string },
  ) => Promise<BillingCycle | null>;
  onGoSetup: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [ensuredCycle, setEnsuredCycle] = useState<BillingCycle | null>(null);
  const colSpan = canViewRevenue ? 10 : 7;

  const isPending = row.kind === "pending_setup";
  const isCadence = row.kind === "cadence_due";
  const isPerf = row.kind === "perf_cycle";
  const isRecorded = row.kind === "recorded";
  const soft = isPending || isCadence;

  const rowBg = soft
    ? (striped ? "rgba(129,140,248,0.04)" : "rgba(129,140,248,0.02)")
    : (striped ? "#080f1e" : "#060d1a");

  let dueDate: string | null = null;
  let amount: number | null = null;
  let paid: number | null = null;
  let balance: number | null = null;
  let sub: string | null = null;
  let statusKey = "pending";
  let statusLabel = "pending";
  let actionLabel = "Manage";

  if (isPending) {
    dueDate = row.client.suggested_next_date ?? row.client.next_billing_date;
    amount = row.client.mrr;
    statusKey = "pending_setup";
    statusLabel = "Pending";
    actionLabel = "Set up billing";
    sub = "Set billing day + rates in Setup";
  } else if (isCadence) {
    dueDate = row.dueDate;
    amount = isPerformanceBilling(row.client.billing_model) ? null : row.client.mrr;
    statusKey = "cadence_due";
    statusLabel = isPerformanceBilling(row.client.billing_model) ? "Awaiting report" : "Due";
    actionLabel = "Manage";
    sub = `${row.periodStart} → ${row.periodEnd}`;
  } else if (isPerf) {
    dueDate = row.dueDate;
    amount = computeCycleTotal(row.cycle.base_amount, row.cycle.performance_amount, row.cycle.discount);
    statusKey = row.cycle.effective_status ?? row.cycle.status;
    statusLabel = cycleStatusLabel(statusKey as CycleStatus);
    actionLabel = "Manage";
    sub = `${row.cycle.period_start} → ${row.cycle.period_end}`;
  } else {
    dueDate = row.billing.due_date ?? row.billing.billed_on;
    amount = row.billing.amount;
    paid = Number(row.billing.amount_paid) || 0;
    balance = balanceOf(row.billing);
    sub = canViewRevenue ? breakdownLabel(row.billing) : null;
    statusKey = recordedState(row.billing);
    statusLabel = statusKey;
    actionLabel = "Manage";
  }

  async function handleAction() {
    if (isPending) {
      onGoSetup();
      return;
    }
    if (isCadence && isPerformanceBilling(row.client.billing_model)) {
      const cycle = await onEnsureCycle(row.client, {
        periodStart: row.periodStart,
        periodEnd: row.periodEnd,
      });
      if (cycle) {
        setEnsuredCycle({ ...cycle, client: cycle.client ?? row.client });
        setExpanded(true);
      }
      return;
    }
    setExpanded(e => !e);
  }

  const activeCycle = isPerf ? row.cycle : ensuredCycle;

  return (
    <>
      <tr
        style={{
          background: rowBg,
          borderTop: "1px solid rgba(255,255,255,0.04)",
          opacity: soft ? 0.9 : 1,
        }}
      >
        <td className="px-4 py-3">
          <span className="font-medium" style={{ color: soft ? "#cbd5e1" : "#e2e8f0" }}>
            {row.client.name}
          </span>
          {sub && <div className="text-xs mt-0.5" style={{ color: "#475569" }}>{sub}</div>}
        </td>

        <td className="px-4 py-3">
          {row.client.reporting_type ? (
            <ReportingTypeBadge value={row.client.reporting_type} size="sm" />
          ) : (
            <span style={{ color: "#475569" }}>—</span>
          )}
        </td>

        <td className="px-4 py-3">
          <ModelBadge model={row.client.billing_model} />
        </td>

        {canViewRevenue && (
          <>
            <td className="px-4 py-3" style={{ color: "#e2e8f0" }}>{money(amount)}</td>
            <td className="px-4 py-3" style={{ color: "#94a3b8" }}>{paid === null ? "—" : money(paid)}</td>
            <td className="px-4 py-3" style={{ color: balance && balance > 0 ? "#f59e0b" : "#94a3b8" }}>
              {balance === null ? "—" : money(balance)}
            </td>
          </>
        )}

        <td className="px-4 py-3" style={{ color: "#cbd5e1" }}>{dueDate ?? "—"}</td>
        <td className="px-4 py-3 text-xs" style={{ color: "#94a3b8" }}>{relativeLabel(dueDate)}</td>

        <td className="px-4 py-3">
          <StatusBadge status={statusKey} label={statusLabel} />
        </td>

        <td className="px-4 py-3 text-right whitespace-nowrap">
          {canViewRevenue || isPending ? (
            <button
              onClick={() => void handleAction()}
              className="text-xs font-semibold"
              style={{ color: isPending ? "#a78bfa" : "#60a5fa" }}
            >
              {expanded ? "Close" : actionLabel}
            </button>
          ) : (
            <span className="text-xs" style={{ color: "#334155" }}>—</span>
          )}
        </td>
      </tr>

      {expanded && canViewRevenue && (
        <tr style={{ background: "#04101f" }}>
          <td colSpan={colSpan} className="px-4 py-4">
            {isCadence && isFixedBilling(row.client.billing_model) && (
              <ScheduleEditor
                client={row.client}
                busy={busy}
                defaultDueDate={row.dueDate}
                onSchedule={(opts) => { onSchedule(row.client, opts); setExpanded(false); }}
              />
            )}
            {activeCycle && (
              <CycleEditor
                cycle={activeCycle}
                busy={busy}
                onPatch={onPatchCycle}
                onBill={onBillCycle}
              />
            )}
            {isRecorded && (
              <RecordedEditor
                billing={row.billing}
                busy={busy}
                onPatch={onPatch}
                onDelete={onDelete}
              />
            )}
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

// ScheduleEditor: files the next billing cycle as 'scheduled'.
// Replaces the old ForecastEditor — creates a real DB row instead of a
// transient pending billing, so terms can be edited before payment is due.
function ScheduleEditor({
  client, busy, onSchedule, submitLabel, busyLabel, showMarkPaid = true, defaultDueDate,
}: {
  client: ClientBilling;
  busy: string | null;
  onSchedule: (opts: ScheduleOpts) => void;
  submitLabel?: string;
  busyLabel?: string;
  showMarkPaid?: boolean;
  defaultDueDate?: string | null;
}) {
  const suggestedDate = defaultDueDate ?? client.suggested_next_date ?? client.next_billing_date ?? todayYmd();
  const [base, setBase] = useState(String(client.mrr ?? ""));
  const [performance, setPerformance] = useState("0");
  const [discount, setDiscount] = useState("0");
  const [dueDate, setDueDate] = useState(suggestedDate);
  const [note, setNote] = useState("");
  const [revenueType, setRevenueType] = useState(defaultRevenueType(client.billing_type));
  const [revenueSegment, setRevenueSegment] = useState("back_end");
  const [termMonths, setTermMonths] = useState(
    client.billing_type === "pif" ? String(client.contract_term_months ?? "") : "",
  );
  const [processingFee, setProcessingFee] = useState("0");
  const [method, setMethod] = useState("stripe");
  const [stripeInvoiceId, setStripeInvoiceId] = useState("");

  const schedKey = `sch-${client.id}`;
  const total = Math.max(0,
    (Number(base) || 0) + (Number(performance) || 0) - (Number(discount) || 0)
  );
  const pifNeedsTerm = revenueType === "pif" && !(Number(termMonths) > 0);
  const disabled = busy === schedKey || total <= 0 || pifNeedsTerm;

  function buildOpts(markPaid?: boolean): ScheduleOpts {
    return {
      base: Number(base) || 0,
      performance: Number(performance) || 0,
      discount: Number(discount) || 0,
      dueDate,
      note: note || undefined,
      markPaid,
      revenue_type: revenueType,
      revenue_segment: revenueSegment,
      term_months: Number(termMonths) || undefined,
      processing_fee: Number(processingFee) || undefined,
      method: method || undefined,
      stripe_invoice_id: stripeInvoiceId.trim() || undefined,
    };
  }

  return (
    <div className="space-y-3">
      <p className="text-xs px-3 py-2 rounded-lg" style={{ color: "#818cf8", background: "rgba(129,140,248,0.08)", border: "1px solid rgba(129,140,248,0.2)" }}>
        Record this month&apos;s charge on the locked due day. Tag the revenue type so CEO cash KPIs stay accurate.
      </p>

      {client.performance_terms && (
        <p className="text-xs" style={{ color: "#64748b" }}>Performance terms: {client.performance_terms}</p>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <LabeledInput label="Base (retainer)">
          <input
            type="number"
            value={base}
            onChange={e => setBase(e.target.value)}
            className="px-2 py-1.5 rounded-lg text-sm outline-none"
            style={fieldStyle()}
          />
        </LabeledInput>
        <LabeledInput label="Performance">
          <input
            type="number"
            value={performance}
            onChange={e => setPerformance(e.target.value)}
            className="px-2 py-1.5 rounded-lg text-sm outline-none"
            style={fieldStyle()}
          />
        </LabeledInput>
        <LabeledInput label="Discount">
          <input
            type="number"
            value={discount}
            onChange={e => setDiscount(e.target.value)}
            placeholder="0"
            className="px-2 py-1.5 rounded-lg text-sm outline-none"
            style={fieldStyle()}
          />
        </LabeledInput>
        <LabeledInput label="Due date">
          <input
            type="date"
            value={dueDate}
            onChange={e => setDueDate(e.target.value)}
            className="px-2 py-1.5 rounded-lg text-sm outline-none"
            style={fieldStyle()}
          />
        </LabeledInput>
        <LabeledInput label="Revenue type">
          <select
            value={revenueType}
            onChange={e => setRevenueType(e.target.value)}
            className="px-2 py-1.5 rounded-lg text-sm outline-none"
            style={fieldStyle()}
          >
            {REVENUE_TYPE_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </LabeledInput>
        <LabeledInput label="Cash segment">
          <select
            value={revenueSegment}
            onChange={e => setRevenueSegment(e.target.value)}
            className="px-2 py-1.5 rounded-lg text-sm outline-none"
            style={fieldStyle()}
          >
            {REVENUE_SEGMENT_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </LabeledInput>
        {revenueType === "pif" && (
          <LabeledInput label="Term months">
            <input
              type="number"
              value={termMonths}
              onChange={e => setTermMonths(e.target.value)}
              placeholder="e.g. 6"
              className="px-2 py-1.5 rounded-lg text-sm outline-none"
              style={fieldStyle()}
            />
          </LabeledInput>
        )}
        <LabeledInput label="Processing fee">
          <input
            type="number"
            value={processingFee}
            onChange={e => setProcessingFee(e.target.value)}
            className="px-2 py-1.5 rounded-lg text-sm outline-none"
            style={fieldStyle()}
          />
        </LabeledInput>
        <LabeledInput label="Method">
          <select
            value={method}
            onChange={e => setMethod(e.target.value)}
            className="px-2 py-1.5 rounded-lg text-sm outline-none"
            style={fieldStyle()}
          >
            {METHOD_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </LabeledInput>
        <LabeledInput label="Stripe invoice id">
          <input
            value={stripeInvoiceId}
            onChange={e => setStripeInvoiceId(e.target.value)}
            placeholder="in_..."
            className="px-2 py-1.5 rounded-lg text-sm outline-none"
            style={fieldStyle()}
          />
        </LabeledInput>
        <LabeledInput label="Note (optional)">
          <input
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="e.g. discounted month / upsell"
            className="px-2 py-1.5 rounded-lg text-sm outline-none"
            style={fieldStyle()}
          />
        </LabeledInput>
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        <span className="text-sm" style={{ color: "#cbd5e1" }}>
          Total due: <strong style={{ color: "#e2e8f0" }}>{money(total)}</strong>
        </span>
        <button
          onClick={() => onSchedule(buildOpts())}
          disabled={disabled}
          className="text-xs font-semibold px-3 py-1.5 rounded"
          style={{ color: "#818cf8", background: "rgba(129,140,248,0.1)", opacity: disabled ? 0.5 : 1 }}
        >
          {busy === schedKey ? (busyLabel ?? "Scheduling…") : (submitLabel ?? "Schedule billing")}
        </button>
        {showMarkPaid && (
          <button
            onClick={() => onSchedule(buildOpts(true))}
            disabled={disabled}
            className="text-xs font-semibold px-3 py-1.5 rounded"
            style={{ color: "#22c55e", background: "rgba(34,197,94,0.1)", opacity: disabled ? 0.5 : 1 }}
          >
            Schedule + mark paid
          </button>
        )}
      </div>
    </div>
  );
}

// RecordedEditor: manages an existing billing row.
// Handles both 'scheduled' billings (pre-payment, editable) and
// issued billings (pending / partial / overdue / failed).
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
  const [discount, setDiscount] = useState(String(billing.discount ?? 0));
  const [partial, setPartial] = useState(String(billing.amount_paid ?? ""));
  const [dueDate, setDueDate] = useState(billing.due_date ?? billing.billed_on);
  const [processingFee, setProcessingFee] = useState(String(billing.processing_fee ?? 0));
  const [method, setMethod] = useState(billing.method ?? "stripe");
  const [stripeInvoiceId, setStripeInvoiceId] = useState(billing.stripe_invoice_id ?? "");
  const [revenueType, setRevenueType] = useState(billing.revenue_type ?? "mrr");
  const [revenueSegment, setRevenueSegment] = useState(billing.revenue_segment ?? "back_end");

  const balance = balanceOf(billing);
  const isScheduled = billing.status === "scheduled";

  function paymentExtras() {
    return {
      processing_fee: Number(processingFee) || 0,
      method: method || undefined,
      stripe_invoice_id: stripeInvoiceId.trim() || null,
      revenue_type: revenueType,
      revenue_segment: revenueSegment,
    };
  }

  if (isScheduled) {
    // ── Scheduled billing editor ─────────────────────────────────────────────
    // Primary action is recording payment (scheduled → paid in one step).
    // Secondary: adjust amounts / due date before the payment is due.
    const scheduledTotal = Math.max(0,
      (Number(base) || 0) + (Number(performance) || 0) - (Number(discount) || 0)
    );

    return (
      <div className="space-y-4">
        <p className="text-xs px-3 py-2 rounded-lg" style={{ color: "#818cf8", background: "rgba(129,140,248,0.08)", border: "1px solid rgba(129,140,248,0.2)" }}>
          This billing is scheduled — record the payment when collected, or adjust amounts and due date before it&rsquo;s due.
        </p>

        {/* Record payment */}
        <div className="space-y-2">
          <div className="text-xs uppercase tracking-wider" style={{ color: "#334155" }}>Record payment</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
            <LabeledInput label={`Amount paid (${money(Number(billing.amount))} due)`}>
              <input
                type="number"
                value={partial}
                onChange={e => setPartial(e.target.value)}
                placeholder={String(billing.amount)}
                className="px-2 py-1.5 rounded-lg text-sm outline-none"
                style={fieldStyle()}
              />
            </LabeledInput>
            <LabeledInput label="Revenue type">
              <select value={revenueType} onChange={e => setRevenueType(e.target.value)} className="px-2 py-1.5 rounded-lg text-sm outline-none" style={fieldStyle()}>
                {REVENUE_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </LabeledInput>
            <LabeledInput label="Cash segment">
              <select value={revenueSegment} onChange={e => setRevenueSegment(e.target.value)} className="px-2 py-1.5 rounded-lg text-sm outline-none" style={fieldStyle()}>
                {REVENUE_SEGMENT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </LabeledInput>
            <LabeledInput label="Processing fee">
              <input type="number" value={processingFee} onChange={e => setProcessingFee(e.target.value)} className="px-2 py-1.5 rounded-lg text-sm outline-none" style={fieldStyle()} />
            </LabeledInput>
            <LabeledInput label="Method">
              <select value={method} onChange={e => setMethod(e.target.value)} className="px-2 py-1.5 rounded-lg text-sm outline-none" style={fieldStyle()}>
                {METHOD_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </LabeledInput>
            <LabeledInput label="Stripe invoice id">
              <input value={stripeInvoiceId} onChange={e => setStripeInvoiceId(e.target.value)} placeholder="in_..." className="px-2 py-1.5 rounded-lg text-sm outline-none" style={fieldStyle()} />
            </LabeledInput>
            <div className="flex flex-col gap-1 justify-end">
              <button
                onClick={() => onPatch(billing.id, { amount_paid: Number(partial) || 0, ...paymentExtras() })}
                disabled={isBusy || !partial}
                className="text-xs font-semibold px-3 py-1.5 rounded"
                style={{ color: "#38bdf8", background: "rgba(56,189,248,0.1)", opacity: (isBusy || !partial) ? 0.5 : 1 }}
              >
                Record payment
              </button>
            </div>
            <div className="flex flex-col gap-1 justify-end">
              <button
                onClick={() => onPatch(billing.id, { status: "paid", ...paymentExtras() })}
                disabled={isBusy}
                className="text-xs font-semibold px-3 py-1.5 rounded"
                style={{ color: "#22c55e", background: "rgba(34,197,94,0.1)", opacity: isBusy ? 0.5 : 1 }}
              >
                Mark fully paid
              </button>
            </div>
            <div className="flex flex-col gap-1 justify-end">
              <button
                onClick={() => onPatch(billing.id, { is_extension: true, ...paymentExtras() })}
                disabled={isBusy || Boolean(billing.is_extension)}
                className="text-xs font-semibold px-3 py-1.5 rounded"
                style={{ color: "#a78bfa", background: "rgba(167,139,250,0.12)", opacity: (isBusy || billing.is_extension) ? 0.5 : 1 }}
              >
                Mark as extension
              </button>
            </div>
          </div>
        </div>

        {/* Adjust amounts */}
        <div className="space-y-2">
          <div className="text-xs uppercase tracking-wider" style={{ color: "#334155" }}>Adjust amounts</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
            <LabeledInput label="Base">
              <input type="number" value={base} onChange={e => setBase(e.target.value)} className="px-2 py-1.5 rounded-lg text-sm outline-none" style={fieldStyle()} />
            </LabeledInput>
            <LabeledInput label="Performance">
              <input type="number" value={performance} onChange={e => setPerformance(e.target.value)} className="px-2 py-1.5 rounded-lg text-sm outline-none" style={fieldStyle()} />
            </LabeledInput>
            <LabeledInput label="Discount">
              <input type="number" value={discount} onChange={e => setDiscount(e.target.value)} className="px-2 py-1.5 rounded-lg text-sm outline-none" style={fieldStyle()} />
            </LabeledInput>
            <div className="flex flex-col gap-1 justify-end">
              <div className="text-xs mb-1" style={{ color: "#94a3b8" }}>New total: {money(scheduledTotal)}</div>
              <button
                onClick={() => onPatch(billing.id, { base_amount: Number(base) || 0, performance_amount: Number(performance) || 0, discount: Number(discount) || 0 })}
                disabled={isBusy}
                className="text-xs font-semibold px-3 py-1.5 rounded"
                style={{ color: "#e2e8f0", background: "rgba(255,255,255,0.06)", opacity: isBusy ? 0.5 : 1 }}
              >
                Save amounts
              </button>
            </div>
          </div>
        </div>

        {/* Extend due date */}
        <div className="space-y-2">
          <div className="text-xs uppercase tracking-wider" style={{ color: "#334155" }}>Due date</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
            <LabeledInput label="Due date">
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="px-2 py-1.5 rounded-lg text-sm outline-none" style={fieldStyle()} />
            </LabeledInput>
            <div className="flex flex-col gap-1 justify-end">
              <button
                onClick={() => onPatch(billing.id, { due_date: dueDate })}
                disabled={isBusy}
                className="text-xs font-semibold px-3 py-1.5 rounded"
                style={{ color: "#e2e8f0", background: "rgba(255,255,255,0.06)", opacity: isBusy ? 0.5 : 1 }}
              >
                Update
              </button>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 flex-wrap pt-1 border-t" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
          <button
            onClick={() => onPatch(billing.id, { status: "pending" })}
            disabled={isBusy}
            className="text-xs font-semibold px-3 py-1.5 rounded"
            style={{ color: "#f59e0b", background: "rgba(245,158,11,0.1)", opacity: isBusy ? 0.5 : 1 }}
          >
            Issue billing
          </button>
          <button
            onClick={() => onDelete(billing.id)}
            disabled={isBusy}
            className="text-xs px-3 py-1.5 rounded"
            style={{ color: "#475569" }}
          >
            Void
          </button>
        </div>
      </div>
    );
  }

  // ── Issued billing editor (pending / partial / overdue / failed) ─────────
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <LabeledInput label="Revenue type">
          <select value={revenueType} onChange={e => setRevenueType(e.target.value)} className="px-2 py-1.5 rounded-lg text-sm outline-none" style={fieldStyle()}>
            {REVENUE_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </LabeledInput>
        <LabeledInput label="Cash segment">
          <select value={revenueSegment} onChange={e => setRevenueSegment(e.target.value)} className="px-2 py-1.5 rounded-lg text-sm outline-none" style={fieldStyle()}>
            {REVENUE_SEGMENT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </LabeledInput>
        <LabeledInput label="Processing fee">
          <input type="number" value={processingFee} onChange={e => setProcessingFee(e.target.value)} className="px-2 py-1.5 rounded-lg text-sm outline-none" style={fieldStyle()} />
        </LabeledInput>
        <LabeledInput label="Method">
          <select value={method} onChange={e => setMethod(e.target.value)} className="px-2 py-1.5 rounded-lg text-sm outline-none" style={fieldStyle()}>
            {METHOD_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </LabeledInput>
        <LabeledInput label="Stripe invoice id">
          <input value={stripeInvoiceId} onChange={e => setStripeInvoiceId(e.target.value)} placeholder="in_..." className="px-2 py-1.5 rounded-lg text-sm outline-none" style={fieldStyle()} />
        </LabeledInput>
      </div>
      {/* Quick-action buttons */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => onPatch(billing.id, { status: "paid", ...paymentExtras() })}
          disabled={isBusy}
          className="text-xs font-semibold px-3 py-1.5 rounded"
          style={{ color: "#22c55e", background: "rgba(34,197,94,0.1)", opacity: isBusy ? 0.5 : 1 }}
        >
          Mark fully paid
        </button>
        <button
          onClick={() => onPatch(billing.id, { is_extension: true, ...paymentExtras() })}
          disabled={isBusy || Boolean(billing.is_extension)}
          className="text-xs font-semibold px-3 py-1.5 rounded"
          style={{ color: "#a78bfa", background: "rgba(167,139,250,0.12)", opacity: (isBusy || billing.is_extension) ? 0.5 : 1 }}
        >
          Mark as extension
        </button>
        <button
          onClick={() => onPatch(billing.id, { status: "failed" })}
          disabled={isBusy}
          className="text-xs font-semibold px-3 py-1.5 rounded"
          style={{ color: "#ef4444", background: "rgba(239,68,68,0.1)", opacity: isBusy ? 0.5 : 1 }}
        >
          Mark failed
        </button>
        <button
          onClick={() => onPatch(billing.id, { status: "refunded" })}
          disabled={isBusy}
          className="text-xs font-semibold px-3 py-1.5 rounded"
          style={{ color: "#94a3b8", background: "rgba(148,163,184,0.1)", opacity: isBusy ? 0.5 : 1 }}
        >
          Refund
        </button>
        <button
          onClick={() => onPatch(billing.id, { status: "pending", paid_on: null, amount_paid: 0 })}
          disabled={isBusy}
          className="text-xs font-semibold px-3 py-1.5 rounded"
          style={{ color: "#f59e0b", background: "rgba(245,158,11,0.1)", opacity: isBusy ? 0.5 : 1 }}
        >
          Reopen / reset
        </button>
        <button
          onClick={() => onDelete(billing.id)}
          disabled={isBusy}
          className="text-xs px-3 py-1.5 rounded"
          style={{ color: "#475569" }}
        >
          Void
        </button>
      </div>

      {/* Partial payment */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
        <div className="md:col-span-4 text-xs uppercase tracking-wider" style={{ color: "#334155" }}>Record a partial payment</div>
        <LabeledInput label={`Amount paid (balance ${money(balance)})`}>
          <input
            type="number"
            value={partial}
            onChange={e => setPartial(e.target.value)}
            className="px-2 py-1.5 rounded-lg text-sm outline-none"
            style={fieldStyle()}
          />
        </LabeledInput>
        <div>
          <button
            onClick={() => onPatch(billing.id, { amount_paid: Number(partial) || 0 })}
            disabled={isBusy}
            className="text-xs font-semibold px-3 py-1.5 rounded"
            style={{ color: "#38bdf8", background: "rgba(56,189,248,0.1)", opacity: isBusy ? 0.5 : 1 }}
          >
            Save payment
          </button>
        </div>
      </div>

      {/* Adjust amounts (includes discount) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
        <div className="md:col-span-4 text-xs uppercase tracking-wider" style={{ color: "#334155" }}>Adjust amounts</div>
        <LabeledInput label="Base">
          <input type="number" value={base} onChange={e => setBase(e.target.value)} className="px-2 py-1.5 rounded-lg text-sm outline-none" style={fieldStyle()} />
        </LabeledInput>
        <LabeledInput label="Performance">
          <input type="number" value={performance} onChange={e => setPerformance(e.target.value)} className="px-2 py-1.5 rounded-lg text-sm outline-none" style={fieldStyle()} />
        </LabeledInput>
        <LabeledInput label="Late fee">
          <input type="number" value={lateFee} onChange={e => setLateFee(e.target.value)} className="px-2 py-1.5 rounded-lg text-sm outline-none" style={fieldStyle()} />
        </LabeledInput>
        <LabeledInput label="Discount">
          <input type="number" value={discount} onChange={e => setDiscount(e.target.value)} placeholder="0" className="px-2 py-1.5 rounded-lg text-sm outline-none" style={fieldStyle()} />
        </LabeledInput>
        <div>
          <button
            onClick={() => onPatch(billing.id, {
              base_amount: Number(base) || 0,
              performance_amount: Number(performance) || 0,
              late_fee: Number(lateFee) || 0,
              discount: Number(discount) || 0,
            })}
            disabled={isBusy}
            className="text-xs font-semibold px-3 py-1.5 rounded"
            style={{ color: "#e2e8f0", background: "rgba(255,255,255,0.06)", opacity: isBusy ? 0.5 : 1 }}
          >
            Save amounts
          </button>
        </div>
      </div>

      {/* Extend due date */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
        <div className="md:col-span-4 text-xs uppercase tracking-wider" style={{ color: "#334155" }}>Extend due date</div>
        <LabeledInput label="Due date">
          <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="px-2 py-1.5 rounded-lg text-sm outline-none" style={fieldStyle()} />
        </LabeledInput>
        <div>
          <button
            onClick={() => onPatch(billing.id, { due_date: dueDate })}
            disabled={isBusy}
            className="text-xs font-semibold px-3 py-1.5 rounded"
            style={{ color: "#e2e8f0", background: "rgba(255,255,255,0.06)", opacity: isBusy ? 0.5 : 1 }}
          >
            Extend
          </button>
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
    ? ["Client", "Amount", "Billed", "Paid on", "Method", "Status", "Action"]
    : ["Client", "Billed", "Paid on", "Method", "Status"];

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
                <th
                  key={i}
                  className="sticky z-10 text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider"
                  style={{ ...stickyThStyle(), color: "#334155" }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={headers.length} className="px-4 py-6 text-center text-xs" style={{ color: "#334155" }}>
                  No paid billings yet.
                </td>
              </tr>
            ) : rows.map((r, i) => {
              const b = r.billing;
              const isBusy = busy === b.id;
              const sub = canViewRevenue ? breakdownLabel(b) : null;
              return (
                <tr
                  key={b.id}
                  style={{ background: i % 2 === 0 ? "#080f1e" : "#060d1a", borderTop: "1px solid rgba(255,255,255,0.04)" }}
                >
                  <td className="px-4 py-3 font-medium" style={{ color: "#e2e8f0" }}>
                    {r.client.name}
                    {!r.client.lifecycle_status || r.client.lifecycle_status !== "active" ? (
                      <span className="ml-2 text-xs" style={{ color: "#475569" }}>({r.client.lifecycle_status})</span>
                    ) : null}
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
                        <button
                          onClick={() => onPatch(b.id, { status: "refunded" })}
                          disabled={isBusy}
                          className="text-xs font-semibold mr-3"
                          style={{ color: "#94a3b8" }}
                        >
                          Refund
                        </button>
                      )}
                      <button
                        onClick={() => onPatch(b.id, { status: "pending", paid_on: null, amount_paid: 0 })}
                        disabled={isBusy}
                        className="text-xs mr-3"
                        style={{ color: "#f59e0b" }}
                      >
                        Reopen
                      </button>
                      <button
                        onClick={() => onDelete(b.id)}
                        disabled={isBusy}
                        className="text-xs"
                        style={{ color: "#475569" }}
                      >
                        Void
                      </button>
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
  clients, busy, canViewRevenue, onPatch, onPauseBilling, onRequestPause, onRequestOffboard,
}: {
  clients: ClientBilling[];
  busy: string | null;
  canViewRevenue: boolean;
  onPatch: (clientId: string, body: Record<string, unknown>) => void;
  onPauseBilling: (client: ClientBilling) => void;
  onRequestPause: (clientId: string, clientName: string) => void;
  onRequestOffboard: (clientId: string) => void;
}) {
  const inQueue = clients
    .filter(c => isInBillingQueue(c))
    .sort((a, b) => a.name.localeCompare(b.name));
  const needsSetup = inQueue.filter(c => !isCadenceLocked(c));
  const locked = inQueue.filter(c => isCadenceLocked(c));

  const headers = canViewRevenue
    ? ["Client", "Model", "Base $", "$/conversation", "$/bailed", "Due day (1–31)", "Suggested next", "Actions"]
    : ["Client", "Model", "Due day (1–31)", "Suggested next", "Actions"];

  const rowProps = { busy, canViewRevenue, onPatch, onPauseBilling, onRequestPause, onRequestOffboard, headers };

  return (
    <div className="space-y-6">
      <p className="text-xs px-1" style={{ color: "#94a3b8" }}>
        No Lock button — fill <strong style={{ color: "#e2e8f0" }}>Due day (1–31)</strong>
        {canViewRevenue ? <> (and Performance rates)</> : null}, then blur/tab out of the field.
        The client moves to Locked automatically. The Suggested next column is computed, not editable.
      </p>
      <SetupGroup
        title="Needs setup"
        accent="#a78bfa"
        hint="Enter Due day below. For Performance also set $/conversation or $/bailed."
        clients={needsSetup}
        emptyText="All active clients have locked billing cadence."
        {...rowProps}
      />
      <SetupGroup
        title="Locked"
        accent="#22c55e"
        hint="Cadence is set — that due day repeats every month until pause or churn."
        clients={locked}
        emptyText="No locked clients yet."
        {...rowProps}
      />
    </div>
  );
}

function SetupGroup({
  title, accent, hint, clients, emptyText, headers, busy, canViewRevenue,
  onPatch, onPauseBilling, onRequestPause, onRequestOffboard,
}: {
  title: string;
  accent: string;
  hint: string;
  clients: ClientBilling[];
  emptyText: string;
  headers: string[];
  busy: string | null;
  canViewRevenue: boolean;
  onPatch: (clientId: string, body: Record<string, unknown>) => void;
  onPauseBilling: (client: ClientBilling) => void;
  onRequestPause: (clientId: string, clientName: string) => void;
  onRequestOffboard: (clientId: string) => void;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2 px-1">
        <span className="w-2.5 h-2.5 rounded-full" style={{ background: accent }} />
        <h3 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "#cbd5e1" }}>
          {title}
        </h3>
        <span className="text-xs" style={{ color: "#475569" }}>({clients.length})</span>
      </div>
      <p className="text-xs mb-2 px-1" style={{ color: "#64748b" }}>{hint}</p>
      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: "#081225" }}>
              {headers.map((h, i) => (
                <th
                  key={i}
                  className="sticky z-10 text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider"
                  style={{ ...stickyThStyle("#081225"), color: "#334155" }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {clients.length === 0 ? (
              <tr>
                <td
                  colSpan={headers.length}
                  className="px-4 py-6 text-center text-xs"
                  style={{ color: "#334155" }}
                >
                  {emptyText}
                </td>
              </tr>
            ) : (
              clients.map((c, i) => {
                const isBusy = busy === `cfg-${c.id}`;
                const locked = isCadenceLocked(c);
                return (
                  <tr
                    key={c.id}
                    style={{ background: i % 2 === 0 ? "#080f1e" : "#060d1a", borderTop: "1px solid rgba(255,255,255,0.04)" }}
                  >
                    <td className="px-4 py-2.5 font-medium" style={{ color: "#e2e8f0" }}>
                      {c.name}
                      {!locked && (
                        <>
                          <div className="text-[10px] mt-0.5 font-semibold" style={{ color: "#a78bfa" }}>
                            Pending setup
                          </div>
                          <div className="text-[10px] mt-0.5" style={{ color: "#f59e0b" }}>
                            {cadenceSetupHint(c)}
                          </div>
                        </>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <select
                        value={c.billing_model ?? "fixed"}
                        disabled={isBusy}
                        onChange={e => onPatch(c.id, { billing_model: e.target.value })}
                        className="px-2 py-1 rounded-lg text-xs outline-none cursor-pointer"
                        style={fieldStyle()}
                      >
                        <option value="fixed">Fixed retainer</option>
                        <option value="performance">Performance</option>
                      </select>
                    </td>
                    {canViewRevenue && (
                      <>
                        <td className="px-4 py-2.5">
                          <input
                            type="number"
                            defaultValue={c.mrr ?? ""}
                            disabled={isBusy}
                            onBlur={e => { if (String(c.mrr ?? "") !== e.target.value) onPatch(c.id, { mrr: e.target.value }); }}
                            placeholder="0"
                            className="px-2 py-1 rounded-lg text-xs outline-none w-20"
                            style={fieldStyle()}
                          />
                        </td>
                        <td className="px-4 py-2.5">
                          <input
                            type="number"
                            defaultValue={c.pay_per_show ?? ""}
                            disabled={isBusy || isFixedBilling(c.billing_model)}
                            onBlur={e => { if (String(c.pay_per_show ?? "") !== e.target.value) onPatch(c.id, { pay_per_show: e.target.value }); }}
                            placeholder="—"
                            title="$/conversation (shows + live transfers)"
                            className="px-2 py-1 rounded-lg text-xs outline-none w-20"
                            style={fieldStyle()}
                          />
                        </td>
                        <td className="px-4 py-2.5">
                          <input
                            type="number"
                            defaultValue={c.pay_per_bailed ?? ""}
                            disabled={isBusy || isFixedBilling(c.billing_model)}
                            onBlur={e => { if (String(c.pay_per_bailed ?? "") !== e.target.value) onPatch(c.id, { pay_per_bailed: e.target.value }); }}
                            placeholder="—"
                            className="px-2 py-1 rounded-lg text-xs outline-none w-20"
                            style={fieldStyle()}
                          />
                        </td>
                      </>
                    )}
                    <td className="px-4 py-2.5">
                      <input
                        type="number"
                        min={1}
                        max={31}
                        defaultValue={c.billing_day ?? ""}
                        disabled={isBusy}
                        onBlur={e => { if (String(c.billing_day ?? "") !== e.target.value) onPatch(c.id, { billing_day: e.target.value }); }}
                        placeholder="e.g. 1"
                        title={isPerformanceBilling(c.billing_model) ? "Report due day (1-31) — required to lock" : "Billing day (1-31) — required to lock"}
                        className="px-2 py-1 rounded-lg text-xs outline-none w-16"
                        style={{
                          ...fieldStyle(),
                          ...(c.billing_day == null || !(Number(c.billing_day) >= 1)
                            ? { border: "1px solid rgba(167,139,250,0.55)", boxShadow: "0 0 0 1px rgba(167,139,250,0.15)" }
                            : {}),
                        }}
                      />
                    </td>
                    <td className="px-4 py-2.5 text-xs" style={{ color: "#64748b" }} title="Computed from due day / history — not the lock field">
                      {c.suggested_next_date ?? (c.next_billing_date ?? "—")}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <button
                        onClick={() => onPauseBilling(c)}
                        disabled={isBusy}
                        className="text-xs font-semibold mr-3"
                        style={{ color: "#fbbf24" }}
                        title="Remove from billing queue without changing client lifecycle"
                      >
                        Pause billing
                      </button>
                      <button
                        onClick={() => onRequestPause(c.id, c.name)}
                        disabled={isBusy}
                        className="text-xs font-semibold mr-3"
                        style={{ color: "#f59e0b" }}
                        title="Pause client lifecycle (moves to inactive roster)"
                      >
                        Pause client
                      </button>
                      <button
                        onClick={() => onRequestOffboard(c.id)}
                        disabled={isBusy}
                        className="text-xs font-semibold"
                        style={{ color: "#ef4444" }}
                      >
                        Churn
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// InactiveTable: shows paused / churned clients with any open billing rows
// so nothing slips through the cracks during off-boarding.
function formatPausedAt(iso: string | null): string {
  if (!iso) return "—";
  return iso.slice(0, 10);
}

function BillingPausedPanel({
  clients, busy, canViewRevenue, onUnpause, onUnpauseAndSchedule, onClose,
}: {
  clients: ClientBilling[];
  busy: string | null;
  canViewRevenue: boolean;
  onUnpause: (clientId: string) => void;
  onUnpauseAndSchedule: (client: ClientBilling, opts: ScheduleOpts) => void;
  onClose: () => void;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ border: "1px solid rgba(245,158,11,0.25)", background: "#0a1628" }}
    >
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ borderBottom: "1px solid rgba(245,158,11,0.15)" }}
      >
        <div>
          <h3 className="text-sm font-semibold" style={{ color: "#fbbf24" }}>
            Billing paused
          </h3>
          <p className="text-xs mt-0.5" style={{ color: "#64748b" }}>
            These clients stay active in the roster but are excluded from Past Due and Upcoming until billing resumes.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-xs font-semibold px-2 py-1 rounded"
          style={{ color: "#64748b" }}
        >
          Close
        </button>
      </div>

      {clients.length === 0 ? (
        <p className="px-4 py-8 text-center text-xs" style={{ color: "#475569" }}>
          No clients with billing paused.
        </p>
      ) : (
        <div className="divide-y" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
          {clients.map((c, i) => {
            const isBusy = busy === `cfg-${c.id}` || busy === `sch-${c.id}`;
            const expanded = expandedId === c.id;
            return (
              <div
                key={c.id}
                style={{ background: i % 2 === 0 ? "#080f1e" : "#060d1a" }}
              >
                <div className="flex items-center gap-4 px-4 py-3 flex-wrap">
                  <span className="font-medium text-sm" style={{ color: "#e2e8f0" }}>{c.name}</span>
                  {canViewRevenue && (
                    <span className="text-xs" style={{ color: "#94a3b8" }}>
                      MRR {money(c.mrr)}
                    </span>
                  )}
                  <span className="text-xs" style={{ color: "#64748b" }}>
                    Paused {formatPausedAt(c.billing_paused_at)}
                  </span>
                  {c.billing_paused_note && (
                    <span className="text-xs italic" style={{ color: "#475569" }}>
                      &ldquo;{c.billing_paused_note}&rdquo;
                    </span>
                  )}
                  <div className="ml-auto flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => onUnpause(c.id)}
                      disabled={isBusy}
                      className="text-xs font-semibold px-3 py-1.5 rounded"
                      style={{ color: "#22c55e", background: "rgba(34,197,94,0.1)", opacity: isBusy ? 0.5 : 1 }}
                    >
                      Unpause
                    </button>
                    {canViewRevenue && (
                      <button
                        type="button"
                        onClick={() => setExpandedId(expanded ? null : c.id)}
                        disabled={isBusy}
                        className="text-xs font-semibold px-3 py-1.5 rounded"
                        style={{ color: "#818cf8", background: "rgba(129,140,248,0.1)", opacity: isBusy ? 0.5 : 1 }}
                      >
                        {expanded ? "Close" : "Unpause & schedule"}
                      </button>
                    )}
                  </div>
                </div>

                {expanded && canViewRevenue && (
                  <div className="px-4 pb-4">
                    <ScheduleEditor
                      client={c}
                      busy={busy}
                      submitLabel="Unpause & schedule billing"
                      busyLabel="Saving…"
                      onSchedule={(opts) => {
                        onUnpauseAndSchedule(c, opts);
                        setExpandedId(null);
                      }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function InactiveTable({
  clients, busy, canViewRevenue, onPatch, onPatchBilling, onDelete,
}: {
  clients: ClientBilling[];
  busy: string | null;
  canViewRevenue: boolean;
  onPatch: (clientId: string, body: Record<string, unknown>) => void;
  onPatchBilling: (id: string, body: Record<string, unknown>) => void;
  onDelete: (id: string) => void;
}) {
  if (clients.length === 0) {
    return (
      <p className="px-4 py-6 text-center text-xs" style={{ color: "#334155" }}>
        No paused or churned clients.
      </p>
    );
  }

  return (
    <div className="space-y-0 divide-y" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
      {clients.map((c, ci) => {
        const isBusy = busy === `cfg-${c.id}`;
        const openBillings = c.billings.filter(b => {
          const s = recordedState(b);
          return s !== "paid" && s !== "refunded";
        });
        const outstanding = openBillings.reduce((sum, b) => sum + balanceOf(b), 0);

        return (
          <div
            key={c.id}
            style={{ background: ci % 2 === 0 ? "#080f1e" : "#060d1a" }}
          >
            {/* Client summary row */}
            <div className="flex items-center gap-4 px-4 py-3 flex-wrap">
              <span className="font-medium text-sm" style={{ color: "#e2e8f0" }}>{c.name}</span>

              <span
                className="px-2 py-0.5 rounded-full text-xs font-semibold"
                style={
                  c.lifecycle_status === "churned"
                    ? { color: "#ef4444", background: "rgba(239,68,68,0.12)" }
                    : { color: "#f59e0b", background: "rgba(245,158,11,0.12)" }
                }
              >
                {c.lifecycle_status ?? "inactive"}
              </span>

              {canViewRevenue && outstanding > 0 && (
                <span className="text-xs font-semibold" style={{ color: "#f59e0b" }}>
                  {money(outstanding)} outstanding
                </span>
              )}

              {canViewRevenue && outstanding === 0 && (
                <span className="text-xs" style={{ color: "#334155" }}>No open balance</span>
              )}

              <button
                onClick={() => onPatch(c.id, { lifecycle_status: "active" })}
                disabled={isBusy}
                className="text-xs font-semibold ml-auto"
                style={{ color: "#22c55e" }}
              >
                Reactivate
              </button>
            </div>

            {/* Open billing rows for this client */}
            {openBillings.length > 0 && (
              <div className="border-t mx-4 mb-3" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                <p className="text-xs pt-2 pb-1" style={{ color: "#475569" }}>
                  Open billings — client is {c.lifecycle_status}, resolve before closing:
                </p>
                <table className="w-full text-xs">
                  <thead>
                    <tr>
                      <th className="text-left py-1 pr-4 font-semibold uppercase tracking-wider" style={{ color: "#334155" }}>Due date</th>
                      {canViewRevenue && <th className="text-left py-1 pr-4 font-semibold uppercase tracking-wider" style={{ color: "#334155" }}>Amount</th>}
                      {canViewRevenue && <th className="text-left py-1 pr-4 font-semibold uppercase tracking-wider" style={{ color: "#334155" }}>Balance</th>}
                      <th className="text-left py-1 pr-4 font-semibold uppercase tracking-wider" style={{ color: "#334155" }}>Status</th>
                      {canViewRevenue && <th className="text-right py-1 font-semibold uppercase tracking-wider" style={{ color: "#334155" }}>Action</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {openBillings.map(b => {
                      const bBusy = busy === b.id;
                      const state = recordedState(b);
                      return (
                        <tr key={b.id} style={{ borderTop: "1px solid rgba(255,255,255,0.03)" }}>
                          <td className="py-1.5 pr-4" style={{ color: "#94a3b8" }}>
                            {b.due_date ?? b.billed_on}
                            <span className="ml-2 text-xs" style={{ color: "#475569" }}>{relativeLabel(b.due_date ?? b.billed_on)}</span>
                          </td>
                          {canViewRevenue && <td className="py-1.5 pr-4" style={{ color: "#e2e8f0" }}>{money(b.amount)}</td>}
                          {canViewRevenue && <td className="py-1.5 pr-4" style={{ color: balanceOf(b) > 0 ? "#f59e0b" : "#94a3b8" }}>{money(balanceOf(b))}</td>}
                          <td className="py-1.5 pr-4"><StatusBadge status={state} /></td>
                          {canViewRevenue && (
                            <td className="py-1.5 text-right whitespace-nowrap">
                              <button
                                onClick={() => onPatchBilling(b.id, { status: "paid" })}
                                disabled={bBusy}
                                className="font-semibold mr-3"
                                style={{ color: "#22c55e" }}
                              >
                                Mark paid
                              </button>
                              <button
                                onClick={() => onDelete(b.id)}
                                disabled={bBusy}
                                style={{ color: "#475569" }}
                              >
                                Void
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

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
  const [revenueType, setRevenueType] = useState("mrr");
  const [revenueSegment, setRevenueSegment] = useState("back_end");
  const [termMonths, setTermMonths] = useState("");
  const [processingFee, setProcessingFee] = useState("0");
  const [method, setMethod] = useState("stripe");
  const [stripeInvoiceId, setStripeInvoiceId] = useState("");
  const [note, setNote] = useState("");
  const [justRecorded, setJustRecorded] = useState(false);

  const client = sorted.find(c => c.id === clientId) ?? null;
  const total = (Number(retainer) || 0) + (Number(performance) || 0) - (Number(discount) || 0);
  const isBusy = client ? busy === `rec-${client.id}` : false;
  const pifNeedsTerm = revenueType === "pif" && !(Number(termMonths) > 0);
  const disabled = isBusy || !client || total <= 0 || !paymentDate || pifNeedsTerm;

  function onClientChange(id: string) {
    setClientId(id);
    setJustRecorded(false);
    const c = sorted.find(x => x.id === id);
    if (c) {
      setRevenueType(defaultRevenueType(c.billing_type));
      setTermMonths(c.billing_type === "pif" ? String(c.contract_term_months ?? "") : "");
      if (c.mrr != null) setRetainer(String(c.mrr));
    }
  }

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
      revenue_type: revenueType,
      revenue_segment: revenueSegment,
      term_months: Number(termMonths) || undefined,
      processing_fee: Number(processingFee) || undefined,
      method: method || undefined,
      stripe_invoice_id: stripeInvoiceId.trim() || undefined,
      note: note || undefined,
    });
    setJustRecorded(true);
    setRetainer("");
    setPerformance("0");
    setDiscount("0");
    setProcessingFee("0");
    setStripeInvoiceId("");
    setNote("");
  }

  return (
    <div className="rounded-xl p-5 space-y-4" style={{ background: "#0a1628", border: "1px solid rgba(56,189,248,0.2)" }}>
      <div>
        <h3 className="text-sm font-semibold" style={{ color: "#e2e8f0" }}>Record a past payment</h3>
        <p className="text-xs mt-1" style={{ color: "#475569" }}>
          Log a billing from a while back. Tag type / segment so CEO new vs recurring cash stays accurate.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <LabeledInput label="Client">
          <select
            value={clientId}
            onChange={e => onClientChange(e.target.value)}
            className="px-2 py-1.5 rounded-lg text-sm outline-none cursor-pointer"
            style={fieldStyle()}
          >
            <option value="">Select client…</option>
            {sorted.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </LabeledInput>
        <LabeledInput label="Due date of payment">
          <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="px-2 py-1.5 rounded-lg text-sm outline-none" style={fieldStyle()} />
        </LabeledInput>
        <LabeledInput label="Date payment conducted">
          <input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} className="px-2 py-1.5 rounded-lg text-sm outline-none" style={fieldStyle()} />
        </LabeledInput>
        <LabeledInput label="Total retainer">
          <input type="number" value={retainer} onChange={e => { setRetainer(e.target.value); setJustRecorded(false); }} placeholder="0" className="px-2 py-1.5 rounded-lg text-sm outline-none" style={fieldStyle()} />
        </LabeledInput>
        <LabeledInput label="Total performance fee">
          <input type="number" value={performance} onChange={e => { setPerformance(e.target.value); setJustRecorded(false); }} className="px-2 py-1.5 rounded-lg text-sm outline-none" style={fieldStyle()} />
        </LabeledInput>
        <LabeledInput label="Amount discounted">
          <input type="number" value={discount} onChange={e => { setDiscount(e.target.value); setJustRecorded(false); }} className="px-2 py-1.5 rounded-lg text-sm outline-none" style={fieldStyle()} />
        </LabeledInput>
        <LabeledInput label="Revenue type">
          <select value={revenueType} onChange={e => setRevenueType(e.target.value)} className="px-2 py-1.5 rounded-lg text-sm outline-none" style={fieldStyle()}>
            {REVENUE_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </LabeledInput>
        <LabeledInput label="Cash segment">
          <select value={revenueSegment} onChange={e => setRevenueSegment(e.target.value)} className="px-2 py-1.5 rounded-lg text-sm outline-none" style={fieldStyle()}>
            {REVENUE_SEGMENT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </LabeledInput>
        {revenueType === "pif" && (
          <LabeledInput label="Term months">
            <input type="number" value={termMonths} onChange={e => setTermMonths(e.target.value)} className="px-2 py-1.5 rounded-lg text-sm outline-none" style={fieldStyle()} />
          </LabeledInput>
        )}
        <LabeledInput label="Processing fee">
          <input type="number" value={processingFee} onChange={e => setProcessingFee(e.target.value)} className="px-2 py-1.5 rounded-lg text-sm outline-none" style={fieldStyle()} />
        </LabeledInput>
        <LabeledInput label="Method">
          <select value={method} onChange={e => setMethod(e.target.value)} className="px-2 py-1.5 rounded-lg text-sm outline-none" style={fieldStyle()}>
            {METHOD_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </LabeledInput>
        <LabeledInput label="Stripe invoice id">
          <input value={stripeInvoiceId} onChange={e => setStripeInvoiceId(e.target.value)} placeholder="in_..." className="px-2 py-1.5 rounded-lg text-sm outline-none" style={fieldStyle()} />
        </LabeledInput>
        <LabeledInput label="Note">
          <input value={note} onChange={e => setNote(e.target.value)} className="px-2 py-1.5 rounded-lg text-sm outline-none" style={fieldStyle()} />
        </LabeledInput>
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        <span className="text-sm" style={{ color: "#cbd5e1" }}>
          Total collected: <strong style={{ color: "#e2e8f0" }}>{money(total)}</strong>
        </span>
        <button
          onClick={submit}
          disabled={disabled}
          className="text-xs font-semibold px-4 py-2 rounded-lg"
          style={{
            color: "#22c55e",
            background: "rgba(34,197,94,0.1)",
            border: "1px solid rgba(34,197,94,0.25)",
            opacity: disabled ? 0.5 : 1,
          }}
        >
          {isBusy ? "Recording…" : "Record payment"}
        </button>
        {justRecorded && !isBusy && (
          <span className="text-xs" style={{ color: "#22c55e" }}>Recorded — see the Paid section below.</span>
        )}
      </div>
    </div>
  );
}

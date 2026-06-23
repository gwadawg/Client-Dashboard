"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import StatusChangeModal from "@/components/StatusChangeModal";
import { useNavigateChurnOffboard } from "@/hooks/useNavigateChurnOffboard";
import ViewHub from "@/components/nav/ViewHub";
import PerformanceBilling from "@/components/billing/PerformanceBilling";
import { isFixedBilling, isPerformanceBilling } from "@/lib/billing-model";
import type { ClientBilling, RecordOpts, RecordedRow, ScheduleOpts, WorkRow } from "@/components/billing/billing-types";

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

function isBillingPaused(c: ClientBilling): boolean {
  return isActive(c) && !!c.billing_paused;
}

export default function BillingManager({ canViewRevenue: initialCanViewRevenue = false }: { canViewRevenue?: boolean }) {
  const [clients, setClients] = useState<ClientBilling[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [showSetup, setShowSetup] = useState(true);
  const [showInactive, setShowInactive] = useState(false);
  const [showBillingPaused, setShowBillingPaused] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [billingTab, setBillingTab] = useState<"fixed" | "performance">("fixed");
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

  // recordBilling: creates a live billing (pending or paid immediately).
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
        method: opts.method || undefined,
        note: opts.note || undefined,
        status: opts.markPaid ? "paid" : "scheduled",
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
        method: opts.method || undefined,
        note: opts.note || undefined,
        status: opts.markPaid ? "paid" : "scheduled",
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

  // Bucket all billing data into display sections.
  //
  // Only ACTIVE clients appear in the main worklist (Past Due / Upcoming).
  // Inactive clients' open billings are surfaced only in the InactiveTable so
  // they don't pollute the primary queue.
  //
  // Scheduled billings are bucketed by their due date: past-due-date scheduled
  // billings go to Past Due (overdue collection needed), future ones go to
  // Upcoming. Their badge always shows "scheduled" so it's clear no invoice has
  // been issued yet.
  //
  // Active clients with no open or scheduled billing get a SchedulePromptRow in
  // Upcoming — a "File next billing" entry that lets you commit the next cycle.
  const { pastDue, upcoming, paid } = useMemo(() => {
    const pastDue: WorkRow[] = [];
    const upcoming: WorkRow[] = [];
    const paid: RecordedRow[] = [];

    for (const c of clients) {
      if (!isFixedBilling(c.billing_model)) continue;
      if (isInBillingQueue(c)) {
        let hasOpenOrScheduled = false;

        for (const b of c.billings) {
          const state = recordedState(b);

          if (state === "paid" || state === "refunded") {
            paid.push({ kind: "recorded", client: c, billing: b });
          } else if (state === "scheduled") {
            hasOpenOrScheduled = true;
            const days = daysFromToday(b.due_date ?? b.billed_on);
            (days !== null && days < 0 ? pastDue : upcoming).push({ kind: "recorded", client: c, billing: b });
          } else if (state === "overdue" || state === "failed") {
            hasOpenOrScheduled = true;
            pastDue.push({ kind: "recorded", client: c, billing: b });
          } else {
            // pending, partial
            hasOpenOrScheduled = true;
            upcoming.push({ kind: "recorded", client: c, billing: b });
          }
        }

        if (!hasOpenOrScheduled) {
          upcoming.push({ kind: "schedule_prompt", client: c });
        }
      } else if (isFixedBilling(c.billing_model)) {
        // Inactive fixed clients: only contribute to paid history.
        for (const b of c.billings) {
          const state = recordedState(b);
          if (state === "paid" || state === "refunded") {
            paid.push({ kind: "recorded", client: c, billing: b });
          }
        }
      }
    }

    const dueKey = (r: WorkRow) =>
      r.kind === "schedule_prompt"
        ? (r.client.suggested_next_date ?? r.client.next_billing_date ?? "9999")
        : (r.billing.due_date ?? r.billing.billed_on) ?? "";

    pastDue.sort((a, b) => dueKey(a).localeCompare(dueKey(b)));
    upcoming.sort((a, b) => dueKey(a).localeCompare(dueKey(b)));
    paid.sort((a, b) =>
      (b.billing.paid_on ?? b.billing.billed_on).localeCompare(a.billing.paid_on ?? a.billing.billed_on)
    );

    return { pastDue, upcoming, paid };
  }, [clients]);

  const inactive = useMemo(
    () => clients.filter(c => !isActive(c)).sort((a, b) => a.name.localeCompare(b.name)),
    [clients],
  );

  const billingPaused = useMemo(
    () => clients.filter(c => {
      if (!isBillingPaused(c)) return false;
      return billingTab === "performance"
        ? isPerformanceBilling(c.billing_model)
        : isFixedBilling(c.billing_model);
    }).sort((a, b) => a.name.localeCompare(b.name)),
    [clients, billingTab],
  );

  const fixedCount = useMemo(
    () => clients.filter(c => isActive(c) && isFixedBilling(c.billing_model) && !c.billing_paused).length,
    [clients],
  );
  const perfCount = useMemo(
    () => clients.filter(c => isActive(c) && isPerformanceBilling(c.billing_model) && !c.billing_paused).length,
    [clients],
  );

  if (loading) return <p className="text-sm py-8 text-center" style={{ color: "#334155" }}>Loading…</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold" style={{ color: "#e2e8f0" }}>Client Billing</h2>
          <p className="text-sm mt-0.5" style={{ color: "#475569" }}>
            Fixed retainer clients bill on schedule; performance clients bill after report send and a 3-day objection window.
            Only active clients appear in each queue — paused clients are in the panel below.
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

      {showImport && canViewRevenue && billingTab === "fixed" && (
        <RecordPastPaymentForm clients={clients.filter(c => isFixedBilling(c.billing_model))} busy={busy} onRecord={recordBilling} />
      )}

      <ViewHub
        tabs={[
          { key: "fixed", label: `Fixed retainer (${fixedCount})` },
          { key: "performance", label: `Performance (${perfCount})` },
        ]}
        activeTab={billingTab}
        onTabChange={k => setBillingTab(k as "fixed" | "performance")}
      >
        {billingTab === "fixed" ? (
          <>
            <WorklistSection
        title="Past Due"
        accent="#ef4444"
        emptyText="Nothing past due."
        rows={pastDue}
        busy={busy}
        canViewRevenue={canViewRevenue}
        onPatch={patchBilling}
        onDelete={voidBilling}
        onSchedule={scheduleBilling}
      />

      <WorklistSection
        title="Upcoming"
        accent="#f59e0b"
        emptyText="No upcoming billings in the queue."
        rows={upcoming}
        busy={busy}
        canViewRevenue={canViewRevenue}
        onPatch={patchBilling}
        onDelete={voidBilling}
        onSchedule={scheduleBilling}
      />

      <PaidSection rows={paid} busy={busy} canViewRevenue={canViewRevenue} onPatch={patchBilling} onDelete={voidBilling} />

      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
        <button
          onClick={() => setShowSetup(s => !s)}
          className="w-full flex items-center justify-between px-4 py-3 text-left"
          style={{ background: "#0a1628", color: "#cbd5e1" }}
        >
          <span className="text-sm font-semibold">Fixed clients — billing configuration</span>
          <span className="text-xs" style={{ color: "#475569" }}>{showSetup ? "Hide" : "Show"}</span>
        </button>
        {showSetup && (
          <SetupTable
            clients={clients}
            busy={busy}
            canViewRevenue={canViewRevenue}
            onPatch={patchClient}
            onPauseBilling={pauseClientBilling}
            onRequestPause={(clientId, clientName) =>
              setStatusChange({ clientId, clientName, targetStatus: "paused" })
            }
            onRequestOffboard={clientId => navigateChurnOffboard(clientId)}
            billingModelFilter="fixed"
          />
        )}
      </div>
          </>
        ) : (
          <PerformanceBilling
            clients={clients}
            canViewRevenue={canViewRevenue}
            busy={busy}
            setBusy={setBusy}
            onReloadClients={load}
            onPatchClient={patchClient}
            onPauseBilling={pauseClientBilling}
            onRequestPause={(clientId, clientName) =>
              setStatusChange({ clientId, clientName, targetStatus: "paused" })
            }
            onRequestOffboard={clientId => navigateChurnOffboard(clientId)}
          />
        )}
      </ViewHub>

      {/* Inactive clients — shared */}
      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
        <button
          onClick={() => setShowInactive(s => !s)}
          className="w-full flex items-center justify-between px-4 py-3 text-left"
          style={{ background: "#0a1628", color: "#cbd5e1" }}
        >
          <span className="text-sm font-semibold">
            Paused / Churned clients{" "}
            <span style={{ color: "#475569" }}>({inactive.length})</span>
          </span>
          <span className="text-xs" style={{ color: "#475569" }}>{showInactive ? "Hide" : "Show"}</span>
        </button>
        {showInactive && (
          <InactiveTable
            clients={inactive}
            busy={busy}
            canViewRevenue={canViewRevenue}
            onPatch={patchClient}
            onPatchBilling={patchBilling}
            onDelete={voidBilling}
          />
        )}
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

// ─── Sub-components ──────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const s = BILLING_STATUS_STYLE[status] ?? BILLING_STATUS_STYLE.pending;
  return (
    <span
      className="px-2 py-0.5 rounded-full text-xs font-semibold"
      style={{ color: s.color, background: s.bg }}
    >
      {status}
    </span>
  );
}

function WorklistSection({
  title, accent, emptyText, rows, busy, canViewRevenue, onPatch, onDelete, onSchedule,
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
}) {
  const headers = canViewRevenue
    ? ["Client", "Amount", "Paid", "Balance", "Due date", "When", "Status", "Action"]
    : ["Client", "Due date", "When", "Status", "Action"];
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
                  key={r.kind === "schedule_prompt" ? `sp-${r.client.id}` : r.billing.id}
                  row={r}
                  striped={i % 2 === 0}
                  busy={busy}
                  canViewRevenue={canViewRevenue}
                  onPatch={onPatch}
                  onDelete={onDelete}
                  onSchedule={onSchedule}
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
}: {
  row: WorkRow;
  striped: boolean;
  busy: string | null;
  canViewRevenue: boolean;
  onPatch: (id: string, body: Record<string, unknown>) => void;
  onDelete: (id: string) => void;
  onSchedule: (client: ClientBilling, opts: ScheduleOpts) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const colSpan = canViewRevenue ? 8 : 5;

  // Schedule-prompt rows get a subtly different background to signal "no
  // billing filed yet" without being alarming.
  const isPrompt = row.kind === "schedule_prompt";
  const rowBg = isPrompt
    ? (striped ? "rgba(129,140,248,0.04)" : "rgba(129,140,248,0.02)")
    : (striped ? "#080f1e" : "#060d1a");

  const dueDate = isPrompt
    ? (row.client.suggested_next_date ?? row.client.next_billing_date)
    : (row.billing.due_date ?? row.billing.billed_on);
  const amount  = isPrompt ? row.client.mrr                  : row.billing.amount;
  const paid    = isPrompt ? null                             : (Number(row.billing.amount_paid) || 0);
  const balance = isPrompt ? null                             : balanceOf(row.billing);
  const sub     = !isPrompt && canViewRevenue ? breakdownLabel(row.billing) : null;
  const state   = isPrompt ? null : recordedState(row.billing);

  const actionLabel = isPrompt
    ? "File billing"
    : (state === "scheduled" ? "Manage" : "Manage");

  return (
    <>
      <tr
        style={{
          background: rowBg,
          borderTop: "1px solid rgba(255,255,255,0.04)",
          opacity: isPrompt ? 0.75 : 1,
        }}
      >
        {/* Client name */}
        <td className="px-4 py-3">
          <span className="font-medium" style={{ color: isPrompt ? "#94a3b8" : "#e2e8f0" }}>
            {row.client.name}
          </span>
          {sub && <div className="text-xs mt-0.5" style={{ color: "#475569" }}>{sub}</div>}
          {isPrompt && (
            <div className="text-xs mt-0.5" style={{ color: "#475569" }}>
              No billing filed for this cycle
            </div>
          )}
        </td>

        {/* Revenue columns */}
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

        {/* Status badge */}
        <td className="px-4 py-3">
          {isPrompt ? (
            <span
              className="px-2 py-0.5 rounded-full text-xs font-semibold"
              style={{
                color: "#818cf8",
                background: "rgba(129,140,248,0.08)",
                border: "1px dashed rgba(129,140,248,0.3)",
              }}
            >
              unscheduled
            </span>
          ) : (
            <StatusBadge status={state!} />
          )}
        </td>

        {/* Action */}
        <td className="px-4 py-3 text-right whitespace-nowrap">
          {canViewRevenue ? (
            <button
              onClick={() => setExpanded(e => !e)}
              className="text-xs font-semibold"
              style={{ color: isPrompt ? "#818cf8" : "#60a5fa" }}
            >
              {expanded ? "Close" : actionLabel}
            </button>
          ) : (
            <span className="text-xs" style={{ color: "#334155" }}>—</span>
          )}
        </td>
      </tr>

      {/* Expanded editor */}
      {expanded && canViewRevenue && (
        <tr style={{ background: "#04101f" }}>
          <td colSpan={colSpan} className="px-4 py-4">
            {isPrompt ? (
              <ScheduleEditor
                client={row.client}
                busy={busy}
                onSchedule={(opts) => { onSchedule(row.client, opts); setExpanded(false); }}
              />
            ) : (
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
  client, busy, onSchedule, submitLabel, busyLabel, showMarkPaid = true,
}: {
  client: ClientBilling;
  busy: string | null;
  onSchedule: (opts: ScheduleOpts) => void;
  submitLabel?: string;
  busyLabel?: string;
  showMarkPaid?: boolean;
}) {
  const suggestedDate = client.suggested_next_date ?? client.next_billing_date ?? todayYmd();
  const [base, setBase] = useState(String(client.mrr ?? ""));
  const [performance, setPerformance] = useState("0");
  const [discount, setDiscount] = useState("0");
  const [dueDate, setDueDate] = useState(suggestedDate);
  const [note, setNote] = useState("");

  const schedKey = `sch-${client.id}`;
  const total = Math.max(0,
    (Number(base) || 0) + (Number(performance) || 0) - (Number(discount) || 0)
  );
  const disabled = busy === schedKey || total <= 0;

  return (
    <div className="space-y-3">
      <p className="text-xs px-3 py-2 rounded-lg" style={{ color: "#818cf8", background: "rgba(129,140,248,0.08)", border: "1px solid rgba(129,140,248,0.2)" }}>
        Filing a billing commits this cycle to the queue. You can adjust the amounts or due date later before recording payment.
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
        <LabeledInput label="Note (optional)">
          <input
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="e.g. discounted month"
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
          onClick={() => onSchedule({ base: Number(base) || 0, performance: Number(performance) || 0, discount: Number(discount) || 0, dueDate, note: note || undefined })}
          disabled={disabled}
          className="text-xs font-semibold px-3 py-1.5 rounded"
          style={{ color: "#818cf8", background: "rgba(129,140,248,0.1)", opacity: disabled ? 0.5 : 1 }}
        >
          {busy === schedKey ? (busyLabel ?? "Scheduling…") : (submitLabel ?? "Schedule billing")}
        </button>
        {showMarkPaid && (
          <button
            onClick={() => onSchedule({ base: Number(base) || 0, performance: Number(performance) || 0, discount: Number(discount) || 0, dueDate, note: note || undefined, markPaid: true })}
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

  const balance = balanceOf(billing);
  const isScheduled = billing.status === "scheduled";

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
            <div className="flex flex-col gap-1 justify-end">
              <button
                onClick={() => onPatch(billing.id, { amount_paid: Number(partial) || 0 })}
                disabled={isBusy || !partial}
                className="text-xs font-semibold px-3 py-1.5 rounded"
                style={{ color: "#38bdf8", background: "rgba(56,189,248,0.1)", opacity: (isBusy || !partial) ? 0.5 : 1 }}
              >
                Record payment
              </button>
            </div>
            <div className="flex flex-col gap-1 justify-end">
              <button
                onClick={() => onPatch(billing.id, { status: "paid" })}
                disabled={isBusy}
                className="text-xs font-semibold px-3 py-1.5 rounded"
                style={{ color: "#22c55e", background: "rgba(34,197,94,0.1)", opacity: isBusy ? 0.5 : 1 }}
              >
                Mark fully paid
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
      {/* Quick-action buttons */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => onPatch(billing.id, { status: "paid" })}
          disabled={isBusy}
          className="text-xs font-semibold px-3 py-1.5 rounded"
          style={{ color: "#22c55e", background: "rgba(34,197,94,0.1)", opacity: isBusy ? 0.5 : 1 }}
        >
          Mark fully paid
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
  billingModelFilter = "fixed",
}: {
  clients: ClientBilling[];
  busy: string | null;
  canViewRevenue: boolean;
  onPatch: (clientId: string, body: Record<string, unknown>) => void;
  onPauseBilling: (client: ClientBilling) => void;
  onRequestPause: (clientId: string, clientName: string) => void;
  onRequestOffboard: (clientId: string) => void;
  billingModelFilter?: "fixed" | "performance";
}) {
  const sorted = clients
    .filter(c => isInBillingQueue(c) && (billingModelFilter === "fixed" ? isFixedBilling(c.billing_model) : isPerformanceBilling(c.billing_model)))
    .sort((a, b) => a.name.localeCompare(b.name));
  const missingConfig = sorted.filter(c => !c.billing_day && !c.launch_date).length;

  const headers = canViewRevenue
    ? ["Client", "Billing model", "Billing type", "Monthly $", "Billing day", "Launch date", "Suggested next", "Lifecycle"]
    : ["Client", "Billing model", "Billing type", "Billing day", "Launch date", "Suggested next", "Lifecycle"];

  return (
    <div>
      {missingConfig > 0 && (
        <p className="text-xs px-4 py-2" style={{ color: "#f59e0b", background: "rgba(245,158,11,0.06)" }}>
          {missingConfig} active client{missingConfig === 1 ? "" : "s"} have no billing day or launch date — set one below so billing cycles can be suggested.
        </p>
      )}
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
          {sorted.map((c, i) => {
            const isBusy = busy === `cfg-${c.id}`;
            return (
              <tr
                key={c.id}
                style={{ background: i % 2 === 0 ? "#080f1e" : "#060d1a", borderTop: "1px solid rgba(255,255,255,0.04)" }}
              >
                <td className="px-4 py-2.5 font-medium" style={{ color: "#e2e8f0" }}>{c.name}</td>
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
                <td className="px-4 py-2.5">
                  <select
                    value={c.billing_type ?? ""}
                    disabled={isBusy}
                    onChange={e => onPatch(c.id, { billing_type: e.target.value })}
                    className="px-2 py-1 rounded-lg text-xs outline-none cursor-pointer"
                    style={fieldStyle()}
                  >
                    <option value="">Monthly (default)</option>
                    <option value="monthly">Monthly</option>
                    <option value="pif">PIF</option>
                    <option value="pif_monthly">PIF + Monthly</option>
                  </select>
                </td>
                {canViewRevenue && (
                  <td className="px-4 py-2.5">
                    <input
                      type="number"
                      defaultValue={c.mrr ?? ""}
                      disabled={isBusy}
                      onBlur={e => { if (String(c.mrr ?? "") !== e.target.value) onPatch(c.id, { mrr: e.target.value }); }}
                      placeholder="0"
                      className="px-2 py-1 rounded-lg text-xs outline-none w-24"
                      style={fieldStyle()}
                    />
                  </td>
                )}
                <td className="px-4 py-2.5">
                  <input
                    type="number"
                    min={1}
                    max={31}
                    defaultValue={c.billing_day ?? ""}
                    disabled={isBusy}
                    onBlur={e => { if (String(c.billing_day ?? "") !== e.target.value) onPatch(c.id, { billing_day: e.target.value }); }}
                    placeholder="—"
                    title="Day of month (1-31); blank = launch day"
                    className="px-2 py-1 rounded-lg text-xs outline-none w-16"
                    style={fieldStyle()}
                  />
                </td>
                <td className="px-4 py-2.5">
                  <input
                    type="date"
                    value={c.launch_date ?? ""}
                    disabled={isBusy}
                    onChange={e => onPatch(c.id, { launch_date: e.target.value })}
                    className="px-2 py-1 rounded-lg text-xs outline-none"
                    style={fieldStyle()}
                  />
                </td>
                <td className="px-4 py-2.5 text-xs" style={{ color: c.suggested_next_date ? "#cbd5e1" : "#475569" }}>
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
          })}
        </tbody>
      </table>
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
          Log a billing from a while back (e.g. if it wasn&rsquo;t captured at the time). Recorded as fully paid on the payment date. Total = retainer + performance − discount.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <LabeledInput label="Client">
          <select
            value={clientId}
            onChange={e => { setClientId(e.target.value); setJustRecorded(false); }}
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

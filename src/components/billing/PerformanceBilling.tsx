"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import {
  computeCycleTotal,
  computePerformanceAmount,
  cycleStatusLabel,
  type CycleStatus,
} from "@/lib/billing-model";
import type { ClientBilling } from "@/components/billing/billing-types";
import {
  fieldStyle,
  LabeledInput,
  money,
  relativeLabel,
  stickyThStyle,
  STICKY_TH_BG,
  todayYmd,
} from "@/components/billing/billing-ui";

export type BillingCycle = {
  id: string;
  client_id: string;
  period_start: string;
  period_end: string;
  base_amount: number;
  show_count: number;
  bailed_count: number;
  pay_per_show: number;
  pay_per_bailed: number;
  performance_amount: number;
  discount: number;
  status: string;
  effective_status: CycleStatus;
  report_sent_at: string | null;
  objection_deadline_at: string | null;
  dispute_note: string | null;
  billing_id: string | null;
  note: string | null;
  client: ClientBilling | null;
};

type Props = {
  clients: ClientBilling[];
  canViewRevenue: boolean;
  busy: string | null;
  setBusy: (v: string | null) => void;
  onReloadClients: () => Promise<void>;
  onPatchClient: (clientId: string, body: Record<string, unknown>) => Promise<void>;
  onPauseBilling: (client: ClientBilling) => void;
  onRequestPause: (clientId: string, clientName: string) => void;
  onRequestOffboard: (clientId: string) => void;
};

function isInPerfQueue(c: ClientBilling): boolean {
  return c.lifecycle_status === "active" && !c.billing_paused;
}

const CYCLE_STATUS_STYLE: Record<string, { color: string; bg: string }> = {
  draft: { color: "#94a3b8", bg: "rgba(148,163,184,0.12)" },
  report_sent: { color: "#f59e0b", bg: "rgba(245,158,11,0.12)" },
  ready_to_bill: { color: "#22c55e", bg: "rgba(34,197,94,0.12)" },
  disputed: { color: "#ef4444", bg: "rgba(239,68,68,0.12)" },
  billed: { color: "#38bdf8", bg: "rgba(56,189,248,0.12)" },
};

function CycleBadge({ status }: { status: string }) {
  const s = CYCLE_STATUS_STYLE[status] ?? CYCLE_STATUS_STYLE.draft;
  return (
    <span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={{ color: s.color, background: s.bg }}>
      {cycleStatusLabel(status as CycleStatus)}
    </span>
  );
}

export default function PerformanceBilling({
  clients,
  canViewRevenue,
  busy,
  setBusy,
  onReloadClients,
  onPatchClient,
  onPauseBilling,
  onRequestPause,
  onRequestOffboard,
}: Props) {
  const [cycles, setCycles] = useState<BillingCycle[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSetup, setShowSetup] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createClientId, setCreateClientId] = useState("");

  const perfClients = useMemo(
    () => clients.filter(c => c.billing_model === "performance").sort((a, b) => a.name.localeCompare(b.name)),
    [clients],
  );

  const activePerfClients = useMemo(
    () => perfClients.filter(isInPerfQueue),
    [perfClients],
  );

  const loadCycles = useCallback(async () => {
    const res = await fetch("/api/billing-cycles");
    const d = await res.json();
    setCycles(d.cycles ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadCycles();
  }, [loadCycles]);

  async function patchCycle(id: string, body: Record<string, unknown>) {
    setBusy(id);
    await fetch(`/api/billing-cycles/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    await loadCycles();
    await onReloadClients();
    setBusy(null);
  }

  async function billCycle(id: string, markPaid: boolean) {
    setBusy(id);
    await fetch(`/api/billing-cycles/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markPaid, billed_on: todayYmd() }),
    });
    await loadCycles();
    await onReloadClients();
    setBusy(null);
    setExpandedId(null);
  }

  async function createCycle(body: Record<string, unknown>) {
    setBusy("create-cycle");
    await fetch("/api/billing-cycles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setShowCreate(false);
    setCreateClientId("");
    await loadCycles();
    setBusy(null);
  }

  const buckets = useMemo(() => {
    const draft: BillingCycle[] = [];
    const objection: BillingCycle[] = [];
    const ready: BillingCycle[] = [];
    const disputed: BillingCycle[] = [];
    const billed: BillingCycle[] = [];

    for (const c of cycles) {
      const s = c.effective_status ?? c.status;
      if (s === "draft") draft.push(c);
      else if (s === "report_sent") objection.push(c);
      else if (s === "ready_to_bill") ready.push(c);
      else if (s === "disputed") disputed.push(c);
      else if (s === "billed") billed.push(c);
    }

    return { draft, objection, ready, disputed, billed };
  }, [cycles]);

  // Clients with no open cycle get a prompt in draft section
  const clientsNeedingCycle = useMemo(() => {
    const openClientIds = new Set(
      cycles
        .filter(c => !["billed", "voided"].includes(c.status))
        .map(c => c.client_id),
    );
    return activePerfClients.filter(c => !openClientIds.has(c.id));
  }, [cycles, activePerfClients]);

  if (loading) {
    return <p className="text-sm py-8 text-center" style={{ color: "#334155" }}>Loading performance billing…</p>;
  }

  return (
    <div className="space-y-6">
      <p className="text-xs" style={{ color: "#475569" }}>
        Performance clients bill on report cadence: mark report sent → 3-day objection window → ready to bill.
        Enter show and bail counts manually each cycle.
      </p>

      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={() => setShowCreate(s => !s)}
          disabled={!canViewRevenue}
          className="text-xs font-semibold px-3 py-2 rounded-lg"
          style={{
            color: canViewRevenue ? "#a78bfa" : "#334155",
            background: canViewRevenue ? "rgba(167,139,250,0.12)" : "rgba(255,255,255,0.04)",
            border: `1px solid ${canViewRevenue ? "rgba(167,139,250,0.3)" : "rgba(255,255,255,0.06)"}`,
            opacity: canViewRevenue ? 1 : 0.6,
          }}
        >
          {showCreate ? "Close" : "New billing cycle"}
        </button>
      </div>

      {showCreate && canViewRevenue && (
        <CreateCycleForm
          clients={activePerfClients}
          clientId={createClientId}
          onClientId={setCreateClientId}
          busy={busy}
          onSubmit={createCycle}
        />
      )}

      <CycleSection
        title="Awaiting report"
        accent="#94a3b8"
        emptyText="No draft cycles."
        cycles={buckets.draft}
        canViewRevenue={canViewRevenue}
        busy={busy}
        expandedId={expandedId}
        onToggle={setExpandedId}
        onPatch={patchCycle}
        onBill={billCycle}
      />

      {clientsNeedingCycle.length > 0 && (
        <div className="rounded-xl px-4 py-3" style={{ background: "rgba(148,163,184,0.06)", border: "1px dashed rgba(148,163,184,0.2)" }}>
          <p className="text-xs font-semibold mb-2" style={{ color: "#94a3b8" }}>No cycle filed yet</p>
          <div className="flex flex-wrap gap-2">
            {clientsNeedingCycle.map(c => (
              <button
                key={c.id}
                type="button"
                disabled={!canViewRevenue}
                onClick={() => { setCreateClientId(c.id); setShowCreate(true); }}
                className="text-xs px-2 py-1 rounded"
                style={{ color: "#cbd5e1", background: "rgba(255,255,255,0.04)" }}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <CycleSection
        title="In objection window"
        accent="#f59e0b"
        emptyText="No reports in the 3-day objection window."
        cycles={buckets.objection}
        canViewRevenue={canViewRevenue}
        busy={busy}
        expandedId={expandedId}
        onToggle={setExpandedId}
        onPatch={patchCycle}
        onBill={billCycle}
        showDeadline
      />

      <CycleSection
        title="Ready to bill"
        accent="#22c55e"
        emptyText="Nothing ready to bill yet."
        cycles={[...buckets.ready, ...buckets.disputed]}
        canViewRevenue={canViewRevenue}
        busy={busy}
        expandedId={expandedId}
        onToggle={setExpandedId}
        onPatch={patchCycle}
        onBill={billCycle}
        highlightReady
      />

      <CycleSection
        title="Billed"
        accent="#38bdf8"
        emptyText="No billed performance cycles yet."
        cycles={buckets.billed}
        canViewRevenue={canViewRevenue}
        busy={busy}
        expandedId={expandedId}
        onToggle={setExpandedId}
        onPatch={patchCycle}
        onBill={billCycle}
        readOnly
      />

      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
        <button
          onClick={() => setShowSetup(s => !s)}
          className="w-full flex items-center justify-between px-4 py-3 text-left"
          style={{ background: "#0a1628", color: "#cbd5e1" }}
        >
          <span className="text-sm font-semibold">Performance clients — configuration</span>
          <span className="text-xs" style={{ color: "#475569" }}>{showSetup ? "Hide" : "Show"}</span>
        </button>
        {showSetup && (
          <PerfSetupTable
            clients={perfClients.filter(c => c.lifecycle_status === "active")}
            busy={busy}
            canViewRevenue={canViewRevenue}
            onPatch={onPatchClient}
            onPauseBilling={onPauseBilling}
            onRequestPause={onRequestPause}
            onRequestOffboard={onRequestOffboard}
          />
        )}
      </div>
    </div>
  );
}

function CycleSection({
  title, accent, emptyText, cycles, canViewRevenue, busy, expandedId, onToggle, onPatch, onBill,
  showDeadline, highlightReady, readOnly,
}: {
  title: string;
  accent: string;
  emptyText: string;
  cycles: BillingCycle[];
  canViewRevenue: boolean;
  busy: string | null;
  expandedId: string | null;
  onToggle: (id: string | null) => void;
  onPatch: (id: string, body: Record<string, unknown>) => void;
  onBill: (id: string, markPaid: boolean) => void;
  showDeadline?: boolean;
  highlightReady?: boolean;
  readOnly?: boolean;
}) {
  const headers = canViewRevenue
    ? ["Client", "Period", "Shows", "Bailed", "Total", "Status", "Action"]
    : ["Client", "Period", "Status"];

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className="w-2.5 h-2.5 rounded-full" style={{ background: accent }} />
        <h3 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "#cbd5e1" }}>{title}</h3>
        <span className="text-xs" style={{ color: "#475569" }}>({cycles.length})</span>
      </div>
      <div className="rounded-xl overflow-x-auto" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: STICKY_TH_BG }}>
              {headers.map(h => (
                <th key={h} className="sticky z-10 text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider" style={{ ...stickyThStyle(), color: "#334155" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cycles.length === 0 ? (
              <tr><td colSpan={headers.length} className="px-4 py-6 text-center text-xs" style={{ color: "#334155" }}>{emptyText}</td></tr>
            ) : cycles.map((c, i) => {
              const name = c.client?.name ?? "—";
              const total = computeCycleTotal(c.base_amount, c.performance_amount, c.discount);
              const status = c.effective_status ?? c.status;
              const isExpanded = expandedId === c.id;
              return (
                <Fragment key={c.id}>
                  <tr style={{ background: i % 2 === 0 ? "#080f1e" : "#060d1a", borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                    <td className="px-4 py-3 font-medium" style={{ color: "#e2e8f0" }}>{name}</td>
                    <td className="px-4 py-3 text-xs" style={{ color: "#94a3b8" }}>{c.period_start} → {c.period_end}</td>
                    {canViewRevenue && (
                      <>
                        <td className="px-4 py-3" style={{ color: "#cbd5e1" }}>{c.show_count}</td>
                        <td className="px-4 py-3" style={{ color: "#cbd5e1" }}>{c.bailed_count}</td>
                        <td className="px-4 py-3 font-medium" style={{ color: highlightReady && status === "ready_to_bill" ? "#22c55e" : "#e2e8f0" }}>{money(total)}</td>
                      </>
                    )}
                    <td className="px-4 py-3">
                      <CycleBadge status={status} />
                      {showDeadline && c.objection_deadline_at && (
                        <div className="text-xs mt-0.5" style={{ color: "#64748b" }}>
                          until {c.objection_deadline_at.slice(0, 10)} ({relativeLabel(c.objection_deadline_at.slice(0, 10))})
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {canViewRevenue && !readOnly ? (
                        <button onClick={() => onToggle(isExpanded ? null : c.id)} className="text-xs font-semibold" style={{ color: "#60a5fa" }}>
                          {isExpanded ? "Close" : "Manage"}
                        </button>
                      ) : (
                        <span className="text-xs" style={{ color: "#334155" }}>—</span>
                      )}
                    </td>
                  </tr>
                  {isExpanded && canViewRevenue && !readOnly && (
                    <tr style={{ background: "#04101f" }}>
                      <td colSpan={headers.length} className="px-4 py-4">
                        <CycleEditor cycle={c} busy={busy} onPatch={onPatch} onBill={onBill} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CycleEditor({
  cycle, busy, onPatch, onBill,
}: {
  cycle: BillingCycle;
  busy: string | null;
  onPatch: (id: string, body: Record<string, unknown>) => void;
  onBill: (id: string, markPaid: boolean) => void;
}) {
  const [shows, setShows] = useState(String(cycle.show_count));
  const [bailed, setBailed] = useState(String(cycle.bailed_count));
  const [base, setBase] = useState(String(cycle.base_amount));
  const [showRate, setShowRate] = useState(String(cycle.pay_per_show));
  const [bailRate, setBailRate] = useState(String(cycle.pay_per_bailed));
  const [discount, setDiscount] = useState(String(cycle.discount));
  const isBusy = busy === cycle.id;

  const perf = computePerformanceAmount(
    { show_count: Number(shows) || 0, bailed_count: Number(bailed) || 0 },
    { pay_per_show: Number(showRate) || 0, pay_per_bailed: Number(bailRate) || 0 },
  );
  const total = computeCycleTotal(Number(base) || 0, perf, Number(discount) || 0);
  const status = cycle.effective_status ?? cycle.status;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <LabeledInput label="Shows"><input type="number" value={shows} onChange={e => setShows(e.target.value)} className="px-2 py-1.5 rounded-lg text-sm outline-none w-full" style={fieldStyle()} /></LabeledInput>
        <LabeledInput label="Bailed"><input type="number" value={bailed} onChange={e => setBailed(e.target.value)} className="px-2 py-1.5 rounded-lg text-sm outline-none w-full" style={fieldStyle()} /></LabeledInput>
        <LabeledInput label="Base retainer"><input type="number" value={base} onChange={e => setBase(e.target.value)} className="px-2 py-1.5 rounded-lg text-sm outline-none w-full" style={fieldStyle()} /></LabeledInput>
        <LabeledInput label="Discount"><input type="number" value={discount} onChange={e => setDiscount(e.target.value)} className="px-2 py-1.5 rounded-lg text-sm outline-none w-full" style={fieldStyle()} /></LabeledInput>
        <LabeledInput label="$/show"><input type="number" value={showRate} onChange={e => setShowRate(e.target.value)} className="px-2 py-1.5 rounded-lg text-sm outline-none w-full" style={fieldStyle()} /></LabeledInput>
        <LabeledInput label="$/bailed"><input type="number" value={bailRate} onChange={e => setBailRate(e.target.value)} className="px-2 py-1.5 rounded-lg text-sm outline-none w-full" style={fieldStyle()} /></LabeledInput>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-sm" style={{ color: "#cbd5e1" }}>
          Performance: <strong>{money(perf)}</strong> · Total: <strong style={{ color: "#e2e8f0" }}>{money(total)}</strong>
        </span>
        <button
          onClick={() => onPatch(cycle.id, {
            show_count: Number(shows) || 0,
            bailed_count: Number(bailed) || 0,
            base_amount: Number(base) || 0,
            pay_per_show: Number(showRate) || 0,
            pay_per_bailed: Number(bailRate) || 0,
            discount: Number(discount) || 0,
          })}
          disabled={isBusy}
          className="text-xs font-semibold px-3 py-1.5 rounded"
          style={{ color: "#e2e8f0", background: "rgba(255,255,255,0.06)", opacity: isBusy ? 0.5 : 1 }}
        >
          Save amounts
        </button>
      </div>

      <div className="flex gap-2 flex-wrap pt-2 border-t" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
        {status === "draft" && (
          <button onClick={() => onPatch(cycle.id, { action: "mark_report_sent" })} disabled={isBusy} className="text-xs font-semibold px-3 py-1.5 rounded" style={{ color: "#f59e0b", background: "rgba(245,158,11,0.1)", opacity: isBusy ? 0.5 : 1 }}>
            Mark report sent
          </button>
        )}
        {status === "report_sent" && (
          <>
            <button onClick={() => onPatch(cycle.id, { action: "mark_disputed", dispute_note: window.prompt("Dispute note (optional):") ?? "" })} disabled={isBusy} className="text-xs font-semibold px-3 py-1.5 rounded" style={{ color: "#ef4444", background: "rgba(239,68,68,0.1)", opacity: isBusy ? 0.5 : 1 }}>
              Mark disputed
            </button>
          </>
        )}
        {status === "disputed" && (
          <button onClick={() => onPatch(cycle.id, { action: "resolve_dispute" })} disabled={isBusy} className="text-xs font-semibold px-3 py-1.5 rounded" style={{ color: "#22c55e", background: "rgba(34,197,94,0.1)", opacity: isBusy ? 0.5 : 1 }}>
            Resolve dispute → ready to bill
          </button>
        )}
        {status === "ready_to_bill" && (
          <>
            <button onClick={() => onBill(cycle.id, false)} disabled={isBusy} className="text-xs font-semibold px-3 py-1.5 rounded" style={{ color: "#818cf8", background: "rgba(129,140,248,0.1)", opacity: isBusy ? 0.5 : 1 }}>
              Bill client
            </button>
            <button onClick={() => onBill(cycle.id, true)} disabled={isBusy} className="text-xs font-semibold px-3 py-1.5 rounded" style={{ color: "#22c55e", background: "rgba(34,197,94,0.1)", opacity: isBusy ? 0.5 : 1 }}>
              Bill + mark paid
            </button>
          </>
        )}
        {status === "disputed" && (
          <button onClick={() => onBill(cycle.id, false)} disabled={isBusy} className="text-xs font-semibold px-3 py-1.5 rounded" style={{ color: "#818cf8", background: "rgba(129,140,248,0.1)", opacity: isBusy ? 0.5 : 1 }}>
            Bill anyway
          </button>
        )}
        <button onClick={() => onPatch(cycle.id, { action: "void" })} disabled={isBusy} className="text-xs px-3 py-1.5 rounded" style={{ color: "#475569" }}>
          Void
        </button>
      </div>
    </div>
  );
}

function CreateCycleForm({
  clients, clientId, onClientId, busy, onSubmit,
}: {
  clients: ClientBilling[];
  clientId: string;
  onClientId: (id: string) => void;
  busy: string | null;
  onSubmit: (body: Record<string, unknown>) => void;
}) {
  const client = clients.find(c => c.id === clientId) ?? null;
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);

  const [periodStart, setPeriodStart] = useState(monthStart);
  const [periodEnd, setPeriodEnd] = useState(monthEnd);
  const [shows, setShows] = useState("0");
  const [bailed, setBailed] = useState("0");

  const disabled = busy === "create-cycle" || !client;

  return (
    <div className="rounded-xl p-4 space-y-3" style={{ background: "#0a1628", border: "1px solid rgba(167,139,250,0.2)" }}>
      <h3 className="text-sm font-semibold" style={{ color: "#e2e8f0" }}>New performance billing cycle</h3>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <LabeledInput label="Client">
          <select value={clientId} onChange={e => onClientId(e.target.value)} className="px-2 py-1.5 rounded-lg text-sm outline-none w-full cursor-pointer" style={fieldStyle()}>
            <option value="">Select client…</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </LabeledInput>
        <LabeledInput label="Period start"><input type="date" value={periodStart} onChange={e => setPeriodStart(e.target.value)} className="px-2 py-1.5 rounded-lg text-sm outline-none w-full" style={fieldStyle()} /></LabeledInput>
        <LabeledInput label="Period end"><input type="date" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)} className="px-2 py-1.5 rounded-lg text-sm outline-none w-full" style={fieldStyle()} /></LabeledInput>
        <LabeledInput label="Shows"><input type="number" value={shows} onChange={e => setShows(e.target.value)} className="px-2 py-1.5 rounded-lg text-sm outline-none w-full" style={fieldStyle()} /></LabeledInput>
        <LabeledInput label="Bailed"><input type="number" value={bailed} onChange={e => setBailed(e.target.value)} className="px-2 py-1.5 rounded-lg text-sm outline-none w-full" style={fieldStyle()} /></LabeledInput>
      </div>
      <button
        onClick={() => client && onSubmit({
          client_id: client.id,
          period_start: periodStart,
          period_end: periodEnd,
          show_count: Number(shows) || 0,
          bailed_count: Number(bailed) || 0,
          base_amount: client.mrr,
          pay_per_show: client.pay_per_show,
          pay_per_bailed: client.pay_per_bailed,
        })}
        disabled={disabled}
        className="text-xs font-semibold px-4 py-2 rounded-lg"
        style={{ color: "#a78bfa", background: "rgba(167,139,250,0.12)", opacity: disabled ? 0.5 : 1 }}
      >
        {busy === "create-cycle" ? "Creating…" : "Create cycle"}
      </button>
    </div>
  );
}

function PerfSetupTable({
  clients, busy, canViewRevenue, onPatch, onPauseBilling, onRequestPause, onRequestOffboard,
}: {
  clients: ClientBilling[];
  busy: string | null;
  canViewRevenue: boolean;
  onPatch: (id: string, body: Record<string, unknown>) => void;
  onPauseBilling: (c: ClientBilling) => void;
  onRequestPause: (id: string, name: string) => void;
  onRequestOffboard: (id: string) => void;
}) {
  const headers = canViewRevenue
    ? ["Client", "Base $", "$/show", "$/bailed", "Billing model", "Actions"]
    : ["Client", "Billing model", "Actions"];

  return (
    <table className="w-full text-sm">
      <thead>
        <tr style={{ background: "#081225" }}>
          {headers.map(h => (
            <th key={h} className="sticky z-10 text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider" style={{ ...stickyThStyle("#081225"), color: "#334155" }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {clients.map((c, i) => {
          const isBusy = busy === `cfg-${c.id}`;
          return (
            <tr key={c.id} style={{ background: i % 2 === 0 ? "#080f1e" : "#060d1a", borderTop: "1px solid rgba(255,255,255,0.04)" }}>
              <td className="px-4 py-2.5 font-medium" style={{ color: "#e2e8f0" }}>{c.name}</td>
              {canViewRevenue && (
                <>
                  <td className="px-4 py-2.5">
                    <input type="number" defaultValue={c.mrr ?? ""} disabled={isBusy} onBlur={e => { if (String(c.mrr ?? "") !== e.target.value) onPatch(c.id, { mrr: e.target.value }); }} className="px-2 py-1 rounded-lg text-xs outline-none w-24" style={fieldStyle()} />
                  </td>
                  <td className="px-4 py-2.5">
                    <input type="number" defaultValue={c.pay_per_show ?? ""} disabled={isBusy} onBlur={e => { if (String(c.pay_per_show ?? "") !== e.target.value) onPatch(c.id, { pay_per_show: e.target.value }); }} className="px-2 py-1 rounded-lg text-xs outline-none w-20" style={fieldStyle()} />
                  </td>
                  <td className="px-4 py-2.5">
                    <input type="number" defaultValue={c.pay_per_bailed ?? ""} disabled={isBusy} onBlur={e => { if (String(c.pay_per_bailed ?? "") !== e.target.value) onPatch(c.id, { pay_per_bailed: e.target.value }); }} className="px-2 py-1 rounded-lg text-xs outline-none w-20" style={fieldStyle()} />
                  </td>
                </>
              )}
              <td className="px-4 py-2.5">
                <select value={c.billing_model ?? "performance"} disabled={isBusy} onChange={e => onPatch(c.id, { billing_model: e.target.value })} className="px-2 py-1 rounded-lg text-xs outline-none cursor-pointer" style={fieldStyle()}>
                  <option value="fixed">Fixed retainer</option>
                  <option value="performance">Performance</option>
                </select>
              </td>
              <td className="px-4 py-2.5 whitespace-nowrap">
                <button onClick={() => onPauseBilling(c)} disabled={isBusy} className="text-xs font-semibold mr-2" style={{ color: "#fbbf24" }}>Pause billing</button>
                <button onClick={() => onRequestPause(c.id, c.name)} disabled={isBusy} className="text-xs font-semibold mr-2" style={{ color: "#f59e0b" }}>Pause client</button>
                <button onClick={() => onRequestOffboard(c.id)} disabled={isBusy} className="text-xs font-semibold" style={{ color: "#ef4444" }}>Churn</button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

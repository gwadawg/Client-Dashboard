"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import type { AgentCommissionRow, UnifiedPayrollReport } from "@/lib/agent-commissions";
import type { B2BSetterCommissionRow } from "@/lib/b2b-setter-commissions";
import type { SalariedCommissionRow } from "@/lib/salaried-commissions";
import { POSITION_LABELS } from "@/lib/employee-positions";
import {
  currentPeriodMonth,
  listRecentPayrollMonths,
  monthBounds,
} from "@/lib/payroll-period";
import type { PayrollRunListItem, PayrollSubmittedEmployee } from "@/lib/payroll-runs";
import PayrollEmployeeDetail, { type EmployeePayrollView } from "./PayrollEmployeeDetail";

type Props = {
  onGoToCreditQueue?: () => void;
  onGoToAcquisitionCreditQueue?: () => void;
};

type PageTab = "month" | "runs";
type PeriodStatus = "none" | "open" | "closed";

function csvEscape(s: string): string {
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function downloadCsv(filename: string, headers: string[], rows: string[][]) {
  const lines = [headers.map(csvEscape).join(",")];
  for (const row of rows) lines.push(row.map(csvEscape).join(","));
  const blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function fmtMoney(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
}

const CALL_REP_TYPE_LABELS: Record<string, string> = {
  booking: "Booking",
  show: "Show",
  live_transfer: "Live Transfer",
};

const B2B_TYPE_LABELS: Record<string, string> = {
  qualified_demo: "Qualified Demo",
  close: "Close",
};

const rateCellStyle: React.CSSProperties = {
  color: "#94a3b8",
  fontSize: "0.75rem",
  fontVariantNumeric: "tabular-nums",
};

function RateCell({ value }: { value: number }) {
  return (
    <td className="px-2 py-2.5 text-right" style={rateCellStyle}>
      {value}
    </td>
  );
}

function PendingBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span
      className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide"
      style={{ background: "rgba(245,158,11,0.15)", color: "#fbbf24", border: "1px solid rgba(245,158,11,0.3)" }}
      title={`${count} unclaimed appointment${count === 1 ? "" : "s"} need disposition`}
    >
      <span aria-hidden>⚠</span>
      {count} unclaimed
    </span>
  );
}

function SubmittedBadge({ submitted }: { submitted: boolean }) {
  if (!submitted) {
    return (
      <span
        className="ml-2 inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide"
        style={{ background: "rgba(245,158,11,0.12)", color: "#fbbf24" }}
      >
        Pending
      </span>
    );
  }
  return (
    <span
      className="ml-2 inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide"
      style={{ background: "rgba(34,197,94,0.12)", color: "#86efac" }}
    >
      Submitted
    </span>
  );
}

function EmployeeRowActions({
  submitted,
  periodClosed,
  accent,
  onReview,
}: {
  submitted: boolean;
  periodClosed: boolean;
  accent: string;
  onReview: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onReview}
      className="text-[10px] font-semibold uppercase tracking-wide px-2 py-1 rounded whitespace-nowrap"
      style={{ background: `${accent}22`, color: accent }}
    >
      {submitted || periodClosed ? "View" : "Review & Submit"}
    </button>
  );
}

function KpiStrip({ report }: { report: UnifiedPayrollReport }) {
  const cards = [
    { label: "Grand Total", value: report.summary.grand_total, accent: "#22c55e" },
    { label: "Call Reps", value: report.summary.call_reps_total, sub: `${report.summary.call_rep_count} employees`, accent: "#60a5fa" },
    { label: "B2B Setters", value: report.summary.b2b_setters_total, sub: `${report.summary.b2b_setter_count} employees`, accent: "#fbbf24" },
    { label: "Salaried", value: report.summary.salaried_total, sub: `${report.summary.salaried_count} employees`, accent: "#a78bfa" },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map(card => (
        <div
          key={card.label}
          className="rounded-xl px-5 py-4"
          style={{ background: "#050c18", border: `1px solid ${card.accent}33` }}
        >
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#64748b" }}>{card.label}</p>
          <p className="text-2xl font-bold tabular-nums mt-1" style={{ color: card.accent }}>{fmtMoney(card.value)}</p>
          {card.sub && <p className="text-xs mt-0.5" style={{ color: "#475569" }}>{card.sub}</p>}
        </div>
      ))}
    </div>
  );
}

export default function AgentPayrollReport({
  onGoToCreditQueue,
  onGoToAcquisitionCreditQueue,
}: Props) {
  const monthOptions = useMemo(() => listRecentPayrollMonths(36), []);
  const [periodMonth, setPeriodMonth] = useState(currentPeriodMonth);
  const bounds = useMemo(() => monthBounds(periodMonth), [periodMonth]);

  const [pageTab, setPageTab] = useState<PageTab>("month");
  const [report, setReport] = useState<UnifiedPayrollReport | null>(null);
  const [finalizedRuns, setFinalizedRuns] = useState<PayrollRunListItem[]>([]);
  const [periodStatus, setPeriodStatus] = useState<PeriodStatus>("none");
  const [submittedEmployees, setSubmittedEmployees] = useState<PayrollSubmittedEmployee[]>([]);
  const [finalizedMeta, setFinalizedMeta] = useState<{ at: string; by: string | null } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [employeeView, setEmployeeView] = useState<EmployeePayrollView | null>(null);

  const submittedAgentIds = useMemo(
    () => new Set(submittedEmployees.map(s => s.agent_id)),
    [submittedEmployees],
  );

  const isPeriodClosed = periodStatus === "closed";
  const employeeCount = report
    ? report.summary.call_rep_count + report.summary.b2b_setter_count + report.summary.salaried_count
    : 0;
  const submittedCount = submittedEmployees.length;

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const runsRes = await fetch("/api/payroll-runs");
      const runsData = await runsRes.json();
      const runs: PayrollRunListItem[] = runsData.runs ?? [];
      setFinalizedRuns(runs);

      const periodRes = await fetch(`/api/payroll-runs/period/${periodMonth}`);
      const periodData = await periodRes.json();
      if (!periodRes.ok) throw new Error(periodData.error ?? "Failed to load payroll");

      setReport(periodData.report);
      setPeriodStatus(periodData.period_status ?? "none");
      setSubmittedEmployees(periodData.submitted_employees ?? []);

      if (periodData.period_status === "closed" && periodData.run) {
        setFinalizedMeta({
          at: periodData.run.finalized_at,
          by: periodData.run.finalized_by_email ?? null,
        });
      } else {
        setFinalizedMeta(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load payroll");
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [periodMonth]);

  useEffect(() => { load(); }, [load]);

  function openEmployeeReview(
    section: EmployeePayrollView["section"],
    row: AgentCommissionRow | B2BSetterCommissionRow | SalariedCommissionRow,
  ) {
    const submittedRecord = submittedEmployees.find(s => s.agent_id === row.agent_id);
    setEmployeeView({
      agent_id: row.agent_id,
      agent_name: row.agent_name,
      section,
      row,
      periodMonth,
      periodLabel: bounds.label,
      startDate: bounds.startDate,
      endDate: bounds.endDate,
      isSubmitted: submittedAgentIds.has(row.agent_id),
      lineItemExclusions: submittedRecord?.line_item_exclusions ?? [],
      readOnly: isPeriodClosed,
    });
  }

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function downloadSummary() {
    if (!report) return;
    const stamp = `${report.period.startDate}_to_${report.period.endDate}`;
    const rows: string[][] = [];

    for (const a of report.call_reps.agents) {
      rows.push([
        "Call Rep",
        a.agent_name,
        String(a.rates.base_salary),
        String(a.rates.monthly_bonus),
        String(a.rates.pay_per_booking),
        String(a.rates.pay_per_show),
        String(a.rates.pay_per_live_transfer),
        "",
        String(a.counts.bookings),
        String(a.counts.shows),
        String(a.counts.live_transfers),
        "",
        String(a.amounts.base),
        String(a.amounts.bonus),
        String(a.amounts.bookings),
        String(a.amounts.shows),
        String(a.amounts.live_transfers),
        "",
        "",
        String(a.amounts.total),
      ]);
    }
    for (const a of report.b2b_setters.agents) {
      rows.push([
        "B2B Setter",
        a.agent_name,
        String(a.rates.base_salary),
        String(a.rates.monthly_bonus),
        "",
        "",
        "",
        String(a.rates.pay_per_qualified_demo),
        "",
        "",
        "",
        String(a.counts.qualified_demos),
        String(a.amounts.base),
        String(a.amounts.bonus),
        "",
        "",
        "",
        String(a.amounts.qualified_demos),
        String(a.amounts.closes),
        String(a.amounts.total),
      ]);
    }
    for (const a of report.salaried.agents) {
      rows.push([
        POSITION_LABELS[a.position] ?? a.position,
        a.agent_name,
        String(a.rates.base_salary),
        String(a.rates.monthly_bonus),
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        String(a.amounts.base),
        String(a.amounts.bonus),
        "",
        "",
        "",
        "",
        "",
        String(a.amounts.total),
      ]);
    }

    downloadCsv(
      `agent-payroll-summary-${stamp}.csv`,
      [
        "Pay Type", "Employee", "Base Salary", "Monthly Bonus",
        "$/Booking", "$/Show", "$/Transfer", "$/Qualified Demo",
        "Bookings", "Shows", "Transfers", "Qualified Demos",
        "Base Pay", "Bonus Pay", "Booking Pay", "Show Pay", "Transfer Pay", "Demo Pay", "Close Pay", "Total Pay",
      ],
      rows,
    );
  }

  function downloadDetail() {
    if (!report) return;
    const stamp = `${report.period.startDate}_to_${report.period.endDate}`;
    const rows: string[][] = [];

    for (const a of report.call_reps.agents) {
      for (const item of a.line_items) {
        rows.push([
          "Call Rep",
          a.agent_name,
          item.date,
          CALL_REP_TYPE_LABELS[item.type] ?? item.type,
          item.lead_name ?? "",
          item.lead_phone ?? "",
          item.client_name,
          String(item.unit_pay),
        ]);
      }
    }
    for (const a of report.b2b_setters.agents) {
      for (const item of a.line_items) {
        rows.push([
          "B2B Setter",
          a.agent_name,
          item.date,
          B2B_TYPE_LABELS[item.type] ?? item.type,
          item.lead_name ?? "",
          item.lead_phone ?? "",
          "",
          String(item.unit_pay),
        ]);
      }
    }

    downloadCsv(
      `agent-payroll-detail-${stamp}.csv`,
      ["Pay Type", "Employee", "Date", "Type", "Lead Name", "Lead Phone", "Client", "Unit Pay"],
      rows,
    );
  }

  const callRepUnassigned =
    (report?.call_reps.unassigned.bookings ?? 0) +
    (report?.call_reps.unassigned.shows ?? 0) +
    (report?.call_reps.unassigned.live_transfers ?? 0);

  const b2bUnassigned =
    (report?.b2b_setters.unassigned.qualified_demos ?? 0) +
    (report?.b2b_setters.unassigned.closes ?? 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold" style={{ color: "#e2e8f0" }}>Team Payroll</h2>
          <p className="text-sm mt-0.5 max-w-2xl" style={{ color: "#475569" }}>
            Review each employee, download their PDF, and submit individually. Pay rates and history live under Team Roster.
          </p>
          {report && (
            <p className="text-xs mt-1" style={{ color: "#64748b" }}>
              {bounds.startDate} → {bounds.endDate}
              {isPeriodClosed && finalizedMeta && (
                <span style={{ color: "#fbbf24" }}>
                  {" · "}Finalized {new Date(finalizedMeta.at).toLocaleString()}
                  {finalizedMeta.by ? ` by ${finalizedMeta.by}` : ""}
                </span>
              )}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {pageTab === "month" && (
            <>
              <select
                value={periodMonth}
                onChange={e => { setPeriodMonth(e.target.value); setPageTab("month"); }}
                className="px-3 py-2 rounded-lg text-sm font-medium"
                style={{ background: "#0f2040", color: "#e2e8f0", border: "1px solid rgba(255,255,255,0.12)" }}
              >
                {monthOptions.map(m => (
                  <option key={m.periodMonth} value={m.periodMonth}>
                    {m.label}{finalizedRuns.some(r => r.period_month.startsWith(m.periodMonth) && (r.status ?? "closed") === "closed") ? " ✓" : ""}
                  </option>
                ))}
              </select>
              {periodStatus !== "closed" && (
                <span className="text-xs px-2 py-1 rounded-lg" style={{ background: "rgba(245,158,11,0.1)", color: "#fbbf24" }}>
                  {submittedCount}/{employeeCount} submitted
                </span>
              )}
              <button
                type="button"
                onClick={downloadSummary}
                disabled={
                  !report ||
                  (report.call_reps.agents.length === 0 &&
                    report.b2b_setters.agents.length === 0 &&
                    report.salaried.agents.length === 0)
                }
                className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-40"
                style={{ background: "rgba(255,255,255,0.06)", color: "#e2e8f0" }}
              >
                Summary CSV
              </button>
              <button
                type="button"
                onClick={downloadDetail}
                disabled={
                  !report?.call_reps.agents.some(a => a.line_items.length > 0) &&
                  !report?.b2b_setters.agents.some(a => a.line_items.length > 0)
                }
                className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-40"
                style={{ background: "rgba(255,255,255,0.06)", color: "#e2e8f0" }}
              >
                Detail CSV
              </button>
            </>
          )}
        </div>
      </div>

      <div className="flex gap-2 border-b pb-1" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
        {([
          ["month", "Current month"],
          ["runs", "Pay runs"],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setPageTab(key)}
            className="px-4 py-2 rounded-t-lg text-sm font-semibold"
            style={pageTab === key
              ? { background: "rgba(245,158,11,0.12)", color: "#fbbf24", borderBottom: "2px solid #f59e0b" }
              : { color: "#64748b" }}
          >
            {label}
          </button>
        ))}
      </div>

      {pageTab === "runs" && (
        <PayRunsTable
          runs={finalizedRuns}
          onSelectMonth={pm => { setPeriodMonth(pm); setPageTab("month"); }}
        />
      )}

      {pageTab === "month" && (
        <>
      {error && (
        <div className="px-4 py-3 rounded-lg text-sm" style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.25)", color: "#f87171" }}>
          {error}
        </div>
      )}

      {report && <KpiStrip report={report} />}

      {isPeriodClosed && (
        <div className="rounded-xl px-4 py-3 text-sm" style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)", color: "#86efac" }}>
          This month is closed — all employees submitted. View details or find pay history on Team Roster.
        </div>
      )}

      {!isPeriodClosed && (
        <div className="rounded-xl px-4 py-3 text-xs" style={{ background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.15)", color: "#94a3b8" }}>
          Open each employee with Review &amp; Submit, download their PDF, then submit to lock their pay. The month closes automatically when everyone is submitted.
        </div>
      )}

      {loading && (
        <p className="text-sm py-8 text-center" style={{ color: "#64748b" }}>Loading payroll…</p>
      )}

      {!loading && report && (
        <>
          {/* ── Call Reps Section ── */}
          <section className="space-y-3 animate-[fadeIn_0.4s_ease-out]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "#60a5fa" }}>
                  Call Reps
                </h3>
                <p className="text-xs mt-0.5" style={{ color: "#475569" }}>
                  Base + bonus + (bookings × rate) + (shows × rate) + (live transfers × rate)
                </p>
              </div>
              {callRepUnassigned > 0 && !isPeriodClosed && (
                <div className="px-3 py-2 rounded-lg text-xs flex items-center gap-2"
                  style={{ background: "rgba(96,165,250,0.08)", border: "1px solid rgba(96,165,250,0.2)", color: "#93c5fd" }}>
                  <span>{callRepUnassigned} unassigned — excluded from pay</span>
                  {onGoToCreditQueue && (
                    <button type="button" onClick={onGoToCreditQueue}
                      className="font-semibold underline-offset-2 hover:underline">
                      Credit Queue →
                    </button>
                  )}
                </div>
              )}
            </div>

            <PayrollTable
              accent="#60a5fa"
              emptyMessage="No call reps with activity or base pay in this period."
              hasRows={report.call_reps.agents.length > 0}
            >
              {report.call_reps.agents.map((agent, i) => {
                const isOpen = expanded.has(agent.agent_id);
                const r = agent.rates;
                const submitted = submittedAgentIds.has(agent.agent_id);

                return (
                  <Fragment key={agent.agent_id}>
                    <tr style={{ borderTop: "1px solid rgba(255,255,255,0.03)", background: i % 2 === 0 ? "rgba(96,165,250,0.03)" : "transparent" }}>
                      <td className="px-3 py-2.5 text-center">
                        <button type="button" onClick={() => toggleExpand(agent.agent_id)} className="text-xs px-1.5" style={{ color: "#64748b" }}>
                          {isOpen ? "▼" : "▶"}
                        </button>
                      </td>
                      <td className="px-3 py-2.5 font-medium whitespace-nowrap" style={{ color: "#e2e8f0" }}>
                        {agent.agent_name}
                        <SubmittedBadge submitted={submitted} />
                        {!isPeriodClosed && <PendingBadge count={agent.pending_disposition.count} />}
                      </td>
                      <RateCell value={r.base_salary} />
                      <RateCell value={r.monthly_bonus} />
                      <RateCell value={r.pay_per_booking} />
                      <RateCell value={r.pay_per_show} />
                      <RateCell value={r.pay_per_live_transfer} />
                      <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: "#94a3b8" }}>{agent.counts.bookings}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: "#94a3b8" }}>{agent.counts.shows}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: "#94a3b8" }}>{agent.counts.live_transfers}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: "#64748b" }}>{fmtMoney(agent.amounts.base)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: "#64748b" }}>{fmtMoney(agent.amounts.bonus)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: "#64748b" }}>{fmtMoney(agent.amounts.bookings)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: "#64748b" }}>{fmtMoney(agent.amounts.shows)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: "#64748b" }}>{fmtMoney(agent.amounts.live_transfers)}</td>
                      <td className="px-3 py-2.5 text-right font-semibold tabular-nums" style={{ color: "#22c55e" }}>{fmtMoney(agent.amounts.total)}</td>
                      <td className="px-2 py-2.5 text-right">
                        <EmployeeRowActions
                          submitted={submitted}
                          periodClosed={isPeriodClosed}
                          accent="#93c5fd"
                          onReview={() => openEmployeeReview("call_rep", agent)}
                        />
                      </td>
                    </tr>
                    {isOpen && (
                      <LineItemsRow colSpan={17} items={agent.line_items} labels={CALL_REP_TYPE_LABELS} showClient />
                    )}
                    {isOpen && !isPeriodClosed && agent.pending_disposition.count > 0 && (
                      <PendingItemsRow colSpan={17} items={agent.pending_disposition.items} />
                    )}
                  </Fragment>
                );
              })}
              {report.call_reps.agents.length > 0 && (
                <tr style={{ borderTop: "2px solid rgba(96,165,250,0.2)", background: "#050c18" }}>
                  <td colSpan={16} className="px-4 py-3 text-right text-sm font-semibold" style={{ color: "#94a3b8" }}>Call Reps Subtotal</td>
                  <td className="px-3 py-3 text-right text-sm font-bold tabular-nums" style={{ color: "#60a5fa" }}>
                    {fmtMoney(report.summary.call_reps_total)}
                  </td>
                </tr>
              )}
            </PayrollTable>
          </section>

          {/* ── B2B Setters Section ── */}
          <section className="space-y-3 animate-[fadeIn_0.5s_ease-out]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "#fbbf24" }}>
                  B2B Setters
                </h3>
                <p className="text-xs mt-0.5" style={{ color: "#475569" }}>
                  Base + bonus + (qualified demos × rate) + (closes × rate)
                </p>
              </div>
              {b2bUnassigned > 0 && !isPeriodClosed && (
                <div className="px-3 py-2 rounded-lg text-xs flex items-center gap-2"
                  style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)", color: "#fbbf24" }}>
                  <span>{b2bUnassigned} unassigned demos/closes — excluded from pay</span>
                  {onGoToAcquisitionCreditQueue && (
                    <button type="button" onClick={onGoToAcquisitionCreditQueue}
                      className="font-semibold underline-offset-2 hover:underline">
                      Credit Queue →
                    </button>
                  )}
                </div>
              )}
            </div>

            <PayrollTable
              accent="#fbbf24"
              emptyMessage="No B2B setters with activity or base pay in this period."
              hasRows={report.b2b_setters.agents.length > 0}
              b2b
            >
              {report.b2b_setters.agents.map((agent, i) => {
                const isOpen = expanded.has(agent.agent_id);
                const r = agent.rates;
                const submitted = submittedAgentIds.has(agent.agent_id);

                return (
                  <Fragment key={agent.agent_id}>
                    <tr style={{ borderTop: "1px solid rgba(255,255,255,0.03)", background: i % 2 === 0 ? "rgba(245,158,11,0.03)" : "transparent" }}>
                      <td className="px-3 py-2.5 text-center">
                        <button type="button" onClick={() => toggleExpand(agent.agent_id)} className="text-xs px-1.5" style={{ color: "#64748b" }}>
                          {isOpen ? "▼" : "▶"}
                        </button>
                      </td>
                      <td className="px-3 py-2.5 font-medium whitespace-nowrap" style={{ color: "#e2e8f0" }}>
                        {agent.agent_name}
                        <SubmittedBadge submitted={submitted} />
                        {!isPeriodClosed && <PendingBadge count={agent.pending_disposition.count} />}
                      </td>
                      <RateCell value={r.base_salary} />
                      <RateCell value={r.monthly_bonus} />
                      <RateCell value={r.pay_per_qualified_demo} />
                      <RateCell value={r.pay_per_close} />
                      <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: "#94a3b8" }}>{agent.counts.qualified_demos}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: "#94a3b8" }}>{agent.counts.closes}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: "#64748b" }}>{fmtMoney(agent.amounts.base)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: "#64748b" }}>{fmtMoney(agent.amounts.bonus)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: "#64748b" }}>{fmtMoney(agent.amounts.qualified_demos)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: "#64748b" }}>{fmtMoney(agent.amounts.closes)}</td>
                      <td className="px-3 py-2.5 text-right font-semibold tabular-nums" style={{ color: "#22c55e" }}>{fmtMoney(agent.amounts.total)}</td>
                      <td className="px-2 py-2.5 text-right">
                        <EmployeeRowActions
                          submitted={submitted}
                          periodClosed={isPeriodClosed}
                          accent="#fbbf24"
                          onReview={() => openEmployeeReview("b2b_setter", agent)}
                        />
                      </td>
                    </tr>
                    {isOpen && (
                      <LineItemsRow colSpan={14} items={agent.line_items} labels={B2B_TYPE_LABELS} />
                    )}
                    {isOpen && !isPeriodClosed && agent.pending_disposition.count > 0 && (
                      <PendingItemsRow colSpan={14} items={agent.pending_disposition.items} />
                    )}
                  </Fragment>
                );
              })}
              {report.b2b_setters.agents.length > 0 && (
                <tr style={{ borderTop: "2px solid rgba(245,158,11,0.2)", background: "#050c18" }}>
                  <td colSpan={13} className="px-4 py-3 text-right text-sm font-semibold" style={{ color: "#94a3b8" }}>B2B Setters Subtotal</td>
                  <td className="px-3 py-3 text-right text-sm font-bold tabular-nums" style={{ color: "#fbbf24" }}>
                    {fmtMoney(report.summary.b2b_setters_total)}
                  </td>
                </tr>
              )}
            </PayrollTable>
          </section>

          {/* ── Salaried Section ── */}
          <section className="space-y-3 animate-[fadeIn_0.6s_ease-out]">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "#a78bfa" }}>
                Salaried
              </h3>
              <p className="text-xs mt-0.5" style={{ color: "#475569" }}>
                Admin, media buyer, operations, and other salaried roles — base + monthly bonus only
              </p>
            </div>

            <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(167,139,250,0.15)" }}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ background: "#050c18" }}>
                      {["Employee", "Position", "Base $", "Bonus $", "Base", "Bonus", "Total", "Actions"].map(h => (
                        <th
                          key={h || "actions"}
                          className={`px-3 py-3 text-xs font-semibold uppercase tracking-wider whitespace-nowrap ${h === "Employee" || h === "Position" ? "text-left" : "text-right"}`}
                          style={{ color: "#475569", borderBottom: "1px solid rgba(167,139,250,0.2)" }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {report.salaried.agents.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-12 text-center text-sm" style={{ color: "#64748b" }}>
                          No salaried team members with base or bonus in this period.
                        </td>
                      </tr>
                    ) : report.salaried.agents.map((agent, i) => {
                      const r = agent.rates;
                      const submitted = submittedAgentIds.has(agent.agent_id);
                      return (
                        <tr
                          key={agent.agent_id}
                          style={{
                            borderTop: "1px solid rgba(255,255,255,0.03)",
                            background: i % 2 === 0 ? "rgba(167,139,250,0.03)" : "transparent",
                          }}
                        >
                          <td className="px-3 py-2.5 font-medium whitespace-nowrap" style={{ color: "#e2e8f0" }}>
                            {agent.agent_name}
                            <SubmittedBadge submitted={submitted} />
                          </td>
                          <td className="px-3 py-2.5 text-xs" style={{ color: "#c4b5fd" }}>
                            {POSITION_LABELS[agent.position] ?? agent.position}
                          </td>
                          <RateCell value={r.base_salary} />
                          <RateCell value={r.monthly_bonus} />
                          <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: "#64748b" }}>
                            {fmtMoney(agent.amounts.base)}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: "#64748b" }}>
                            {fmtMoney(agent.amounts.bonus)}
                          </td>
                          <td className="px-3 py-2.5 text-right font-semibold tabular-nums" style={{ color: "#22c55e" }}>
                            {fmtMoney(agent.amounts.total)}
                          </td>
                          <td className="px-2 py-2.5 text-right">
                            <EmployeeRowActions
                              submitted={submitted}
                              periodClosed={isPeriodClosed}
                              accent="#c4b5fd"
                              onReview={() => openEmployeeReview("salaried", agent)}
                            />
                          </td>
                        </tr>
                      );
                    })}
                    {report.salaried.agents.length > 0 && (
                      <tr style={{ borderTop: "2px solid rgba(167,139,250,0.2)", background: "#050c18" }}>
                        <td colSpan={7} className="px-4 py-3 text-right text-sm font-semibold" style={{ color: "#94a3b8" }}>
                          Salaried Subtotal
                        </td>
                        <td className="px-3 py-3 text-right text-sm font-bold tabular-nums" style={{ color: "#a78bfa" }}>
                          {fmtMoney(report.summary.salaried_total)}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </>
      )}
        </>
      )}

      <style jsx global>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <PayrollEmployeeDetail
        view={employeeView}
        onClose={() => setEmployeeView(null)}
        onSubmitted={() => {
          setEmployeeView(null);
          load();
        }}
      />
    </div>
  );
}

function PayRunsTable({
  runs,
  onSelectMonth,
}: {
  runs: PayrollRunListItem[];
  onSelectMonth: (periodMonth: string) => void;
}) {
  if (runs.length === 0) {
    return (
      <div className="rounded-xl px-6 py-12 text-center" style={{ background: "#050c18", border: "1px solid rgba(255,255,255,0.06)" }}>
        <p className="text-sm font-medium" style={{ color: "#94a3b8" }}>No finalized pay runs yet</p>
        <p className="text-xs mt-1" style={{ color: "#64748b" }}>
          Finalize a month from the Current month tab to create your first pay run.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: "#050c18" }}>
              {["Month", "Grand total", "Employees", "Finalized", "By", ""].map(h => (
                <th
                  key={h || "action"}
                  className={`px-4 py-3 text-xs font-semibold uppercase tracking-wider whitespace-nowrap ${h === "Month" || h === "By" ? "text-left" : h === "" ? "text-right" : "text-right"}`}
                  style={{ color: "#475569", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {runs.map((run, i) => {
              const pm = run.period_month.slice(0, 7);
              const label = monthBounds(pm).label;
              const finalizedAt = new Date(run.finalized_at).toLocaleString();
              const by = run.finalized_by_email ?? "—";
              const closed = (run.status ?? "closed") === "closed";
              return (
                <tr
                  key={run.id}
                  style={{
                    borderTop: "1px solid rgba(255,255,255,0.03)",
                    background: i % 2 === 0 ? "rgba(255,255,255,0.02)" : "transparent",
                  }}
                >
                  <td className="px-4 py-3 font-medium" style={{ color: "#e2e8f0" }}>
                    {label}
                    {!closed && (
                      <span className="ml-2 text-[10px] font-semibold uppercase" style={{ color: "#fbbf24" }}>
                        In progress
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums" style={{ color: "#22c55e" }}>
                    {fmtMoney(run.summary.grand_total)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums" style={{ color: "#94a3b8" }}>
                    {run.summary.employee_count}
                  </td>
                  <td className="px-4 py-3 text-xs" style={{ color: "#94a3b8" }}>{finalizedAt}</td>
                  <td className="px-4 py-3 text-xs truncate max-w-[180px]" style={{ color: "#64748b" }} title={by}>{by}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => onSelectMonth(pm)}
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg"
                      style={{ background: "rgba(245,158,11,0.12)", color: "#fbbf24" }}
                    >
                      Open
                    </button>
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

function PayrollTable({
  accent,
  emptyMessage,
  hasRows,
  b2b,
  children,
}: {
  accent: string;
  emptyMessage: string;
  hasRows: boolean;
  b2b?: boolean;
  children: React.ReactNode;
}) {
  const callRepHeaders = ["", "Employee", "Base $", "Bonus $", "$/Booking", "$/Show", "$/Transfer", "Bk", "Show", "Xfer", "Base", "Bonus", "Booking", "Show", "Transfer", "Total", "Actions"];
  const b2bHeaders = ["", "Employee", "Base $", "Bonus $", "$/Demo", "$/Close", "Demos", "Closes", "Base", "Bonus", "Demo", "Close", "Total", "Actions"];

  const headers = b2b ? b2bHeaders : callRepHeaders;

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${accent}22` }}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: "#050c18" }}>
              {headers.map(h => (
                <th
                  key={h || "expand"}
                  className={`px-3 py-3 text-xs font-semibold uppercase tracking-wider whitespace-nowrap ${h === "Employee" ? "text-left" : "text-right"}`}
                  style={{ color: "#475569", borderBottom: `1px solid ${accent}33` }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!hasRows ? (
              <tr><td colSpan={headers.length} className="px-4 py-12 text-center text-sm" style={{ color: "#64748b" }}>{emptyMessage}</td></tr>
            ) : children}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LineItemsRow({
  colSpan,
  items,
  labels,
  showClient,
}: {
  colSpan: number;
  items: { event_id: string; date: string; type: string; lead_name: string | null; lead_phone: string | null; client_name?: string; unit_pay: number }[];
  labels: Record<string, string>;
  showClient?: boolean;
}) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-3" style={{ background: "#050c18" }}>
        {items.length === 0 ? (
          <p className="text-xs" style={{ color: "#475569" }}>No line items in this period.</p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr>
                {["Date", "Type", "Lead", "Phone", ...(showClient ? ["Client"] : []), "Unit Pay"].map(h => (
                  <th key={h} className="px-2 py-1.5 text-left font-semibold uppercase tracking-wider" style={{ color: "#475569" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.event_id} style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                  <td className="px-2 py-1.5" style={{ color: "#94a3b8" }}>{item.date}</td>
                  <td className="px-2 py-1.5" style={{ color: "#cbd5e1" }}>{labels[item.type] ?? item.type}</td>
                  <td className="px-2 py-1.5" style={{ color: "#e2e8f0" }}>{item.lead_name ?? "—"}</td>
                  <td className="px-2 py-1.5 font-mono" style={{ color: "#64748b" }}>{item.lead_phone ?? "—"}</td>
                  {showClient && <td className="px-2 py-1.5" style={{ color: "#94a3b8" }}>{item.client_name ?? "—"}</td>}
                  <td className="px-2 py-1.5 text-right tabular-nums" style={{ color: "#22c55e" }}>{fmtMoney(item.unit_pay)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </td>
    </tr>
  );
}

function PendingItemsRow({
  colSpan,
  items,
}: {
  colSpan: number;
  items: { id: string; date: string; type: string; lead_name: string | null }[];
}) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-2" style={{ background: "rgba(245,158,11,0.05)" }}>
        <p className="text-xs font-semibold mb-1" style={{ color: "#fbbf24" }}>Unclaimed — needs disposition</p>
        <ul className="text-xs space-y-0.5" style={{ color: "#94a3b8" }}>
          {items.map(item => (
            <li key={item.id}>{item.date} · {item.type} · {item.lead_name ?? "Unknown lead"}</li>
          ))}
        </ul>
      </td>
    </tr>
  );
}

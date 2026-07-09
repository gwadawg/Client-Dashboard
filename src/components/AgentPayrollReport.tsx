"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import type { AgentCommissionRow, UnifiedPayrollReport } from "@/lib/agent-commissions";
import type { B2BSetterCommissionRow } from "@/lib/b2b-setter-commissions";
import type { SalariedCommissionRow } from "@/lib/salaried-commissions";
import { POSITION_LABELS } from "@/lib/employee-positions";

type Props = {
  preset: string;
  startDate: string;
  endDate: string;
  onGoToCreditQueue?: () => void;
  onGoToAcquisitionCreditQueue?: () => void;
};

type RateDraft = {
  base_salary: number;
  monthly_bonus: number;
  pay_per_booking: number;
  pay_per_show: number;
  pay_per_live_transfer: number;
  pay_per_qualified_demo: number;
  pay_per_close: number;
};

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

const rateInputStyle: React.CSSProperties = {
  background: "#0a1628",
  border: "1px solid rgba(255,255,255,0.12)",
  color: "#e2e8f0",
  borderRadius: "0.375rem",
  padding: "0.25rem 0.5rem",
  fontSize: "0.75rem",
  outline: "none",
  width: "4.5rem",
  textAlign: "right",
};

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
  preset,
  startDate,
  endDate,
  onGoToCreditQueue,
  onGoToAcquisitionCreditQueue,
}: Props) {
  const [report, setReport] = useState<UnifiedPayrollReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [savingId, setSavingId] = useState<string | null>(null);
  const [rateDrafts, setRateDrafts] = useState<Record<string, RateDraft>>({});

  const load = useCallback(() => {
    if (!startDate || !endDate) return;
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ startDate, endDate });
    fetch(`/api/agent-commissions?${params}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) {
          setError(d.error);
          setReport(null);
        } else {
          setReport(d);
          const drafts: Record<string, RateDraft> = {};
          for (const a of d.call_reps?.agents ?? []) {
            drafts[a.agent_id] = rowToDraft(a);
          }
          for (const a of d.b2b_setters?.agents ?? []) {
            drafts[a.agent_id] = b2bRowToDraft(a);
          }
          for (const a of d.salaried?.agents ?? []) {
            drafts[a.agent_id] = salariedRowToDraft(a);
          }
          setRateDrafts(drafts);
        }
        setLoading(false);
      })
      .catch(() => {
        setError("Failed to load commission report");
        setLoading(false);
      });
  }, [startDate, endDate]);

  useEffect(() => { load(); }, [load, preset]);

  function rowToDraft(a: AgentCommissionRow): RateDraft {
    return {
      base_salary: a.rates.base_salary,
      monthly_bonus: a.rates.monthly_bonus,
      pay_per_booking: a.rates.pay_per_booking,
      pay_per_show: a.rates.pay_per_show,
      pay_per_live_transfer: a.rates.pay_per_live_transfer,
      pay_per_qualified_demo: 0,
      pay_per_close: 0,
    };
  }

  function b2bRowToDraft(a: B2BSetterCommissionRow): RateDraft {
    return {
      base_salary: a.rates.base_salary,
      monthly_bonus: a.rates.monthly_bonus,
      pay_per_booking: 0,
      pay_per_show: 0,
      pay_per_live_transfer: 0,
      pay_per_qualified_demo: a.rates.pay_per_qualified_demo,
      pay_per_close: a.rates.pay_per_close,
    };
  }

  function salariedRowToDraft(a: SalariedCommissionRow): RateDraft {
    return {
      base_salary: a.rates.base_salary,
      monthly_bonus: a.rates.monthly_bonus,
      pay_per_booking: 0,
      pay_per_show: 0,
      pay_per_live_transfer: 0,
      pay_per_qualified_demo: 0,
      pay_per_close: 0,
    };
  }

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function saveRates(agentId: string) {
    const rates = rateDrafts[agentId];
    if (!rates) return;
    setSavingId(agentId);
    const res = await fetch(`/api/agents/${agentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rates),
    });
    setSavingId(null);
    if (!res.ok) {
      const d = await res.json();
      setError(d.error ?? "Failed to save pay rates");
      return;
    }
    load();
  }

  function updateDraft(agentId: string, key: keyof RateDraft, value: string) {
    setRateDrafts(prev => ({
      ...prev,
      [agentId]: { ...prev[agentId], [key]: Number(value) || 0 },
    }));
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

  function ratesDirty(
    agentId: string,
    agent: AgentCommissionRow | B2BSetterCommissionRow | SalariedCommissionRow,
    kind: "call_rep" | "b2b" | "salaried",
  ) {
    const draft = rateDrafts[agentId];
    if (!draft) return false;
    if (kind === "salaried") {
      const a = agent as SalariedCommissionRow;
      return draft.base_salary !== a.rates.base_salary || draft.monthly_bonus !== a.rates.monthly_bonus;
    }
    if (kind === "call_rep") {
      const a = agent as AgentCommissionRow;
      return (
        draft.base_salary !== a.rates.base_salary ||
        draft.monthly_bonus !== a.rates.monthly_bonus ||
        draft.pay_per_booking !== a.rates.pay_per_booking ||
        draft.pay_per_show !== a.rates.pay_per_show ||
        draft.pay_per_live_transfer !== a.rates.pay_per_live_transfer
      );
    }
    const a = agent as B2BSetterCommissionRow;
    return (
      draft.base_salary !== a.rates.base_salary ||
      draft.monthly_bonus !== a.rates.monthly_bonus ||
      draft.pay_per_qualified_demo !== a.rates.pay_per_qualified_demo ||
      draft.pay_per_close !== a.rates.pay_per_close
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold" style={{ color: "#e2e8f0" }}>Team Payroll</h2>
          <p className="text-sm mt-0.5 max-w-2xl" style={{ color: "#475569" }}>
            Unified payroll for all team positions — commission roles plus salaried staff (base + monthly bonus).
          </p>
          {report && (
            <p className="text-xs mt-1" style={{ color: "#64748b" }}>
              Period: {report.period.startDate} → {report.period.endDate}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
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
            Download Summary CSV
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
            Download Detail CSV
          </button>
        </div>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-lg text-sm" style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.25)", color: "#f87171" }}>
          {error}
        </div>
      )}

      {report && <KpiStrip report={report} />}

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
              {callRepUnassigned > 0 && (
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
                const draft = rateDrafts[agent.agent_id] ?? rowToDraft(agent);
                const isOpen = expanded.has(agent.agent_id);
                const dirty = ratesDirty(agent.agent_id, agent, "call_rep");

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
                        <PendingBadge count={agent.pending_disposition.count} />
                      </td>
                      {(["base_salary", "monthly_bonus", "pay_per_booking", "pay_per_show", "pay_per_live_transfer"] as const).map(key => (
                        <td key={key} className="px-2 py-2.5 text-right">
                          <input type="number" min={0} step={0.01} style={rateInputStyle} value={draft[key]}
                            onChange={e => updateDraft(agent.agent_id, key, e.target.value)} />
                        </td>
                      ))}
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
                        {dirty && (
                          <button type="button" onClick={() => saveRates(agent.agent_id)} disabled={savingId === agent.agent_id}
                            className="text-xs font-semibold px-2 py-1 rounded disabled:opacity-40"
                            style={{ background: "#f59e0b", color: "#fff" }}>
                            {savingId === agent.agent_id ? "…" : "Save"}
                          </button>
                        )}
                      </td>
                    </tr>
                    {isOpen && (
                      <LineItemsRow colSpan={17} items={agent.line_items} labels={CALL_REP_TYPE_LABELS} showClient />
                    )}
                    {isOpen && agent.pending_disposition.count > 0 && (
                      <PendingItemsRow colSpan={17} items={agent.pending_disposition.items} />
                    )}
                  </Fragment>
                );
              })}
              {report.call_reps.agents.length > 0 && (
                <tr style={{ borderTop: "2px solid rgba(96,165,250,0.2)", background: "#050c18" }}>
                  <td colSpan={15} className="px-4 py-3 text-right text-sm font-semibold" style={{ color: "#94a3b8" }}>Call Reps Subtotal</td>
                  <td className="px-3 py-3 text-right text-sm font-bold tabular-nums" style={{ color: "#60a5fa" }}>
                    {fmtMoney(report.summary.call_reps_total)}
                  </td>
                  <td />
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
              {b2bUnassigned > 0 && (
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
                const draft = rateDrafts[agent.agent_id] ?? b2bRowToDraft(agent);
                const isOpen = expanded.has(agent.agent_id);
                const dirty = ratesDirty(agent.agent_id, agent, "b2b");

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
                        <PendingBadge count={agent.pending_disposition.count} />
                      </td>
                      {(["base_salary", "monthly_bonus", "pay_per_qualified_demo", "pay_per_close"] as const).map(key => (
                        <td key={key} className="px-2 py-2.5 text-right">
                          <input type="number" min={0} step={0.01} style={rateInputStyle} value={draft[key]}
                            onChange={e => updateDraft(agent.agent_id, key, e.target.value)} />
                        </td>
                      ))}
                      <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: "#94a3b8" }}>{agent.counts.qualified_demos}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: "#94a3b8" }}>{agent.counts.closes}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: "#64748b" }}>{fmtMoney(agent.amounts.base)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: "#64748b" }}>{fmtMoney(agent.amounts.bonus)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: "#64748b" }}>{fmtMoney(agent.amounts.qualified_demos)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: "#64748b" }}>{fmtMoney(agent.amounts.closes)}</td>
                      <td className="px-3 py-2.5 text-right font-semibold tabular-nums" style={{ color: "#22c55e" }}>{fmtMoney(agent.amounts.total)}</td>
                      <td className="px-2 py-2.5 text-right">
                        {dirty && (
                          <button type="button" onClick={() => saveRates(agent.agent_id)} disabled={savingId === agent.agent_id}
                            className="text-xs font-semibold px-2 py-1 rounded disabled:opacity-40"
                            style={{ background: "#f59e0b", color: "#fff" }}>
                            {savingId === agent.agent_id ? "…" : "Save"}
                          </button>
                        )}
                      </td>
                    </tr>
                    {isOpen && (
                      <LineItemsRow colSpan={14} items={agent.line_items} labels={B2B_TYPE_LABELS} />
                    )}
                    {isOpen && agent.pending_disposition.count > 0 && (
                      <PendingItemsRow colSpan={14} items={agent.pending_disposition.items} />
                    )}
                  </Fragment>
                );
              })}
              {report.b2b_setters.agents.length > 0 && (
                <tr style={{ borderTop: "2px solid rgba(245,158,11,0.2)", background: "#050c18" }}>
                  <td colSpan={12} className="px-4 py-3 text-right text-sm font-semibold" style={{ color: "#94a3b8" }}>B2B Setters Subtotal</td>
                  <td className="px-3 py-3 text-right text-sm font-bold tabular-nums" style={{ color: "#fbbf24" }}>
                    {fmtMoney(report.summary.b2b_setters_total)}
                  </td>
                  <td />
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
                      {["Employee", "Position", "Base $", "Bonus $", "Base", "Bonus", "Total", ""].map(h => (
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
                      const draft = rateDrafts[agent.agent_id] ?? salariedRowToDraft(agent);
                      const dirty = ratesDirty(agent.agent_id, agent, "salaried");
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
                          </td>
                          <td className="px-3 py-2.5 text-xs" style={{ color: "#c4b5fd" }}>
                            {POSITION_LABELS[agent.position] ?? agent.position}
                          </td>
                          {(["base_salary", "monthly_bonus"] as const).map(key => (
                            <td key={key} className="px-2 py-2.5 text-right">
                              <input
                                type="number"
                                min={0}
                                step={0.01}
                                style={rateInputStyle}
                                value={draft[key]}
                                onChange={e => updateDraft(agent.agent_id, key, e.target.value)}
                              />
                            </td>
                          ))}
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
                            {dirty && (
                              <button
                                type="button"
                                onClick={() => saveRates(agent.agent_id)}
                                disabled={savingId === agent.agent_id}
                                className="text-xs font-semibold px-2 py-1 rounded disabled:opacity-40"
                                style={{ background: "#f59e0b", color: "#fff" }}
                              >
                                {savingId === agent.agent_id ? "…" : "Save"}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {report.salaried.agents.length > 0 && (
                      <tr style={{ borderTop: "2px solid rgba(167,139,250,0.2)", background: "#050c18" }}>
                        <td colSpan={6} className="px-4 py-3 text-right text-sm font-semibold" style={{ color: "#94a3b8" }}>
                          Salaried Subtotal
                        </td>
                        <td className="px-3 py-3 text-right text-sm font-bold tabular-nums" style={{ color: "#a78bfa" }}>
                          {fmtMoney(report.summary.salaried_total)}
                        </td>
                        <td />
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </>
      )}

      <style jsx global>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
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
  const callRepHeaders = ["", "Employee", "Base $", "Bonus $", "$/Booking", "$/Show", "$/Transfer", "Bk", "Show", "Xfer", "Base", "Bonus", "Booking", "Show", "Transfer", "Total", ""];
  const b2bHeaders = ["", "Employee", "Base $", "Bonus $", "$/Demo", "$/Close", "Demos", "Closes", "Base", "Bonus", "Demo", "Close", "Total", ""];

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

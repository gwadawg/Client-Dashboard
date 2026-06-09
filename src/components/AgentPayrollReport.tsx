"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import type { AgentCommissionRow, CommissionReport } from "@/lib/agent-commissions";

type Props = {
  preset: string;
  startDate: string;
  endDate: string;
  onGoToCreditQueue?: () => void;
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

const TYPE_LABELS: Record<string, string> = {
  booking: "Booking",
  show: "Show",
  live_transfer: "Live Transfer",
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

export default function AgentPayrollReport({ preset, startDate, endDate, onGoToCreditQueue }: Props) {
  const [report, setReport] = useState<CommissionReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [savingId, setSavingId] = useState<string | null>(null);
  const [rateDrafts, setRateDrafts] = useState<Record<string, AgentCommissionRow["rates"]>>({});

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
          const drafts: Record<string, AgentCommissionRow["rates"]> = {};
          for (const a of d.agents ?? []) drafts[a.agent_id] = { ...a.rates };
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

  function toggleExpand(agentId: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(agentId)) next.delete(agentId);
      else next.add(agentId);
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

  function updateDraft(agentId: string, key: keyof AgentCommissionRow["rates"], value: string) {
    setRateDrafts(prev => ({
      ...prev,
      [agentId]: { ...prev[agentId], [key]: Number(value) || 0 },
    }));
  }

  function downloadSummary() {
    if (!report) return;
    const stamp = `${report.period.startDate}_to_${report.period.endDate}`;
    downloadCsv(
      `agent-payroll-summary-${stamp}.csv`,
      [
        "Agent",
        "Base Salary",
        "Pay/Booking",
        "Pay/Show",
        "Pay/Live Transfer",
        "Bookings",
        "Shows",
        "Live Transfers",
        "Base Pay",
        "Booking Pay",
        "Show Pay",
        "Transfer Pay",
        "Total Pay",
      ],
      report.agents.map(a => [
        a.agent_name,
        String(a.rates.base_salary),
        String(a.rates.pay_per_booking),
        String(a.rates.pay_per_show),
        String(a.rates.pay_per_live_transfer),
        String(a.counts.bookings),
        String(a.counts.shows),
        String(a.counts.live_transfers),
        String(a.amounts.base),
        String(a.amounts.bookings),
        String(a.amounts.shows),
        String(a.amounts.live_transfers),
        String(a.amounts.total),
      ]),
    );
  }

  function downloadDetail() {
    if (!report) return;
    const stamp = `${report.period.startDate}_to_${report.period.endDate}`;
    const rows: string[][] = [];
    for (const a of report.agents) {
      for (const item of a.line_items) {
        rows.push([
          a.agent_name,
          item.date,
          TYPE_LABELS[item.type] ?? item.type,
          item.lead_name ?? "",
          item.lead_phone ?? "",
          item.client_name,
          String(item.unit_pay),
        ]);
      }
    }
    downloadCsv(
      `agent-payroll-detail-${stamp}.csv`,
      ["Agent", "Date", "Type", "Lead Name", "Lead Phone", "Client", "Unit Pay"],
      rows,
    );
  }

  const grandTotal = report?.agents.reduce((s, a) => s + a.amounts.total, 0) ?? 0;
  const unassignedTotal =
    (report?.unassigned.bookings ?? 0) +
    (report?.unassigned.shows ?? 0) +
    (report?.unassigned.live_transfers ?? 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold" style={{ color: "#e2e8f0" }}>Agent Payroll</h2>
          <p className="text-sm mt-0.5 max-w-2xl" style={{ color: "#475569" }}>
            Commission report for all clients. Formula: base salary + (bookings × rate) + (shows × rate) + (live transfers × rate).
            Bookings filter by booking date; shows filter by appointment date (
            <code className="text-xs">scheduled_at</code>
            , with fallback to recorded date).
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
            disabled={!report?.agents.length}
            className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-40"
            style={{ background: "rgba(255,255,255,0.06)", color: "#e2e8f0" }}
          >
            Download Summary CSV
          </button>
          <button
            type="button"
            onClick={downloadDetail}
            disabled={!report?.agents.some(a => a.line_items.length > 0)}
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

      {unassignedTotal > 0 && report && (
        <div className="px-4 py-3 rounded-lg text-sm flex flex-wrap items-center gap-3"
          style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.25)", color: "#fbbf24" }}>
          <span>
            {report.unassigned.bookings} unassigned booking{report.unassigned.bookings === 1 ? "" : "s"},{" "}
            {report.unassigned.shows} unassigned show{report.unassigned.shows === 1 ? "" : "s"},{" "}
            {report.unassigned.live_transfers} unassigned live transfer{report.unassigned.live_transfers === 1 ? "" : "s"} — excluded from pay.
          </span>
          {onGoToCreditQueue && (
            <button
              type="button"
              onClick={onGoToCreditQueue}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg"
              style={{ background: "rgba(245,158,11,0.2)", color: "#f59e0b" }}
            >
              Open Credit Queue →
            </button>
          )}
        </div>
      )}

      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: "#050c18" }}>
                {[
                  "",
                  "Agent",
                  "Base $",
                  "$/Booking",
                  "$/Show",
                  "$/Transfer",
                  "Bookings",
                  "Shows",
                  "Transfers",
                  "Base",
                  "Booking",
                  "Show",
                  "Transfer",
                  "Total",
                  "",
                ].map(h => (
                  <th
                    key={h || "expand"}
                    className={`px-3 py-3 text-xs font-semibold uppercase tracking-wider whitespace-nowrap ${h === "Agent" ? "text-left" : "text-right"}`}
                    style={{ color: "#475569", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={15} className="px-4 py-12 text-center text-sm" style={{ color: "#1e3a5f" }}>
                    Loading…
                  </td>
                </tr>
              ) : !report?.agents.length ? (
                <tr>
                  <td colSpan={15} className="px-4 py-12 text-center text-sm" style={{ color: "#1e3a5f" }}>
                    No agents with activity or base salary in this period. Set pay rates on the Agent Roster or below.
                  </td>
                </tr>
              ) : (
                report.agents.map((agent, i) => {
                  const draft = rateDrafts[agent.agent_id] ?? agent.rates;
                  const isOpen = expanded.has(agent.agent_id);
                  const ratesDirty =
                    draft.base_salary !== agent.rates.base_salary ||
                    draft.pay_per_booking !== agent.rates.pay_per_booking ||
                    draft.pay_per_show !== agent.rates.pay_per_show ||
                    draft.pay_per_live_transfer !== agent.rates.pay_per_live_transfer;

                  return (
                    <Fragment key={agent.agent_id}>
                      <tr
                        style={{
                          borderTop: "1px solid rgba(255,255,255,0.03)",
                          background: i % 2 === 0 ? "rgba(255,255,255,0.015)" : "transparent",
                        }}
                      >
                        <td className="px-3 py-2.5 text-center">
                          <button
                            type="button"
                            onClick={() => toggleExpand(agent.agent_id)}
                            className="text-xs px-1.5 py-0.5 rounded"
                            style={{ color: "#64748b" }}
                            title={isOpen ? "Collapse" : "Expand line items"}
                          >
                            {isOpen ? "▼" : "▶"}
                          </button>
                        </td>
                        <td className="px-3 py-2.5 font-medium whitespace-nowrap" style={{ color: "#e2e8f0" }}>
                          {agent.agent_name}
                        </td>
                        {(["base_salary", "pay_per_booking", "pay_per_show", "pay_per_live_transfer"] as const).map(key => (
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
                        <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: "#94a3b8" }}>{agent.counts.bookings}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: "#94a3b8" }}>{agent.counts.shows}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: "#94a3b8" }}>{agent.counts.live_transfers}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: "#64748b" }}>{fmtMoney(agent.amounts.base)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: "#64748b" }}>{fmtMoney(agent.amounts.bookings)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: "#64748b" }}>{fmtMoney(agent.amounts.shows)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: "#64748b" }}>{fmtMoney(agent.amounts.live_transfers)}</td>
                        <td className="px-3 py-2.5 text-right font-semibold tabular-nums whitespace-nowrap" style={{ color: "#22c55e" }}>
                          {fmtMoney(agent.amounts.total)}
                        </td>
                        <td className="px-2 py-2.5 text-right">
                          {ratesDirty && (
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
                      {isOpen && (
                        <tr>
                          <td colSpan={15} className="px-4 py-3" style={{ background: "#050c18" }}>
                            {agent.line_items.length === 0 ? (
                              <p className="text-xs" style={{ color: "#475569" }}>No line items in this period.</p>
                            ) : (
                              <table className="w-full text-xs">
                                <thead>
                                  <tr>
                                    {["Date", "Type", "Lead", "Phone", "Client", "Unit Pay"].map(h => (
                                      <th key={h} className="px-2 py-1.5 text-left font-semibold uppercase tracking-wider" style={{ color: "#475569" }}>
                                        {h}
                                      </th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {agent.line_items.map(item => (
                                    <tr key={item.event_id} style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                                      <td className="px-2 py-1.5" style={{ color: "#94a3b8" }}>{item.date}</td>
                                      <td className="px-2 py-1.5" style={{ color: "#cbd5e1" }}>{TYPE_LABELS[item.type]}</td>
                                      <td className="px-2 py-1.5" style={{ color: "#e2e8f0" }}>{item.lead_name ?? "—"}</td>
                                      <td className="px-2 py-1.5 font-mono" style={{ color: "#64748b" }}>{item.lead_phone ?? "—"}</td>
                                      <td className="px-2 py-1.5" style={{ color: "#94a3b8" }}>{item.client_name}</td>
                                      <td className="px-2 py-1.5 text-right tabular-nums" style={{ color: "#22c55e" }}>{fmtMoney(item.unit_pay)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })
              )}
              {report && report.agents.length > 0 && (
                <tr style={{ borderTop: "2px solid rgba(255,255,255,0.08)", background: "#050c18" }}>
                  <td colSpan={13} className="px-4 py-3 text-right text-sm font-semibold" style={{ color: "#94a3b8" }}>
                    Grand Total
                  </td>
                  <td className="px-3 py-3 text-right text-sm font-bold tabular-nums" style={{ color: "#22c55e" }}>
                    {fmtMoney(grandTotal)}
                  </td>
                  <td />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import type { UnifiedPayrollReport } from "@/lib/agent-commissions";
import { POSITION_LABELS } from "@/lib/employee-positions";
import type { EmployeePayrollView } from "./PayrollEmployeeDetail";

function fmtMoney(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
}

type Props = {
  report: UnifiedPayrollReport;
  periodLabel: string;
  readOnly?: boolean;
  onClose: () => void;
  onReviewEmployee: (view: EmployeePayrollView) => void;
};

type Tab = "all" | "call_rep" | "b2b_setter" | "salaried";

export default function PayrollItemizedModal({ report, periodLabel, readOnly, onClose, onReviewEmployee }: Props) {
  const [tab, setTab] = useState<Tab>("all");
  const [query, setQuery] = useState("");

  const employees = useMemo(() => {
    const out: EmployeePayrollView[] = [];
    for (const row of report.call_reps.agents) {
      out.push({ agent_id: row.agent_id, agent_name: row.agent_name, section: "call_rep", row, periodLabel, readOnly });
    }
    for (const row of report.b2b_setters.agents) {
      out.push({ agent_id: row.agent_id, agent_name: row.agent_name, section: "b2b_setter", row, periodLabel, readOnly });
    }
    for (const row of report.salaried.agents) {
      out.push({ agent_id: row.agent_id, agent_name: row.agent_name, section: "salaried", row, periodLabel, readOnly });
    }
    return out.sort((a, b) => b.row.amounts.total - a.row.amounts.total);
  }, [report, periodLabel, readOnly]);

  const filtered = employees.filter(e => {
    if (tab !== "all" && e.section !== tab) return false;
    if (query && !e.agent_name.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)" }} onClick={onClose}>
      <div
        className="w-full max-w-5xl max-h-[90vh] flex flex-col rounded-2xl overflow-hidden shadow-2xl"
        style={{ background: "#0a1628", border: "1px solid rgba(255,255,255,0.1)" }}
        onClick={e => e.stopPropagation()}
      >
        <div className="px-6 py-4 flex flex-wrap items-center justify-between gap-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div>
            <h3 className="text-lg font-semibold text-slate-100">Itemized Payroll — {periodLabel}</h3>
            <p className="text-sm text-slate-500 mt-0.5">
              {employees.length} employees · Grand total {fmtMoney(report.summary.grand_total)}
              {readOnly && <span className="ml-2 text-amber-400">Finalized snapshot</span>}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-500 hover:text-slate-300 text-2xl leading-none px-2">×</button>
        </div>

        <div className="px-6 py-3 flex flex-wrap items-center gap-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
          {([
            ["all", "All"],
            ["call_rep", "Call Reps"],
            ["b2b_setter", "B2B"],
            ["salaried", "Salaried"],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold"
              style={tab === key
                ? { background: "rgba(245,158,11,0.15)", color: "#fbbf24" }
                : { background: "rgba(255,255,255,0.04)", color: "#94a3b8" }}
            >
              {label}
            </button>
          ))}
          <input
            type="search"
            placeholder="Search employee…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="ml-auto px-3 py-1.5 rounded-lg text-sm outline-none"
            style={{ background: "#050c18", border: "1px solid rgba(255,255,255,0.1)", color: "#e2e8f0", minWidth: "12rem" }}
          />
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {filtered.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-12">No employees match this filter.</p>
          ) : filtered.map(emp => (
            <div
              key={`${emp.section}-${emp.agent_id}`}
              className="rounded-xl px-4 py-3 flex flex-wrap items-center gap-4"
              style={{ background: "#050c18", border: "1px solid rgba(255,255,255,0.06)" }}
            >
              <div className="flex-1 min-w-[10rem]">
                <p className="font-medium text-slate-100">{emp.agent_name}</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {emp.section === "salaried"
                    ? POSITION_LABELS[(emp.row as import("@/lib/salaried-commissions").SalariedCommissionRow).position]
                    : emp.section === "b2b_setter" ? "B2B Setter" : "Call Rep"}
                  {" · "}{"line_items" in emp.row ? emp.row.line_items.length : 0} line items
                </p>
              </div>
              <p className="text-lg font-bold tabular-nums text-emerald-400">{fmtMoney(emp.row.amounts.total)}</p>
              <button
                type="button"
                onClick={() => onReviewEmployee(emp)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                style={{ background: "#f59e0b", color: "#fff" }}
              >
                Review
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

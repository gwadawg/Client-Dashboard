"use client";

import { useEffect, useState } from "react";
import type { AgentCommissionRow } from "@/lib/agent-commissions";
import type { B2BSetterCommissionRow } from "@/lib/b2b-setter-commissions";
import type { SalariedCommissionRow } from "@/lib/salaried-commissions";
import { POSITION_LABELS } from "@/lib/employee-positions";
import type { PayrollEmployeeHistoryRow } from "@/lib/payroll-runs";

export type EmployeePayrollView = {
  agent_id: string;
  agent_name: string;
  section: "call_rep" | "b2b_setter" | "salaried";
  row: AgentCommissionRow | B2BSetterCommissionRow | SalariedCommissionRow;
  periodLabel: string;
  readOnly?: boolean;
};

const CALL_REP_LABELS: Record<string, string> = {
  booking: "Booking",
  show: "Show",
  live_transfer: "Live Transfer",
};

const B2B_LABELS: Record<string, string> = {
  qualified_demo: "Qualified Demo",
  close: "Close",
};

function fmtMoney(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
}

function sectionLabel(section: EmployeePayrollView["section"]): string {
  if (section === "call_rep") return "Call Rep";
  if (section === "b2b_setter") return "B2B Setter";
  return "Salaried";
}

function AmountBreakdown({ view }: { view: EmployeePayrollView }) {
  const { row, section } = view;
  if (section === "call_rep") {
    const r = row as AgentCommissionRow;
    const a = r.amounts;
    return (
      <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
        <div><dt className="text-xs text-slate-500">Base</dt><dd className="font-semibold tabular-nums">{fmtMoney(a.base)}</dd></div>
        <div><dt className="text-xs text-slate-500">Bonus</dt><dd className="font-semibold tabular-nums">{fmtMoney(a.bonus)}</dd></div>
        <div><dt className="text-xs text-slate-500">Bookings ({r.counts.bookings})</dt><dd className="font-semibold tabular-nums">{fmtMoney(a.bookings)}</dd></div>
        <div><dt className="text-xs text-slate-500">Shows ({r.counts.shows})</dt><dd className="font-semibold tabular-nums">{fmtMoney(a.shows)}</dd></div>
        <div><dt className="text-xs text-slate-500">Transfers ({r.counts.live_transfers})</dt><dd className="font-semibold tabular-nums">{fmtMoney(a.live_transfers)}</dd></div>
        <div><dt className="text-xs text-slate-500">Total</dt><dd className="font-bold tabular-nums text-emerald-400">{fmtMoney(a.total)}</dd></div>
      </dl>
    );
  }

  if (section === "b2b_setter") {
    const r = row as B2BSetterCommissionRow;
    const a = r.amounts;
    return (
      <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
        <div><dt className="text-xs text-slate-500">Base</dt><dd className="font-semibold tabular-nums">{fmtMoney(a.base)}</dd></div>
        <div><dt className="text-xs text-slate-500">Bonus</dt><dd className="font-semibold tabular-nums">{fmtMoney(a.bonus)}</dd></div>
        <div><dt className="text-xs text-slate-500">Demos ({r.counts.qualified_demos})</dt><dd className="font-semibold tabular-nums">{fmtMoney(a.qualified_demos)}</dd></div>
        <div><dt className="text-xs text-slate-500">Closes ({r.counts.closes})</dt><dd className="font-semibold tabular-nums">{fmtMoney(a.closes)}</dd></div>
        <div><dt className="text-xs text-slate-500">Total</dt><dd className="font-bold tabular-nums text-emerald-400">{fmtMoney(a.total)}</dd></div>
      </dl>
    );
  }

  const r = row as SalariedCommissionRow;
  const a = r.amounts;
  return (
    <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
      <div><dt className="text-xs text-slate-500">Position</dt><dd>{POSITION_LABELS[r.position] ?? r.position}</dd></div>
      <div><dt className="text-xs text-slate-500">Base</dt><dd className="font-semibold tabular-nums">{fmtMoney(a.base)}</dd></div>
      <div><dt className="text-xs text-slate-500">Bonus</dt><dd className="font-semibold tabular-nums">{fmtMoney(a.bonus)}</dd></div>
      <div><dt className="text-xs text-slate-500">Total</dt><dd className="font-bold tabular-nums text-emerald-400">{fmtMoney(a.total)}</dd></div>
    </dl>
  );
}

function LineItemsTable({ view }: { view: EmployeePayrollView }) {
  const { row, section } = view;
  const items = ('line_items' in row ? row.line_items : []) as {
    event_id: string;
    date: string;
    type: string;
    lead_name: string | null;
    lead_phone: string | null;
    client_name?: string;
    unit_pay: number;
  }[];

  if (items.length === 0) {
    return <p className="text-sm text-slate-500 py-4">No commission line items this period.</p>;
  }

  const labels = section === "b2b_setter" ? B2B_LABELS : CALL_REP_LABELS;
  const showClient = section === "call_rep";

  return (
    <div className="overflow-x-auto rounded-lg" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
      <table className="w-full text-xs">
        <thead>
          <tr style={{ background: "#050c18" }}>
            {["Date", "Type", "Lead", "Phone", ...(showClient ? ["Client"] : []), "Pay"].map(h => (
              <th key={h} className="px-3 py-2 text-left font-semibold uppercase tracking-wider text-slate-500">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <tr key={`${item.event_id}-${i}`} style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
              <td className="px-3 py-2 text-slate-300">{item.date}</td>
              <td className="px-3 py-2">{labels[item.type] ?? item.type}</td>
              <td className="px-3 py-2 text-slate-200">{item.lead_name ?? "—"}</td>
              <td className="px-3 py-2 font-mono text-slate-500">{item.lead_phone ?? "—"}</td>
              {showClient && <td className="px-3 py-2 text-slate-400">{"client_name" in item ? item.client_name ?? "—" : "—"}</td>}
              <td className="px-3 py-2 text-right tabular-nums text-emerald-400">{fmtMoney(item.unit_pay)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function PayrollEmployeeDetail({
  view,
  onClose,
}: {
  view: EmployeePayrollView | null;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"detail" | "history">("detail");
  const [history, setHistory] = useState<PayrollEmployeeHistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    if (!view) return;
    setTab("detail");
    setHistory([]);
  }, [view?.agent_id, view?.periodLabel]);

  useEffect(() => {
    if (!view || tab !== "history") return;
    setHistoryLoading(true);
    fetch(`/api/payroll-runs/employee/${view.agent_id}`)
      .then(r => r.json())
      .then(d => setHistory(d.history ?? []))
      .catch(() => setHistory([]))
      .finally(() => setHistoryLoading(false));
  }, [view, tab]);

  if (!view) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" style={{ background: "rgba(0,0,0,0.55)" }} onClick={onClose}>
      <div
        className="w-full max-w-2xl h-full overflow-y-auto shadow-2xl"
        style={{ background: "#0a1628", borderLeft: "1px solid rgba(255,255,255,0.08)" }}
        onClick={e => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 px-6 py-4 flex items-start justify-between gap-4" style={{ background: "#0a1628", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div>
            <p className="text-lg font-semibold text-slate-100">{view.agent_name}</p>
            <p className="text-sm text-slate-500 mt-0.5">
              {sectionLabel(view.section)} · {view.periodLabel}
              {view.readOnly && <span className="ml-2 text-amber-400">(Finalized)</span>}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-500 hover:text-slate-300 text-xl leading-none px-2">×</button>
        </div>

        <div className="px-6 pt-4 flex gap-2">
          {(["detail", "history"] as const).map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className="px-4 py-2 rounded-lg text-sm font-semibold"
              style={tab === t
                ? { background: "rgba(245,158,11,0.15)", color: "#fbbf24" }
                : { background: "rgba(255,255,255,0.04)", color: "#94a3b8" }}
            >
              {t === "detail" ? "This period" : "Pay history"}
            </button>
          ))}
        </div>

        <div className="px-6 py-5 space-y-6">
          {tab === "detail" ? (
            <>
              <AmountBreakdown view={view} />
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Line items</h4>
                <LineItemsTable view={view} />
              </div>
              {view.row.pending_disposition?.count > 0 && (
                <div className="rounded-lg px-4 py-3 text-sm" style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)", color: "#fbbf24" }}>
                  {view.row.pending_disposition.count} unclaimed item(s) were noted at finalize time but excluded from pay.
                </div>
              )}
            </>
          ) : historyLoading ? (
            <p className="text-sm text-slate-500">Loading pay history…</p>
          ) : history.length === 0 ? (
            <p className="text-sm text-slate-500">No finalized pay history yet for this employee.</p>
          ) : (
            <div className="space-y-3">
              {history.map(h => (
                <div key={h.payroll_run_id} className="rounded-xl px-4 py-3" style={{ background: "#050c18", border: "1px solid rgba(255,255,255,0.06)" }}>
                  <div className="flex justify-between gap-3">
                    <div>
                      <p className="font-medium text-slate-200">{h.start_date.slice(0, 7)}</p>
                      <p className="text-xs text-slate-500">{h.start_date} → {h.end_date}</p>
                    </div>
                    <p className="font-bold tabular-nums text-emerald-400">{fmtMoney(h.total_pay)}</p>
                  </div>
                  <p className="text-xs text-slate-500 mt-2">
                    {h.line_items.length} line item{h.line_items.length === 1 ? "" : "s"} · Finalized {new Date(h.finalized_at).toLocaleDateString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

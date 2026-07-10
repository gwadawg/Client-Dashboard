"use client";

import { useEffect, useState } from "react";
import type { AgentCommissionRow } from "@/lib/agent-commissions";
import type { B2BSetterCommissionRow } from "@/lib/b2b-setter-commissions";
import type { SalariedCommissionRow } from "@/lib/salaried-commissions";
import { POSITION_LABELS } from "@/lib/employee-positions";
import { downloadPayrollStatementPdf } from "@/lib/payroll-statement-pdf";

export type EmployeePayrollView = {
  agent_id: string;
  agent_name: string;
  section: "call_rep" | "b2b_setter" | "salaried";
  row: AgentCommissionRow | B2BSetterCommissionRow | SalariedCommissionRow;
  periodMonth: string;
  periodLabel: string;
  startDate: string;
  endDate: string;
  isSubmitted: boolean;
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

function RatesSummary({ view }: { view: EmployeePayrollView }) {
  const { row, section } = view;
  if (section === "call_rep") {
    const r = row as AgentCommissionRow;
    return (
      <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
        <div><dt className="text-xs text-slate-500">Base rate</dt><dd className="font-medium tabular-nums">{fmtMoney(r.rates.base_salary)}</dd></div>
        <div><dt className="text-xs text-slate-500">Bonus rate</dt><dd className="font-medium tabular-nums">{fmtMoney(r.rates.monthly_bonus)}</dd></div>
        <div><dt className="text-xs text-slate-500">Per booking</dt><dd className="font-medium tabular-nums">{fmtMoney(r.rates.pay_per_booking)}</dd></div>
        <div><dt className="text-xs text-slate-500">Per show</dt><dd className="font-medium tabular-nums">{fmtMoney(r.rates.pay_per_show)}</dd></div>
        <div><dt className="text-xs text-slate-500">Per transfer</dt><dd className="font-medium tabular-nums">{fmtMoney(r.rates.pay_per_live_transfer)}</dd></div>
      </dl>
    );
  }
  if (section === "b2b_setter") {
    const r = row as B2BSetterCommissionRow;
    return (
      <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
        <div><dt className="text-xs text-slate-500">Base rate</dt><dd className="font-medium tabular-nums">{fmtMoney(r.rates.base_salary)}</dd></div>
        <div><dt className="text-xs text-slate-500">Bonus rate</dt><dd className="font-medium tabular-nums">{fmtMoney(r.rates.monthly_bonus)}</dd></div>
        <div><dt className="text-xs text-slate-500">Per demo</dt><dd className="font-medium tabular-nums">{fmtMoney(r.rates.pay_per_qualified_demo)}</dd></div>
        <div><dt className="text-xs text-slate-500">Per close</dt><dd className="font-medium tabular-nums">{fmtMoney(r.rates.pay_per_close)}</dd></div>
      </dl>
    );
  }
  const r = row as SalariedCommissionRow;
  return (
    <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
      <div><dt className="text-xs text-slate-500">Position</dt><dd>{POSITION_LABELS[r.position] ?? r.position}</dd></div>
      <div><dt className="text-xs text-slate-500">Base rate</dt><dd className="font-medium tabular-nums">{fmtMoney(r.rates.base_salary)}</dd></div>
      <div><dt className="text-xs text-slate-500">Bonus rate</dt><dd className="font-medium tabular-nums">{fmtMoney(r.rates.monthly_bonus)}</dd></div>
    </dl>
  );
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
      <div><dt className="text-xs text-slate-500">Base</dt><dd className="font-semibold tabular-nums">{fmtMoney(a.base)}</dd></div>
      <div><dt className="text-xs text-slate-500">Bonus</dt><dd className="font-semibold tabular-nums">{fmtMoney(a.bonus)}</dd></div>
      <div><dt className="text-xs text-slate-500">Total</dt><dd className="font-bold tabular-nums text-emerald-400">{fmtMoney(a.total)}</dd></div>
    </dl>
  );
}

function LineItemsTable({ view }: { view: EmployeePayrollView }) {
  const { row, section } = view;
  const items = ("line_items" in row ? row.line_items : []) as {
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
              {showClient && <td className="px-3 py-2 text-slate-400">{item.client_name ?? "—"}</td>}
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
  onSubmitted,
}: {
  view: EmployeePayrollView | null;
  onClose: () => void;
  onSubmitted?: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitted, setSubmitted] = useState(view?.isSubmitted ?? false);

  useEffect(() => {
    setSubmitted(view?.isSubmitted ?? false);
    setSubmitError("");
  }, [view]);

  if (!view) return null;

  const pendingCount = view.row.pending_disposition?.count ?? 0;
  const canSubmit = !submitted && !view.readOnly;

  async function handleSubmit() {
    if (!canSubmit) return;
    const msg = `Submit payroll for ${view!.agent_name} (${view!.periodLabel})?\n\nThis locks their pay snapshot for the month.`;
    if (!confirm(msg)) return;

    setSubmitting(true);
    setSubmitError("");
    try {
      const res = await fetch(
        `/api/payroll-runs/${view!.periodMonth}/employees/${view!.agent_id}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ section: view!.section }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to submit payroll");
      setSubmitted(true);
      onSubmitted?.();
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Failed to submit payroll");
    } finally {
      setSubmitting(false);
    }
  }

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
            </p>
            <p className="text-xs text-slate-600 mt-0.5">{view.startDate} → {view.endDate}</p>
            {submitted && (
              <span className="inline-flex mt-2 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide"
                style={{ background: "rgba(34,197,94,0.12)", color: "#86efac" }}>
                Submitted
              </span>
            )}
          </div>
          <button type="button" onClick={onClose} className="text-slate-500 hover:text-slate-300 text-xl leading-none px-2">×</button>
        </div>

        <div className="px-6 py-5 space-y-6">
          <section>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Pay rates</h4>
            <RatesSummary view={view} />
          </section>

          <section>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Earnings summary</h4>
            <AmountBreakdown view={view} />
          </section>

          <section>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Line items</h4>
            <LineItemsTable view={view} />
          </section>

          {pendingCount > 0 && !submitted && (
            <div className="rounded-lg px-4 py-3 text-sm" style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)", color: "#fbbf24" }}>
              {pendingCount} unclaimed item(s) are excluded from this pay until credited in the queue.
            </div>
          )}

          {submitError && (
            <div className="rounded-lg px-4 py-3 text-sm" style={{ background: "rgba(239,68,68,0.12)", color: "#f87171" }}>
              {submitError}
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-2 border-t" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
            <button
              type="button"
              onClick={() => downloadPayrollStatementPdf(view)}
              className="px-4 py-2 rounded-lg text-sm font-semibold"
              style={{ background: "rgba(255,255,255,0.06)", color: "#e2e8f0" }}
            >
              Download PDF
            </button>
            {canSubmit && (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-40"
                style={{ background: "#22c55e", color: "#fff" }}
              >
                {submitting ? "Submitting…" : "Submit payroll"}
              </button>
            )}
          </div>

          <p className="text-xs" style={{ color: "#64748b" }}>
            Download the PDF to send to the rep, then submit to lock this employee&apos;s pay for the month.
            Past pay runs live under Team Roster → employee file → Pay history.
          </p>
        </div>
      </div>
    </div>
  );
}

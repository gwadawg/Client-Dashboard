"use client";

import { useEffect, useMemo, useState } from "react";
import type { AgentCommissionRow } from "@/lib/agent-commissions";
import type { B2BSetterCommissionRow } from "@/lib/b2b-setter-commissions";
import type { SalariedCommissionRow } from "@/lib/salaried-commissions";
import { POSITION_LABELS } from "@/lib/employee-positions";
import {
  DUPLICATE_LEAD_EXCLUSION_REASON,
  applyPayrollExclusions,
  detectDuplicateLeadGroups,
  duplicateEventIds,
  exclusionsToMap,
  type DuplicateLeadGroup,
  type LineItemExclusion,
  type PayrollReviewLineItem,
} from "@/lib/payroll-line-item-duplicates";
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
  lineItemExclusions?: LineItemExclusion[];
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

function DuplicateLeadBanner({
  groups,
  exclusionCount,
}: {
  groups: DuplicateLeadGroup[];
  exclusionCount: number;
}) {
  if (groups.length === 0) return null;

  return (
    <div
      className="rounded-lg px-4 py-3 text-sm space-y-2"
      style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.35)", color: "#fcd34d" }}
    >
      <p className="font-semibold flex items-center gap-2">
        <span aria-hidden>⚠</span>
        Possible duplicate lead credits
      </p>
      <p className="text-xs leading-relaxed" style={{ color: "#fbbf24" }}>
        {groups.length} lead{groups.length === 1 ? "" : "s"} have multiple payable events (e.g. booking + live transfer).
        Reps should only receive one conversation credit per lead. Use the checkboxes below to exclude duplicates before submit.
        Excluded items stay visible on the PDF with the reason.
      </p>
      <ul className="text-xs space-y-1" style={{ color: "#fde68a" }}>
        {groups.slice(0, 5).map(group => (
          <li key={group.lead_key}>
            <span className="font-medium">{group.lead_label}</span>
            {" — "}
            {group.items.map(item => CALL_REP_LABELS[item.type] ?? B2B_LABELS[item.type] ?? item.type).join(", ")}
          </li>
        ))}
        {groups.length > 5 && <li>+{groups.length - 5} more…</li>}
      </ul>
      {exclusionCount > 0 && (
        <p className="text-xs font-medium" style={{ color: "#86efac" }}>
          {exclusionCount} line item{exclusionCount === 1 ? "" : "s"} marked excluded (adjusted total below).
        </p>
      )}
    </div>
  );
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

function AmountBreakdown({
  view,
  adjusted,
  hasExclusions,
}: {
  view: EmployeePayrollView;
  adjusted: { counts: Record<string, number>; amounts: Record<string, number>; total_pay: number } | null;
  hasExclusions: boolean;
}) {
  const { row, section } = view;
  if (section === "call_rep") {
    const r = row as AgentCommissionRow;
    const counts = (adjusted?.counts ?? r.counts) as AgentCommissionRow["counts"];
    const amounts = (adjusted?.amounts ?? r.amounts) as AgentCommissionRow["amounts"];
    return (
      <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
        <div><dt className="text-xs text-slate-500">Base</dt><dd className="font-semibold tabular-nums">{fmtMoney(amounts.base)}</dd></div>
        <div><dt className="text-xs text-slate-500">Bonus</dt><dd className="font-semibold tabular-nums">{fmtMoney(amounts.bonus)}</dd></div>
        <div><dt className="text-xs text-slate-500">Bookings ({counts.bookings})</dt><dd className="font-semibold tabular-nums">{fmtMoney(amounts.bookings)}</dd></div>
        <div><dt className="text-xs text-slate-500">Shows ({counts.shows})</dt><dd className="font-semibold tabular-nums">{fmtMoney(amounts.shows)}</dd></div>
        <div><dt className="text-xs text-slate-500">Transfers ({counts.live_transfers})</dt><dd className="font-semibold tabular-nums">{fmtMoney(amounts.live_transfers)}</dd></div>
        <div>
          <dt className="text-xs text-slate-500">{hasExclusions ? "Adjusted total" : "Total"}</dt>
          <dd className="font-bold tabular-nums text-emerald-400">{fmtMoney(amounts.total)}</dd>
        </div>
      </dl>
    );
  }

  if (section === "b2b_setter") {
    const r = row as B2BSetterCommissionRow;
    const counts = (adjusted?.counts ?? r.counts) as B2BSetterCommissionRow["counts"];
    const amounts = (adjusted?.amounts ?? r.amounts) as B2BSetterCommissionRow["amounts"];
    return (
      <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
        <div><dt className="text-xs text-slate-500">Base</dt><dd className="font-semibold tabular-nums">{fmtMoney(amounts.base)}</dd></div>
        <div><dt className="text-xs text-slate-500">Bonus</dt><dd className="font-semibold tabular-nums">{fmtMoney(amounts.bonus)}</dd></div>
        <div><dt className="text-xs text-slate-500">Demos ({counts.qualified_demos})</dt><dd className="font-semibold tabular-nums">{fmtMoney(amounts.qualified_demos)}</dd></div>
        <div><dt className="text-xs text-slate-500">Closes ({counts.closes})</dt><dd className="font-semibold tabular-nums">{fmtMoney(amounts.closes)}</dd></div>
        <div>
          <dt className="text-xs text-slate-500">{hasExclusions ? "Adjusted total" : "Total"}</dt>
          <dd className="font-bold tabular-nums text-emerald-400">{fmtMoney(amounts.total)}</dd>
        </div>
      </dl>
    );
  }

  const r = row as SalariedCommissionRow;
  return (
    <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
      <div><dt className="text-xs text-slate-500">Base</dt><dd className="font-semibold tabular-nums">{fmtMoney(r.amounts.base)}</dd></div>
      <div><dt className="text-xs text-slate-500">Bonus</dt><dd className="font-semibold tabular-nums">{fmtMoney(r.amounts.bonus)}</dd></div>
      <div><dt className="text-xs text-slate-500">Total</dt><dd className="font-bold tabular-nums text-emerald-400">{fmtMoney(r.amounts.total)}</dd></div>
    </dl>
  );
}

function LineItemsTable({
  items,
  section,
  duplicateIds,
  exclusionMap,
  canEditExclusions,
  onToggleExclusion,
}: {
  items: PayrollReviewLineItem[];
  section: EmployeePayrollView["section"];
  duplicateIds: Set<string>;
  exclusionMap: Map<string, string>;
  canEditExclusions: boolean;
  onToggleExclusion: (eventId: string, excluded: boolean) => void;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-slate-500 py-4">No commission line items this period.</p>;
  }

  const labels = section === "b2b_setter" ? B2B_LABELS : CALL_REP_LABELS;
  const showClient = section === "call_rep";
  const showExcludeCol = duplicateIds.size > 0;

  return (
    <div className="overflow-x-auto rounded-lg" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
      <table className="w-full text-xs">
        <thead>
          <tr style={{ background: "#050c18" }}>
            {showExcludeCol && (
              <th className="px-2 py-2 text-center font-semibold uppercase tracking-wider text-slate-500 w-16">Exclude</th>
            )}
            {["Date", "Type", "Lead", "Phone", ...(showClient ? ["Client"] : []), "Pay", "Status"].map(h => (
              <th key={h} className="px-3 py-2 text-left font-semibold uppercase tracking-wider text-slate-500">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => {
            const excluded = exclusionMap.has(item.event_id);
            const isDuplicate = duplicateIds.has(item.event_id);
            const reason = exclusionMap.get(item.event_id);
            return (
              <tr
                key={`${item.event_id}-${i}`}
                style={{
                  borderTop: "1px solid rgba(255,255,255,0.04)",
                  background: excluded ? "rgba(239,68,68,0.06)" : isDuplicate ? "rgba(245,158,11,0.04)" : "transparent",
                  opacity: excluded ? 0.85 : 1,
                }}
              >
                {showExcludeCol && (
                  <td className="px-2 py-2 text-center">
                    {isDuplicate ? (
                      <input
                        type="checkbox"
                        checked={excluded}
                        disabled={!canEditExclusions}
                        onChange={e => onToggleExclusion(item.event_id, e.target.checked)}
                        title="Exclude from pay (duplicate lead)"
                      />
                    ) : null}
                  </td>
                )}
                <td className="px-3 py-2 text-slate-300">{item.date}</td>
                <td className="px-3 py-2">{labels[item.type] ?? item.type}</td>
                <td className="px-3 py-2 text-slate-200">{item.lead_name ?? "—"}</td>
                <td className="px-3 py-2 font-mono text-slate-500">{item.lead_phone ?? "—"}</td>
                {showClient && <td className="px-3 py-2 text-slate-400">{item.client_name ?? "—"}</td>}
                <td className={`px-3 py-2 text-right tabular-nums ${excluded ? "text-slate-500 line-through" : "text-emerald-400"}`}>
                  {fmtMoney(item.unit_pay)}
                </td>
                <td className="px-3 py-2 text-slate-400">
                  {excluded ? (
                    <span title={reason}>{reason ?? "Excluded"}</span>
                  ) : isDuplicate ? (
                    <span style={{ color: "#fbbf24" }}>Review</span>
                  ) : (
                    "Paid"
                  )}
                </td>
              </tr>
            );
          })}
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
  const [exclusions, setExclusions] = useState<LineItemExclusion[]>(view?.lineItemExclusions ?? []);

  useEffect(() => {
    setSubmitted(view?.isSubmitted ?? false);
    setSubmitError("");
    setExclusions(view?.lineItemExclusions ?? []);
  }, [view]);

  const lineItems = useMemo(() => {
    if (!view || !("line_items" in view.row)) return [] as PayrollReviewLineItem[];
    return view.row.line_items as PayrollReviewLineItem[];
  }, [view]);

  const duplicateGroups = useMemo(() => detectDuplicateLeadGroups(lineItems), [lineItems]);
  const duplicateIds = useMemo(() => duplicateEventIds(duplicateGroups), [duplicateGroups]);
  const exclusionMap = useMemo(() => exclusionsToMap(exclusions), [exclusions]);

  const adjusted = useMemo(() => {
    if (!view || view.section === "salaried") return null;
    if (exclusions.length === 0) return null;
    return applyPayrollExclusions(view.section, view.row as AgentCommissionRow | B2BSetterCommissionRow, exclusions);
  }, [view, exclusions]);

  if (!view) return null;

  const pendingCount = view.row.pending_disposition?.count ?? 0;
  const canSubmit = !submitted && !view.readOnly;
  const canEditExclusions = canSubmit;
  const hasExclusions = exclusions.length > 0;

  const pdfView: EmployeePayrollView = {
    ...view,
    lineItemExclusions: exclusions,
  };

  function toggleExclusion(eventId: string, excluded: boolean) {
    if (!canEditExclusions) return;
    setExclusions(prev => {
      if (excluded) {
        if (prev.some(e => e.event_id === eventId)) return prev;
        return [...prev, { event_id: eventId, reason: DUPLICATE_LEAD_EXCLUSION_REASON }];
      }
      return prev.filter(e => e.event_id !== eventId);
    });
  }

  async function handleSubmit() {
    if (!canSubmit) return;
    const msg = `Submit payroll for ${view!.agent_name} (${view!.periodLabel})?\n\nThis locks their pay snapshot for the month.${
      hasExclusions ? `\n\n${exclusions.length} duplicate line item(s) will be excluded from pay.` : ""
    }`;
    if (!confirm(msg)) return;

    setSubmitting(true);
    setSubmitError("");
    try {
      const res = await fetch(
        `/api/payroll-runs/${view!.periodMonth}/employees/${view!.agent_id}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            section: view!.section,
            line_item_exclusions: exclusions,
          }),
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
          <DuplicateLeadBanner groups={duplicateGroups} exclusionCount={exclusions.length} />

          <section>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Pay rates</h4>
            <RatesSummary view={view} />
          </section>

          <section>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Earnings summary</h4>
            <AmountBreakdown view={view} adjusted={adjusted} hasExclusions={hasExclusions} />
          </section>

          <section>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Line items</h4>
            <LineItemsTable
              items={lineItems}
              section={view.section}
              duplicateIds={duplicateIds}
              exclusionMap={exclusionMap}
              canEditExclusions={canEditExclusions}
              onToggleExclusion={toggleExclusion}
            />
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
              onClick={() => downloadPayrollStatementPdf(pdfView)}
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
            Duplicate exclusions appear on the PDF with reasons. Past pay runs live under Team Roster → employee file → Pay history.
          </p>
        </div>
      </div>
    </div>
  );
}

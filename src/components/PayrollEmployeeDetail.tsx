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
  onViewDuplicates,
}: {
  groups: DuplicateLeadGroup[];
  exclusionCount: number;
  onViewDuplicates?: () => void;
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
        {groups.length} lead{groups.length === 1 ? "" : "s"} have overlapping conversation credits.
        Booking + show on the same lead is allowed. Flagged when there are multiple bookings, shows, or transfers,
        live transfer combined with booking/show, or all three types on one lead.
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
      {onViewDuplicates && (
        <button
          type="button"
          onClick={onViewDuplicates}
          className="text-xs font-semibold px-3 py-1.5 rounded-lg mt-1"
          style={{ background: "rgba(245,158,11,0.2)", color: "#fbbf24" }}
        >
          View duplicates side by side →
        </button>
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

function typeLabel(type: string, section: EmployeePayrollView["section"]): string {
  if (section === "b2b_setter") return B2B_LABELS[type] ?? type;
  return CALL_REP_LABELS[type] ?? type;
}

function DuplicateComparePanel({
  groups,
  section,
  exclusionMap,
  canEditExclusions,
  onToggleExclusion,
}: {
  groups: DuplicateLeadGroup[];
  section: EmployeePayrollView["section"];
  exclusionMap: Map<string, string>;
  canEditExclusions: boolean;
  onToggleExclusion: (eventId: string, excluded: boolean) => void;
}) {
  const showClient = section === "call_rep";

  if (groups.length === 0) {
    return (
      <p className="text-sm py-6 text-center" style={{ color: "#64748b" }}>
        No duplicate lead credits detected for this period.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs" style={{ color: "#94a3b8" }}>
        Each card is one lead with conflicting credits. Booking + show together is valid pay.
        Exclude extra bookings, shows, transfers, or live transfers stacked on the same lead.
      </p>
      {groups.map(group => (
        <div
          key={group.lead_key}
          className="rounded-xl overflow-hidden"
          style={{ border: "1px solid rgba(245,158,11,0.35)", background: "rgba(245,158,11,0.04)" }}
        >
          <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-2" style={{ borderBottom: "1px solid rgba(245,158,11,0.2)" }}>
            <div>
              <p className="text-sm font-semibold" style={{ color: "#fde68a" }}>{group.lead_label}</p>
              <p className="text-[10px] mt-0.5 uppercase tracking-wider" style={{ color: "#fbbf24" }}>
                {group.items.length} payable events · pick which to exclude
              </p>
            </div>
            <span className="text-[10px] font-semibold uppercase px-2 py-1 rounded" style={{ background: "rgba(245,158,11,0.15)", color: "#fbbf24" }}>
              Duplicate
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 p-4">
            {group.items.map(item => {
              const excluded = exclusionMap.has(item.event_id);
              return (
                <div
                  key={item.event_id}
                  className="rounded-lg p-4 flex flex-col gap-3 min-w-0"
                  style={{
                    border: excluded ? "1px solid rgba(239,68,68,0.4)" : "1px solid rgba(255,255,255,0.08)",
                    background: excluded ? "rgba(239,68,68,0.08)" : "#050c18",
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span
                      className="text-xs font-bold uppercase tracking-wide px-2 py-1 rounded"
                      style={{ background: "rgba(96,165,250,0.15)", color: "#93c5fd" }}
                    >
                      {typeLabel(item.type, section)}
                    </span>
                    <span className={`text-sm font-bold tabular-nums ${excluded ? "text-slate-500 line-through" : "text-emerald-400"}`}>
                      {fmtMoney(item.unit_pay)}
                    </span>
                  </div>
                  <dl className="space-y-2 text-xs min-w-0">
                    <div>
                      <dt className="text-slate-500 uppercase tracking-wider text-[10px]">Date</dt>
                      <dd className="text-slate-200 mt-0.5">{item.date}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-500 uppercase tracking-wider text-[10px]">Lead</dt>
                      <dd className="text-slate-200 mt-0.5 break-words">{item.lead_name ?? "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-500 uppercase tracking-wider text-[10px]">Phone</dt>
                      <dd className="text-slate-400 mt-0.5 font-mono break-all">{item.lead_phone ?? "—"}</dd>
                    </div>
                    {showClient && (
                      <div>
                        <dt className="text-slate-500 uppercase tracking-wider text-[10px]">Client</dt>
                        <dd className="text-slate-400 mt-0.5 break-words">{item.client_name ?? "—"}</dd>
                      </div>
                    )}
                  </dl>
                  <label className="mt-auto flex items-center gap-2 text-xs cursor-pointer pt-2 border-t" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                    <input
                      type="checkbox"
                      checked={excluded}
                      disabled={!canEditExclusions}
                      onChange={e => onToggleExclusion(item.event_id, e.target.checked)}
                    />
                    <span style={{ color: excluded ? "#f87171" : "#94a3b8" }}>
                      {excluded ? "Excluded from pay" : "Exclude from pay"}
                    </span>
                  </label>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
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
      <table className="w-full text-xs min-w-[720px]">
        <thead>
          <tr style={{ background: "#050c18" }}>
            {showExcludeCol && (
              <th className="px-2 py-2 text-center font-semibold uppercase tracking-wider text-slate-500 w-14 shrink-0">Excl.</th>
            )}
            {["Date", "Type", "Lead", "Phone", ...(showClient ? ["Client"] : []), "Pay", "Status"].map(h => (
              <th key={h} className="px-3 py-2 text-left font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap">{h}</th>
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
                <td className={`px-3 py-2 text-right tabular-nums whitespace-nowrap ${excluded ? "text-slate-500 line-through" : "text-emerald-400"}`}>
                  {fmtMoney(item.unit_pay)}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {excluded ? (
                    <span className="text-red-400 text-[11px]" title={reason}>Excluded</span>
                  ) : isDuplicate ? (
                    <span className="text-amber-400 text-[11px] font-medium">Review</span>
                  ) : (
                    <span className="text-slate-400 text-[11px]">Paid</span>
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
  const [lineTab, setLineTab] = useState<"all" | "duplicates">("all");

  useEffect(() => {
    setSubmitted(view?.isSubmitted ?? false);
    setSubmitError("");
    setExclusions(view?.lineItemExclusions ?? []);
    if (view && "line_items" in view.row) {
      const groups = detectDuplicateLeadGroups(view.row.line_items as PayrollReviewLineItem[]);
      setLineTab(groups.length > 0 && !view.isSubmitted ? "duplicates" : "all");
    } else {
      setLineTab("all");
    }
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
    <div className="fixed inset-0 z-50 flex" style={{ background: "rgba(0,0,0,0.55)" }} onClick={onClose}>
      <div className="flex-1 min-w-0" aria-hidden onClick={onClose} />
      <div
        className="h-full w-full max-w-none overflow-y-auto shadow-2xl flex flex-col shrink-0"
        style={{
          width: "min(96vw, 1400px)",
          background: "#0a1628",
          borderLeft: "1px solid rgba(255,255,255,0.08)",
        }}
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
          <DuplicateLeadBanner
            groups={duplicateGroups}
            exclusionCount={exclusions.length}
            onViewDuplicates={duplicateGroups.length > 0 ? () => setLineTab("duplicates") : undefined}
          />

          <section>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Pay rates</h4>
            <RatesSummary view={view} />
          </section>

          <section>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Earnings summary</h4>
            <AmountBreakdown view={view} adjusted={adjusted} hasExclusions={hasExclusions} />
          </section>

          <section>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Line items</h4>
              {duplicateGroups.length > 0 && (
                <div className="flex gap-1 rounded-lg p-1" style={{ background: "rgba(255,255,255,0.04)" }}>
                  {([
                    ["all", `All (${lineItems.length})`],
                    ["duplicates", `Duplicates (${duplicateGroups.length})`],
                  ] as const).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setLineTab(key)}
                      className="px-3 py-1.5 rounded-md text-xs font-semibold transition-colors"
                      style={lineTab === key
                        ? key === "duplicates"
                          ? { background: "rgba(245,158,11,0.2)", color: "#fbbf24" }
                          : { background: "rgba(96,165,250,0.15)", color: "#93c5fd" }
                        : { color: "#64748b" }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {lineTab === "duplicates" ? (
              <DuplicateComparePanel
                groups={duplicateGroups}
                section={view.section}
                exclusionMap={exclusionMap}
                canEditExclusions={canEditExclusions}
                onToggleExclusion={toggleExclusion}
              />
            ) : (
              <LineItemsTable
                items={lineItems}
                section={view.section}
                duplicateIds={duplicateIds}
                exclusionMap={exclusionMap}
                canEditExclusions={canEditExclusions}
                onToggleExclusion={toggleExclusion}
              />
            )}
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

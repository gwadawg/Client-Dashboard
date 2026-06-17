"use client";

import { useMemo, useState } from "react";
import type { MetricsResult } from "@/lib/metrics";
import { formatKpiValue } from "@/lib/kpi-layouts";
import ConversionFunnel from "./ConversionFunnel";
import KpiCard from "./kpi/KpiCard";
import KpiSection from "./kpi/KpiSection";

type Props = {
  metrics: MetricsResult;
  clientLabel?: string;
  onBack: () => void;
};

const AMBER = "#f59e0b";
const GOOD = "#34d399";
const MUTED = "#475569";

function safeRate(part: number, whole: number): number | null {
  if (whole <= 0) return null;
  return (part / whole) * 100;
}

function money(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return formatKpiValue(v, "money");
}

function pct(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v.toFixed(1)}%`;
}

function ratio(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v.toFixed(2)}×`;
}

function parseCommissionInput(raw: string): number {
  const n = Number(raw.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

type ScenarioResult = {
  spend: number;
  leads: number;
  proposals: number;
  submissions: number;
  funded: number;
  revenue: number;
  roas: number | null;
  cpFunded: number | null;
};

function projectScenario(
  metrics: MetricsResult,
  spendMultiplier: number,
  conversionMultiplier: number,
  avgCommission: number,
): ScenarioResult {
  const leads = metrics.new_leads;
  const proposals = metrics.proposals_made;
  const submissions = metrics.submissions_made;
  const funded = metrics.funded_loans;
  const spend = metrics.ad_spend;

  const leadToProposal = leads > 0 ? proposals / leads : 0;
  const proposalToSubmission = proposals > 0 ? submissions / proposals : 0;
  const submissionToFunded = submissions > 0 ? funded / submissions : 0;

  const projLeads = leads * spendMultiplier;
  const projProposals = projLeads * leadToProposal * conversionMultiplier;
  const projSubmissions = projProposals * proposalToSubmission * conversionMultiplier;
  const projFunded = projSubmissions * submissionToFunded * conversionMultiplier;
  const projSpend = spend * spendMultiplier;
  const projRevenue = projFunded * avgCommission;

  return {
    spend: projSpend,
    leads: projLeads,
    proposals: projProposals,
    submissions: projSubmissions,
    funded: projFunded,
    revenue: projRevenue,
    roas: projSpend > 0 ? projRevenue / projSpend : null,
    cpFunded: projFunded > 0 ? projSpend / projFunded : null,
  };
}

function CompareBar({
  label,
  current,
  projected,
  format,
}: {
  label: string;
  current: number;
  projected: number;
  format: "money" | "int" | "ratio";
}) {
  const max = Math.max(current, projected, 1);
  const currentPct = (current / max) * 100;
  const projectedPct = (projected / max) * 100;
  const fmt = (v: number) =>
    format === "money" ? money(v) : format === "ratio" ? ratio(v) : Math.round(v).toLocaleString();

  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-2">
        <span style={{ color: "#94a3b8" }}>{label}</span>
        <span className="tabular-nums" style={{ color: "#64748b" }}>
          {fmt(current)} → <span style={{ color: AMBER }}>{fmt(projected)}</span>
        </span>
      </div>
      <div className="space-y-1.5">
        <div className="h-2 rounded-full overflow-hidden" style={{ background: "#0a1628" }}>
          <div className="h-full rounded-full" style={{ width: `${currentPct}%`, background: "#3b82f6" }} />
        </div>
        <div className="h-2 rounded-full overflow-hidden" style={{ background: "#0a1628" }}>
          <div className="h-full rounded-full" style={{ width: `${projectedPct}%`, background: AMBER }} />
        </div>
      </div>
    </div>
  );
}

/**
 * Client-facing conversion & ROI view: pipeline rates, commission-based ROAS,
 * and simple spend / conversion what-if scenarios.
 */
export default function ClientConversionsView({ metrics, clientLabel, onBack }: Props) {
  const [avgCommissionInput, setAvgCommissionInput] = useState("");
  const [spendIncreasePct, setSpendIncreasePct] = useState(25);
  const [conversionLiftPct, setConversionLiftPct] = useState(10);

  const avgCommission = parseCommissionInput(avgCommissionInput);

  const rates = useMemo(() => ({
    proposalToSubmission: safeRate(metrics.submissions_made, metrics.proposals_made),
    submissionToFunded: safeRate(metrics.funded_loans, metrics.submissions_made),
    proposalToFunded: safeRate(metrics.funded_loans, metrics.proposals_made),
    leadToFunded: safeRate(metrics.funded_loans, metrics.new_leads),
  }), [metrics]);

  const current = useMemo(() => {
    const revenue = metrics.funded_loans * avgCommission;
    const spend = metrics.ad_spend;
    return {
      revenue,
      roas: spend > 0 && avgCommission > 0 ? revenue / spend : null,
      cpFunded: metrics.funded_loans > 0 ? spend / metrics.funded_loans : null,
    };
  }, [metrics, avgCommission]);

  const projected = useMemo(
    () =>
      projectScenario(
        metrics,
        1 + spendIncreasePct / 100,
        1 + conversionLiftPct / 100,
        avgCommission,
      ),
    [metrics, spendIncreasePct, conversionLiftPct, avgCommission],
  );

  const hasCommission = avgCommission > 0;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-sm font-medium mb-2 transition-colors hover:opacity-80"
            style={{ color: "#94a3b8" }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to dashboard
          </button>
          <h2 className="text-lg font-semibold" style={{ color: "#e2e8f0" }}>
            Conversions &amp; ROI
          </h2>
          <p className="text-xs mt-0.5 max-w-xl" style={{ color: MUTED }}>
            {clientLabel
              ? `Pipeline outcomes for ${clientLabel} in the selected date range.`
              : "Pipeline outcomes for the selected client and date range."}
            {" "}Use the scenario planner to estimate revenue if spend or close rates improve.
          </p>
        </div>
      </div>

      <KpiSection title="Pipeline outcomes">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <KpiCard label="Proposals Made" value={formatKpiValue(metrics.proposals_made, "int")} hint="Unique leads at proposal stage or beyond." />
          <KpiCard label="Submissions" value={formatKpiValue(metrics.submissions_made, "int")} hint="Unique leads submitted or funded." />
          <KpiCard label="Funded Loans" value={formatKpiValue(metrics.funded_loans, "int")} accent hint="Deals that closed and funded." />
          <KpiCard label="Total Spend" value={formatKpiValue(metrics.ad_spend, "money")} hint="Meta ad spend in this range." />
          <KpiCard label="Cost per Funded" value={formatKpiValue(metrics.cp_loan_funded, "money")} hint="Total Spend ÷ Funded Loans." />
          <KpiCard
            label="Est. Commission Rev."
            value={hasCommission ? money(current.revenue) : "—"}
            accent={hasCommission}
            hint={hasCommission ? `Funded Loans × $${avgCommission.toLocaleString()} avg commission.` : "Enter average commission below to estimate revenue."}
          />
        </div>
      </KpiSection>

      <KpiSection title="Conversion rates" showDivider footnote="Each rate is step conversion between pipeline stages. Proposal → Funded is the end-to-end close rate from proposal stage.">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard
            label="Proposal → Submitted"
            value={pct(rates.proposalToSubmission)}
            accent
            hint="Submissions ÷ Proposals Made × 100"
          />
          <KpiCard
            label="Submitted → Funded"
            value={pct(rates.submissionToFunded)}
            hint="Funded Loans ÷ Submissions × 100"
          />
          <KpiCard
            label="Proposal → Funded"
            value={pct(rates.proposalToFunded)}
            accent
            hint="Funded Loans ÷ Proposals Made × 100 — full pipeline close rate."
          />
          <KpiCard
            label="Lead → Funded"
            value={pct(rates.leadToFunded)}
            hint="Funded Loans ÷ Total Leads × 100"
          />
        </div>
      </KpiSection>

      <KpiSection title="Funnel" showDivider>
        <div className="grid gap-4 lg:grid-cols-2">
          <ConversionFunnel metrics={metrics} />
          <div
            className="rounded-xl p-5"
            style={{ background: "linear-gradient(135deg, #0f2040 0%, #0c1a30 100%)", border: "1px solid rgba(255,255,255,0.07)" }}
          >
            <h3 className="text-sm font-semibold mb-1" style={{ color: "#e2e8f0" }}>Stage costs</h3>
            <p className="text-[10px] mb-4" style={{ color: MUTED }}>
              Marketing efficiency at each conversion milestone.
            </p>
            <div className="space-y-3">
              {[
                { label: "Cost per Proposal", value: metrics.cp_proposal_made },
                { label: "Cost per Submission", value: metrics.cp_submission_made },
                { label: "Cost per Funded", value: metrics.cp_loan_funded },
              ].map(row => (
                <div key={row.label} className="flex items-center justify-between text-sm">
                  <span style={{ color: "#94a3b8" }}>{row.label}</span>
                  <span className="font-semibold tabular-nums" style={{ color: "#e2e8f0" }}>
                    {formatKpiValue(row.value, "money")}
                  </span>
                </div>
              ))}
            </div>
            {hasCommission && (
              <div className="mt-5 pt-4" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                <div className="flex items-center justify-between text-sm">
                  <span style={{ color: "#94a3b8" }}>ROAS (commission)</span>
                  <span className="font-bold text-lg tabular-nums" style={{ color: current.roas != null && current.roas >= 1 ? GOOD : AMBER }}>
                    {ratio(current.roas)}
                  </span>
                </div>
                <p className="text-[10px] mt-1" style={{ color: MUTED }}>
                  Est. commission revenue ÷ ad spend
                </p>
              </div>
            )}
          </div>
        </div>
      </KpiSection>

      <KpiSection
        title="Revenue inputs"
        showDivider
        footnote="Average commission is a placeholder until loan-level commission data is wired in. ROAS uses estimated commission revenue, not loan amount."
      >
        <div
          className="rounded-xl p-5 max-w-md"
          style={{ background: "#0a1424", border: "1px solid rgba(255,255,255,0.06)" }}
        >
          <label htmlFor="avg-commission" className="block text-xs font-medium uppercase tracking-wider mb-2" style={{ color: MUTED }}>
            Average commission per funded loan
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: "#64748b" }}>$</span>
            <input
              id="avg-commission"
              type="text"
              inputMode="decimal"
              placeholder="e.g. 8,500"
              value={avgCommissionInput}
              onChange={e => setAvgCommissionInput(e.target.value)}
              className="w-full pl-7 pr-4 py-2.5 rounded-lg text-sm font-medium outline-none"
              style={{ background: "#0f2040", border: "1px solid rgba(255,255,255,0.12)", color: "#e2e8f0" }}
            />
          </div>
          <p className="text-[11px] mt-2 leading-relaxed" style={{ color: "#64748b" }}>
            Used to estimate commission revenue and ROAS. Leave blank to hide revenue projections.
          </p>
        </div>
      </KpiSection>

      <KpiSection
        title="What-if scenario"
        showDivider
        footnote="Assumes CPL stays flat when spend increases (more spend → proportionally more leads). Conversion lift applies evenly across pipeline stages."
      >
        <div
          className="rounded-xl p-5 space-y-6"
          style={{ background: "linear-gradient(135deg, #0f2040 0%, #0c1a30 100%)", border: "1px solid rgba(255,255,255,0.07)" }}
        >
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <div className="flex items-center justify-between mb-2">
                <label htmlFor="spend-slider" className="text-sm font-medium" style={{ color: "#cbd5e1" }}>
                  Increase ad spend
                </label>
                <span className="text-sm font-bold tabular-nums" style={{ color: AMBER }}>
                  +{spendIncreasePct}%
                </span>
              </div>
              <input
                id="spend-slider"
                type="range"
                min={0}
                max={100}
                step={5}
                value={spendIncreasePct}
                onChange={e => setSpendIncreasePct(Number(e.target.value))}
                className="w-full accent-amber-500"
              />
              <p className="text-[10px] mt-1" style={{ color: MUTED }}>
                {money(metrics.ad_spend)} → {money(projected.spend)}
              </p>
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <label htmlFor="conv-slider" className="text-sm font-medium" style={{ color: "#cbd5e1" }}>
                  Improve conversion rates
                </label>
                <span className="text-sm font-bold tabular-nums" style={{ color: GOOD }}>
                  +{conversionLiftPct}%
                </span>
              </div>
              <input
                id="conv-slider"
                type="range"
                min={0}
                max={50}
                step={5}
                value={conversionLiftPct}
                onChange={e => setConversionLiftPct(Number(e.target.value))}
                className="w-full accent-emerald-500"
              />
              <p className="text-[10px] mt-1" style={{ color: MUTED }}>
                Applies to proposal, submission, and funded stage rates.
              </p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg p-4" style={{ background: "#0a1628" }}>
              <p className="text-[10px] uppercase tracking-wider" style={{ color: MUTED }}>Projected funded</p>
              <p className="text-2xl font-bold mt-1 tabular-nums" style={{ color: "#e2e8f0" }}>
                {Math.round(projected.funded).toLocaleString()}
              </p>
              <p className="text-[11px] mt-0.5" style={{ color: "#64748b" }}>
                vs {metrics.funded_loans} now
              </p>
            </div>
            <div className="rounded-lg p-4" style={{ background: "#0a1628" }}>
              <p className="text-[10px] uppercase tracking-wider" style={{ color: MUTED }}>Projected spend</p>
              <p className="text-2xl font-bold mt-1 tabular-nums" style={{ color: "#e2e8f0" }}>
                {money(projected.spend)}
              </p>
              <p className="text-[11px] mt-0.5" style={{ color: "#64748b" }}>
                CP funded {money(projected.cpFunded)}
              </p>
            </div>
            <div className="rounded-lg p-4" style={{ background: "#0a1628" }}>
              <p className="text-[10px] uppercase tracking-wider" style={{ color: MUTED }}>Est. commission rev.</p>
              <p className="text-2xl font-bold mt-1 tabular-nums" style={{ color: hasCommission ? AMBER : "#334155" }}>
                {hasCommission ? money(projected.revenue) : "—"}
              </p>
              <p className="text-[11px] mt-0.5" style={{ color: "#64748b" }}>
                {hasCommission ? `vs ${money(current.revenue)} now` : "Set avg commission"}
              </p>
            </div>
            <div className="rounded-lg p-4" style={{ background: "#0a1628" }}>
              <p className="text-[10px] uppercase tracking-wider" style={{ color: MUTED }}>Projected ROAS</p>
              <p
                className="text-2xl font-bold mt-1 tabular-nums"
                style={{ color: hasCommission && projected.roas != null && projected.roas >= 1 ? GOOD : hasCommission ? AMBER : "#334155" }}
              >
                {hasCommission ? ratio(projected.roas) : "—"}
              </p>
              <p className="text-[11px] mt-0.5" style={{ color: "#64748b" }}>
                {hasCommission ? `vs ${ratio(current.roas)} now` : "Set avg commission"}
              </p>
            </div>
          </div>

          {hasCommission && (
            <div className="space-y-4 pt-2">
              <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#64748b" }}>
                Current vs projected
              </p>
              <CompareBar label="Funded loans" current={metrics.funded_loans} projected={projected.funded} format="int" />
              <CompareBar label="Commission revenue" current={current.revenue} projected={projected.revenue} format="money" />
              <CompareBar
                label="ROAS"
                current={current.roas ?? 0}
                projected={projected.roas ?? 0}
                format="ratio"
              />
            </div>
          )}
        </div>
      </KpiSection>
    </div>
  );
}

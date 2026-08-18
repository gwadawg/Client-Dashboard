"use client";

import dynamic from "next/dynamic";
import ShowQualityBar from "../ShowQualityBar";
import ConversionFunnel from "../ConversionFunnel";
import KpiSections, { type SparkMap } from "../kpi/KpiSections";
import KpiSection from "../kpi/KpiSection";
import KpiCard from "../kpi/KpiCard";
import ClientKpiPeriodBar from "../ClientKpiPeriodBar";
import { formatKpiValue, usesRmKpiLayout, type ReportingType } from "@/lib/kpi-layouts";
import {
  shouldShowConversionCosts,
  type ConversionStage,
} from "@/lib/conversion-explorer";
import type { CostTrendPoint, KpiTimelineBucket, MetricsResult } from "@/lib/metrics";
import type { DashboardClient, DashboardFilters } from "@/lib/use-dashboard-filters";

const CostTrendCharts = dynamic(() => import("../CostTrendCharts"));
const RateTrendCharts = dynamic(() => import("../RateTrendCharts"));
const ClientConversionsView = dynamic(() => import("../ClientConversionsView"));

export type TrendsPayload = {
  granularity: "day" | "week";
  kpiSeries: KpiTimelineBucket[];
  series: CostTrendPoint[];
};

export type ClientKpiPanelData = {
  metrics: MetricsResult | null;
  prevMetrics: MetricsResult | null;
  metricsLoading: boolean;
  sparkMap: SparkMap | null;
  trends: TrendsPayload | null;
  trendsLoading: boolean;
  trendsError: string;
  reportingType: ReportingType;
  hasMixedReportingTypes: boolean;
  clientLabel?: string;
  overduePending: number | null;
};

type Props = {
  data: ClientKpiPanelData;
  filters: DashboardFilters;
  selectedClient: DashboardClient | null;
  /** True when `?sub=conversions` — the pipeline drill-in. */
  showConversions: boolean;
  onOpenConversions: () => void;
  onCloseConversions: () => void;
  /** Jump to Explorer → Appointments filtered to the un-dispositioned backlog. */
  onReviewOverdue: () => void;
  /** When true, unique-lead conversion cards open Explorer. */
  canOpenExplorer: boolean;
  onOpenConversionLeads: (stage: ConversionStage) => void;
};

export default function ClientKpiPanel({
  data,
  filters,
  selectedClient,
  showConversions,
  onOpenConversions,
  onCloseConversions,
  onReviewOverdue,
  canOpenExplorer,
  onOpenConversionLeads,
}: Props) {
  const {
    metrics,
    prevMetrics,
    metricsLoading,
    sparkMap,
    trends,
    trendsLoading,
    trendsError,
    reportingType,
    hasMixedReportingTypes,
    clientLabel,
    overduePending,
  } = data;

  const hasDateRange = Boolean(filters.dateStart && filters.dateEnd);
  const conversions = showConversions;
  const showCosts = metrics ? shouldShowConversionCosts(metrics.ad_spend) : false;
  const openStage = canOpenExplorer
    ? (stage: ConversionStage) => onOpenConversionLeads(stage)
    : undefined;

  return (
    <div className="space-y-8">
      {selectedClient && (
        <ClientKpiPeriodBar
          clientName={selectedClient.name}
          client={selectedClient}
          todayYmd={filters.todayYmd}
          preset={filters.preset}
          customStart={filters.customStart}
          customEnd={filters.customEnd}
        />
      )}

      {overduePending != null && overduePending > 0 && (
        <button
          type="button"
          onClick={onReviewOverdue}
          className="w-full flex items-center gap-3.5 text-left rounded-xl px-4 py-3 transition-colors"
          style={{ background: "rgba(245,158,11,0.10)", border: "1px solid rgba(245,158,11,0.45)" }}
        >
          <div
            className="flex items-center justify-center rounded-lg shrink-0"
            style={{ width: "2.25rem", height: "2.25rem", background: "rgba(245,158,11,0.16)" }}
          >
            <span className="font-data text-base font-bold tabular-nums" style={{ color: "#fbbf24" }}>
              {overduePending}
            </span>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold" style={{ color: "#fbbf24" }}>
              {overduePending} past-due appointment{overduePending === 1 ? "" : "s"} awaiting disposition
            </p>
            <p className="text-xs mt-0.5" style={{ color: "#a16207" }}>
              Their scheduled day has passed but they aren&apos;t marked show, no-show, cancelled, or LO bailed — this drags down show rate. Same-day appointments are excluded until tomorrow. Click to review. (All-time total, ignores the date filter.)
            </p>
          </div>
          <span className="ml-auto text-sm font-medium shrink-0 hidden sm:inline" style={{ color: "#fbbf24" }}>
            Review →
          </span>
        </button>
      )}

      {metricsLoading && !metrics ? (
        <div className="flex items-center justify-center py-24">
          <div className="flex items-center gap-3" style={{ color: "#334155" }}>
            <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span className="text-sm font-medium">Loading metrics…</span>
          </div>
        </div>
      ) : metrics ? (
        conversions ? (
          <ClientConversionsView
            metrics={metrics}
            clientLabel={clientLabel}
            onBack={onCloseConversions}
          />
        ) : (
          // Refetches keep the previous numbers on screen and dim them, so
          // changing scope never blanks the page you are auditing.
          <div
            className="space-y-6 transition-opacity duration-200"
            style={{ opacity: metricsLoading ? 0.55 : 1 }}
            aria-busy={metricsLoading}
          >
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onOpenConversions}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors"
                style={{ background: "rgba(245,158,11,0.15)", color: "#fbbf24", border: "1px solid rgba(245,158,11,0.4)" }}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
                Conversions &amp; ROI
              </button>
            </div>

            {hasMixedReportingTypes && (
              <p
                className="text-xs rounded-lg px-3 py-2"
                style={{ color: "#64748b", background: "#0a1628", border: "1px solid rgba(255,255,255,0.06)" }}
              >
                Mixed offer types (RM / HE / DSCR) in this selection. Showing the full RM dashboard for this combined view.
              </p>
            )}

            <KpiSections
              metrics={metrics}
              reportingType={reportingType}
              previous={filters.compare ? prevMetrics : null}
              spark={sparkMap}
            />

            <KpiSection title="Appointment Breakdown">
              <div className="grid gap-4 lg:grid-cols-2">
                <ShowQualityBar metrics={metrics} />
                <ConversionFunnel metrics={metrics} />
              </div>
            </KpiSection>

            <KpiSection
              title="Conversions"
              footnote="Borrowers are unique people in the funnel (cost per funded person). Transactions are each loan file — two loans on the same house count as two. Cost per funded transaction uses that count."
            >
              <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(12.5rem,1fr))]">
                <KpiCard
                  label="Proposals Made"
                  value={formatKpiValue(metrics.proposals_made, "int")}
                  hint="Unique leads that reached the proposal stage or beyond (submitted/funded count too)."
                  onActivate={openStage ? () => openStage("proposal_made") : undefined}
                />
                <KpiCard
                  label="Submissions"
                  value={formatKpiValue(metrics.submissions_made, "int")}
                  hint="Unique borrowers that reached the submission stage or beyond."
                  onActivate={openStage ? () => openStage("submission_made") : undefined}
                />
                <KpiCard
                  label="Funded Transactions"
                  value={formatKpiValue(metrics.funded_deals, "int")}
                  accent
                  hint="Each loan file that funded in this range. Same borrower or same house, two loans = two transactions."
                />
                <KpiCard
                  label="Unique Funded Borrowers"
                  value={formatKpiValue(metrics.funded_loans, "int")}
                  hint="Unique people with at least one funded loan — conversion / CAC grain."
                  onActivate={openStage ? () => openStage("loan_funded") : undefined}
                />
                <KpiCard
                  label="Loan Volume"
                  value={formatKpiValue(metrics.loan_volume, "money")}
                  hint="Sum of loan size on funded transactions in this range."
                />
                {showCosts && (
                  <>
                    <KpiCard
                      label="Cost per Funded Transaction"
                      value={formatKpiValue(metrics.cp_funded_deal, "money")}
                      hint="Total Spend ÷ Funded Transactions."
                    />
                    <KpiCard
                      label="Cost per Funded Borrower"
                      value={formatKpiValue(metrics.cp_loan_funded, "money")}
                      hint="Total Spend ÷ Unique Funded Borrowers."
                    />
                    <KpiCard
                      label="Cost per Proposal"
                      value={formatKpiValue(metrics.cp_proposal_made, "money")}
                      hint="Total Spend ÷ Proposals Made."
                    />
                    <KpiCard
                      label="Cost per Submission"
                      value={formatKpiValue(metrics.cp_submission_made, "money")}
                      hint="Total Spend ÷ unique submitted borrowers."
                    />
                    {metrics.roas != null && (
                      <KpiCard
                        label="ROAS"
                        value={`${metrics.roas.toFixed(2)}x`}
                        accent
                        hint="What they made (logged on funded transactions) ÷ ad spend. Hidden until someone logs earnings."
                      />
                    )}
                  </>
                )}
              </div>
            </KpiSection>

            <KpiSection title="Rate Trends">
              <RateTrendCharts
                kpiSeries={trends?.kpiSeries ?? []}
                granularity={trends?.granularity ?? "day"}
                loading={trendsLoading}
                error={trendsError}
                hasDateRange={hasDateRange}
                reportingType={reportingType}
              />
            </KpiSection>

            {usesRmKpiLayout(reportingType) && (
              <KpiSection title="Cost Trends">
                <CostTrendCharts
                  series={trends?.series ?? []}
                  granularity={trends?.granularity ?? "day"}
                  loading={trendsLoading}
                  error={trendsError}
                  hasDateRange={hasDateRange}
                />
              </KpiSection>
            )}
          </div>
        )
      ) : null}
    </div>
  );
}

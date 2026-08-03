"use client";

import type {
  ClientReportItemized,
  ClientReportLeadRow,
  ClientReportWorkBundle,
  ClientReportWorkRow,
} from "@/lib/client-report-itemized";
import type { MetricsResult, KpiTimelineBucket, CostTrendPoint } from "@/lib/metrics";
import {
  formatKpiValue,
  type KpiSectionDefinition,
  type ReportingType,
} from "@/lib/kpi-layouts";
import type { ClientReportChartFlags } from "@/lib/client-report-defaults";
import RateTrendCharts from "@/components/RateTrendCharts";
import CostTrendCharts from "@/components/CostTrendCharts";

type Props = {
  clientName: string;
  title: string;
  rangeLabel: string;
  generatedAt?: string;
  metrics: MetricsResult;
  sections: KpiSectionDefinition[];
  charts: ClientReportChartFlags;
  reportingType: ReportingType;
  showCostCharts: boolean;
  kpiSeries?: KpiTimelineBucket[];
  costSeries?: CostTrendPoint[];
  trendsGranularity?: "day" | "week";
  hasDateRange: boolean;
  trendsLoading?: boolean;
  trendsError?: string;
  itemized?: ClientReportItemized | null;
  itemizedLoading?: boolean;
  itemizedError?: string;
};

const STATUS_LABEL: Record<string, string> = {
  show: "Showed",
  no_show: "No showed",
  lo_bailed: "LO bailed",
  live_transfer: "Live transfer",
  appointment_cancelled: "Cancelled",
  appointment_rescheduled: "Rescheduled",
  pending: "Pending",
  claimed: "Claimed",
};

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value.slice(0, 10);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatCardValue(
  card: KpiSectionDefinition["cards"][number],
  metrics: MetricsResult,
): string {
  const primary = formatKpiValue(metrics[card.metric], card.format);
  if (!card.secondaryMetric) return primary;
  const secondary = formatKpiValue(metrics[card.secondaryMetric], card.format);
  return `${primary} / ${secondary}`;
}

function StatusPill({ status }: { status: string }) {
  const colors: Record<string, { color: string; bg: string }> = {
    show: { color: "#166534", bg: "#dcfce7" },
    no_show: { color: "#991b1b", bg: "#fee2e2" },
    lo_bailed: { color: "#92400e", bg: "#fef3c7" },
    live_transfer: { color: "#1e40af", bg: "#dbeafe" },
    appointment_cancelled: { color: "#475569", bg: "#e2e8f0" },
    appointment_rescheduled: { color: "#075985", bg: "#e0f2fe" },
    pending: { color: "#92400e", bg: "#fef3c7" },
    claimed: { color: "#5b21b6", bg: "#ede9fe" },
  };
  const s = colors[status] ?? { color: "#475569", bg: "#f1f5f9" };
  return (
    <span
      className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold"
      style={{ color: s.color, background: s.bg }}
    >
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

function WorkTable({
  title,
  rows,
  empty,
  showStatus = false,
}: {
  title: string;
  rows: ClientReportWorkRow[];
  empty: string;
  showStatus?: boolean;
}) {
  return (
    <section className="client-report-block space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: "#64748b" }}>
          {title}
        </h3>
        <span className="text-xs font-semibold tabular-nums" style={{ color: "#64748b" }}>
          {rows.length}
        </span>
      </div>
      <div className="rounded-lg overflow-hidden border" style={{ borderColor: "#e2e8f0" }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: "#f8fafc" }}>
              <th className="text-left px-3 py-2 text-[10px] font-bold uppercase tracking-wider" style={{ color: "#64748b" }}>
                Date
              </th>
              <th className="text-left px-3 py-2 text-[10px] font-bold uppercase tracking-wider" style={{ color: "#64748b" }}>
                Lead
              </th>
              <th className="text-left px-3 py-2 text-[10px] font-bold uppercase tracking-wider" style={{ color: "#64748b" }}>
                Phone
              </th>
              {showStatus && (
                <th className="text-left px-3 py-2 text-[10px] font-bold uppercase tracking-wider" style={{ color: "#64748b" }}>
                  Status
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={showStatus ? 4 : 3}
                  className="px-3 py-6 text-center text-xs"
                  style={{ color: "#94a3b8" }}
                >
                  {empty}
                </td>
              </tr>
            ) : (
              rows.map((row, i) => (
                <tr
                  key={row.id}
                  style={{
                    background: i % 2 === 0 ? "#fff" : "#f8fafc",
                    borderTop: "1px solid #f1f5f9",
                  }}
                >
                  <td className="px-3 py-2 text-xs tabular-nums whitespace-nowrap" style={{ color: "#475569" }}>
                    {formatDateTime(row.date)}
                  </td>
                  <td className="px-3 py-2 font-medium" style={{ color: "#0f172a" }}>
                    {row.lead_name || "—"}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs" style={{ color: "#475569" }}>
                    {row.lead_phone || "—"}
                  </td>
                  {showStatus && (
                    <td className="px-3 py-2">
                      <StatusPill status={row.status} />
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function LeadsTable({ rows }: { rows: ClientReportLeadRow[] }) {
  return (
    <section className="client-report-block space-y-2 mt-8">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: "#64748b" }}>
          All leads
        </h2>
        <span className="text-xs font-semibold tabular-nums" style={{ color: "#64748b" }}>
          {rows.length}
        </span>
      </div>
      <p className="text-[11px]" style={{ color: "#94a3b8" }}>
        Every new lead recorded in this period, with date received.
      </p>
      <div className="rounded-lg overflow-hidden border" style={{ borderColor: "#e2e8f0" }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: "#f8fafc" }}>
              <th className="text-left px-3 py-2 text-[10px] font-bold uppercase tracking-wider" style={{ color: "#64748b" }}>
                Date
              </th>
              <th className="text-left px-3 py-2 text-[10px] font-bold uppercase tracking-wider" style={{ color: "#64748b" }}>
                Lead
              </th>
              <th className="text-left px-3 py-2 text-[10px] font-bold uppercase tracking-wider" style={{ color: "#64748b" }}>
                Phone
              </th>
              <th className="text-left px-3 py-2 text-[10px] font-bold uppercase tracking-wider" style={{ color: "#64748b" }}>
                Source
              </th>
              <th className="text-left px-3 py-2 text-[10px] font-bold uppercase tracking-wider" style={{ color: "#64748b" }}>
                Flags
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-xs" style={{ color: "#94a3b8" }}>
                  No leads in this range.
                </td>
              </tr>
            ) : (
              rows.map((row, i) => (
                <tr
                  key={row.id}
                  style={{
                    background: i % 2 === 0 ? "#fff" : "#f8fafc",
                    borderTop: "1px solid #f1f5f9",
                  }}
                >
                  <td className="px-3 py-2 text-xs tabular-nums whitespace-nowrap" style={{ color: "#475569" }}>
                    {formatDateTime(row.date)}
                  </td>
                  <td className="px-3 py-2 font-medium" style={{ color: "#0f172a" }}>
                    {row.lead_name || "—"}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs" style={{ color: "#475569" }}>
                    {row.lead_phone || "—"}
                  </td>
                  <td className="px-3 py-2 text-xs" style={{ color: "#64748b" }}>
                    {row.lead_source || "—"}
                  </td>
                  <td className="px-3 py-2 text-[10px]" style={{ color: "#64748b" }}>
                    {[row.is_qualified ? "Qualified" : null, row.is_hot ? "Hot" : null]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ItemizedWorkSection({ work }: { work: ClientReportWorkBundle }) {
  const { summary } = work;
  return (
    <section className="client-report-block mt-8 space-y-6">
      <div>
        <h2 className="text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: "#64748b" }}>
          Itemized appointments & outcomes
        </h2>
        <p className="text-[11px] mt-1" style={{ color: "#94a3b8" }}>
          Booked leads with status, plus shows, no-shows, LO bails, live transfers, and claimed — with dates.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {[
          { label: "Booked", value: `${summary.unique_booked} / ${summary.booked}`, sub: "unique / total" },
          { label: "Showed", value: String(summary.shows) },
          { label: "No showed", value: String(summary.no_shows) },
          { label: "LO bailed", value: String(summary.lo_bailed) },
          { label: "Live transfers", value: String(summary.live_transfers) },
          { label: "Claimed", value: String(summary.claimed) },
        ].map(card => (
          <div
            key={card.label}
            className="rounded-lg px-3 py-2"
            style={{ background: "#f8fafc", border: "1px solid #e2e8f0" }}
          >
            <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "#64748b" }}>
              {card.label}
            </p>
            <p className="text-lg font-bold tabular-nums" style={{ color: "#0f172a" }}>
              {card.value}
            </p>
            {card.sub && (
              <p className="text-[10px]" style={{ color: "#94a3b8" }}>
                {card.sub}
              </p>
            )}
          </div>
        ))}
      </div>

      <div className="space-y-6">
        <WorkTable
          title="Booked appointments"
          rows={work.booked}
          empty="No appointments booked in this range."
          showStatus
        />
        <WorkTable title="Showed" rows={work.shows} empty="No shows in this range." />
        <WorkTable title="No showed" rows={work.no_shows} empty="No lead no-shows in this range." />
        <WorkTable title="LO bailed" rows={work.lo_bailed} empty="No LO bails in this range." />
        <WorkTable
          title="Live transfers"
          rows={work.live_transfers}
          empty="No live transfers in this range."
        />
        <WorkTable title="Claimed" rows={work.claimed} empty="No claimed leads in this range." />
      </div>
    </section>
  );
}

function LightShowQuality({ metrics }: { metrics: MetricsResult }) {
  const segments = [
    { key: "shows", label: "Showed", value: metrics.shows, color: "#059669" },
    { key: "no_shows", label: "No-showed", value: metrics.no_shows, color: "#dc2626" },
    { key: "lo_bailed", label: "LO bailed", value: metrics.lo_bailed, color: "#d97706" },
    { key: "cancelled", label: "Cancelled", value: metrics.appointment_cancelled, color: "#94a3b8" },
    { key: "rescheduled", label: "Rescheduled", value: metrics.appointment_rescheduled, color: "#0284c7" },
    { key: "pending", label: "Pending", value: metrics.appts_to_take_place, color: "#64748b" },
  ];
  const total = segments.reduce((sum, s) => sum + s.value, 0);

  return (
    <div className="client-report-block rounded-lg border p-5" style={{ borderColor: "#e2e8f0", background: "#fff" }}>
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold" style={{ color: "#0f172a" }}>Appointment outcomes</h3>
        <span className="text-xs tabular-nums" style={{ color: "#64748b" }}>{total} booked</span>
      </div>
      <p className="text-[11px] mb-4" style={{ color: "#64748b" }}>
        Where every booked appointment ended up. Net show rate counts only Showed vs. No-showed.
      </p>
      {total === 0 ? (
        <p className="text-xs py-6 text-center" style={{ color: "#94a3b8" }}>No appointments in this range.</p>
      ) : (
        <>
          <div className="flex w-full h-4 rounded overflow-hidden" style={{ background: "#f1f5f9" }}>
            {segments.map(s =>
              s.value > 0 ? (
                <div
                  key={s.key}
                  style={{ width: `${(s.value / total) * 100}%`, background: s.color }}
                  title={`${s.label}: ${s.value}`}
                />
              ) : null,
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-4">
            {segments.map(s => (
              <div key={s.key} className="flex items-start gap-2">
                <span className="mt-1 w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: s.color }} />
                <div className="min-w-0">
                  <p className="text-[11px] truncate" style={{ color: "#64748b" }}>{s.label}</p>
                  <p className="text-sm font-semibold tabular-nums" style={{ color: "#0f172a" }}>
                    {s.value}
                    <span className="text-[10px] font-normal ml-1" style={{ color: "#94a3b8" }}>
                      {((s.value / total) * 100).toFixed(0)}%
                    </span>
                  </p>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function LightFunnel({ metrics }: { metrics: MetricsResult }) {
  const stages = [
    { label: "Total Leads", value: metrics.new_leads },
    { label: "Qualified", value: metrics.qualified_leads },
    { label: "Booked", value: metrics.booked_appointments },
    { label: "Shows", value: metrics.shows },
    { label: "Proposals", value: metrics.proposals_made },
    { label: "Submissions", value: metrics.submissions_made },
    { label: "Funded", value: metrics.funded_loans },
  ];
  const top = stages[0]?.value ?? 0;

  function stepPct(part: number, whole: number): string {
    if (whole <= 0) return "—";
    return `${((part / whole) * 100).toFixed(1)}%`;
  }

  return (
    <div className="client-report-block rounded-lg border p-5" style={{ borderColor: "#e2e8f0", background: "#fff" }}>
      <h3 className="text-sm font-semibold mb-1" style={{ color: "#0f172a" }}>Conversion funnel</h3>
      <p className="text-[11px] mb-4" style={{ color: "#64748b" }}>
        Lead → funded. Right column is step conversion from the stage above.
      </p>
      {top === 0 ? (
        <p className="text-xs py-6 text-center" style={{ color: "#94a3b8" }}>No leads in this range.</p>
      ) : (
        <div className="space-y-2">
          {stages.map((stage, i) => {
            const prev = i > 0 ? stages[i - 1].value : null;
            const widthPct = top > 0 ? Math.max((stage.value / top) * 100, stage.value > 0 ? 4 : 0) : 0;
            const isLast = i === stages.length - 1;
            return (
              <div key={stage.label} className="flex items-center gap-3">
                <span className="text-[11px] w-20 flex-shrink-0 truncate" style={{ color: "#64748b" }}>
                  {stage.label}
                </span>
                <div className="flex-1 h-7 rounded relative overflow-hidden" style={{ background: "#f1f5f9" }}>
                  <div
                    className="h-full rounded flex items-center px-2"
                    style={{
                      width: `${widthPct}%`,
                      background: isLast
                        ? "linear-gradient(90deg, #d97706, #f59e0b)"
                        : "linear-gradient(90deg, #1e40af, #3b82f6)",
                    }}
                  >
                    <span className="text-xs font-semibold tabular-nums text-white">
                      {stage.value}
                    </span>
                  </div>
                </div>
                <span className="text-[11px] w-14 flex-shrink-0 text-right tabular-nums" style={{ color: "#64748b" }}>
                  {prev != null ? stepPct(stage.value, prev) : "100%"}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Client-clean performance sheet — light document layout for screen preview and print/PDF.
 */
export default function ClientReportSheet({
  clientName,
  title,
  rangeLabel,
  generatedAt,
  metrics,
  sections,
  charts,
  reportingType,
  showCostCharts,
  kpiSeries = [],
  costSeries = [],
  trendsGranularity = "day",
  hasDateRange,
  trendsLoading = false,
  trendsError = "",
  itemized = null,
  itemizedLoading = false,
  itemizedError = "",
}: Props) {
  const generatedLabel =
    generatedAt ??
    new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

  const wantsItemized = charts.itemizedWork || charts.itemizedLeads;

  return (
    <article className="client-report-sheet" style={{ background: "#fff", color: "#0f172a" }}>
      <header className="client-report-header pb-6 mb-6" style={{ borderBottom: "2px solid #0f172a" }}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: "linear-gradient(135deg, #1e3a5f, #0f172a)" }}
              aria-hidden
            >
              <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white">
                <path d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: "#64748b" }}>
                {title}
              </p>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight truncate" style={{ color: "#0f172a" }}>
                {clientName}
              </h1>
              <p className="text-sm mt-1" style={{ color: "#475569" }}>
                {rangeLabel}
              </p>
            </div>
          </div>
          <div className="text-right flex-shrink-0 hidden sm:block">
            <p className="text-[10px] uppercase tracking-wider" style={{ color: "#94a3b8" }}>
              Prepared
            </p>
            <p className="text-xs font-medium" style={{ color: "#475569" }}>
              {generatedLabel}
            </p>
          </div>
        </div>
      </header>

      {sections.length === 0 ? (
        <p className="text-sm py-8 text-center" style={{ color: "#94a3b8" }}>
          No KPIs selected. Choose metrics in the builder panel.
        </p>
      ) : (
        <div className="space-y-8">
          {sections.map((section, sectionIndex) => (
            <section key={section.title} className="client-report-block">
              {sectionIndex > 0 && (
                <div className="mb-6" style={{ borderTop: "1px solid #e2e8f0" }} />
              )}
              <h2
                className="text-[11px] font-bold uppercase tracking-[0.12em] mb-3"
                style={{ color: "#64748b" }}
              >
                {section.title}
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {section.cards.map(card => (
                  <div
                    key={`${section.title}-${card.label}`}
                    className="rounded-lg p-4"
                    style={{
                      background: card.accent ? "#fffbeb" : "#f8fafc",
                      border: `1px solid ${card.accent ? "#fde68a" : "#e2e8f0"}`,
                    }}
                  >
                    <p className="text-[11px] font-medium" style={{ color: "#64748b" }}>
                      {card.label}
                    </p>
                    <p className="text-2xl font-bold tabular-nums mt-1" style={{ color: "#0f172a" }}>
                      {formatCardValue(card, metrics)}
                    </p>
                    {card.valueCaption && (
                      <p className="text-[10px] mt-0.5 uppercase tracking-wide" style={{ color: "#94a3b8" }}>
                        {card.valueCaption}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {(charts.showQuality || charts.funnel) && (
        <div className="mt-8 space-y-4">
          {charts.showQuality && <LightShowQuality metrics={metrics} />}
          {charts.funnel && <LightFunnel metrics={metrics} />}
        </div>
      )}

      {charts.rateTrends && (
        <section className="client-report-block mt-8">
          <h2
            className="text-[11px] font-bold uppercase tracking-[0.12em] mb-3"
            style={{ color: "#64748b" }}
          >
            Rate trends
          </h2>
          <div className="client-report-charts rounded-lg border p-4" style={{ borderColor: "#e2e8f0" }}>
            <RateTrendCharts
              kpiSeries={kpiSeries}
              granularity={trendsGranularity}
              loading={trendsLoading}
              error={trendsError}
              hasDateRange={hasDateRange}
              reportingType={reportingType}
            />
          </div>
        </section>
      )}

      {showCostCharts && charts.costTrends && (
        <section className="client-report-block mt-8">
          <h2
            className="text-[11px] font-bold uppercase tracking-[0.12em] mb-3"
            style={{ color: "#64748b" }}
          >
            Cost trends
          </h2>
          <div className="client-report-charts rounded-lg border p-4" style={{ borderColor: "#e2e8f0" }}>
            <CostTrendCharts
              series={costSeries}
              granularity={trendsGranularity}
              loading={trendsLoading}
              error={trendsError}
              hasDateRange={hasDateRange}
            />
          </div>
        </section>
      )}

      {wantsItemized && (
        <>
          {itemizedLoading && !itemized && (
            <p className="mt-8 text-sm text-center" style={{ color: "#94a3b8" }}>
              Loading itemized lists…
            </p>
          )}
          {itemizedError && !itemizedLoading && (
            <p className="mt-8 text-sm text-center" style={{ color: "#b91c1c" }}>
              {itemizedError}
            </p>
          )}
          {itemized?.work && charts.itemizedWork && <ItemizedWorkSection work={itemized.work} />}
          {itemized?.leads && charts.itemizedLeads && <LeadsTable rows={itemized.leads} />}
        </>
      )}

      <footer className="mt-10 pt-4 text-center" style={{ borderTop: "1px solid #e2e8f0" }}>
        <p className="text-[10px] leading-relaxed" style={{ color: "#94a3b8" }}>
          Figures for the selected period. Generated {generatedLabel}.
        </p>
      </footer>
    </article>
  );
}

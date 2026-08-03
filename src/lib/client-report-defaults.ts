import type { MetricsResult } from "@/lib/metrics";
import {
  getKpiSections,
  type KpiSectionDefinition,
  type ReportingType,
  usesRmKpiLayout,
} from "@/lib/kpi-layouts";

export type ClientReportChartFlags = {
  showQuality: boolean;
  funnel: boolean;
  rateTrends: boolean;
  costTrends: boolean;
  /** Itemized booked / show / no-show / bail / LT / claimed tables. */
  itemizedWork: boolean;
  /** Itemized total leads table with dates. */
  itemizedLeads: boolean;
};

export type ClientReportDefaults = {
  metrics: Array<keyof MetricsResult>;
  charts: ClientReportChartFlags;
};

/** Client-safe KPI keys for paid-ads / RM clients. Costs & pipeline stay off. */
const RM_DEFAULT_METRICS: Array<keyof MetricsResult> = [
  "new_leads",
  "qualified_leads",
  "hot_leads",
  "live_transfers",
  "unique_conversations",
  "unique_booked_appointments",
  "hand_raise_rate",
  "shows",
  "no_shows",
  "net_show_pct",
  "show_pct",
  "conversation_rate",
];

/**
 * Client-safe KPI keys for HE / call-center clients.
 * Calling stats (dials, pickups, etc.) stay off by default.
 */
const HE_DEFAULT_METRICS: Array<keyof MetricsResult> = [
  "new_leads",
  "unique_booked_appointments",
  "billable_conversations",
  "live_transfers",
  "lead_hand_raise_rate",
  "shows",
  "no_shows",
  "net_show_pct",
  "show_pct",
];

const BASE_CHARTS: ClientReportChartFlags = {
  showQuality: true,
  funnel: true,
  rateTrends: true,
  costTrends: false,
  itemizedWork: false,
  itemizedLeads: false,
};

export function getClientReportDefaults(
  reportingType: ReportingType,
): ClientReportDefaults {
  return {
    metrics: usesRmKpiLayout(reportingType) ? [...RM_DEFAULT_METRICS] : [...HE_DEFAULT_METRICS],
    charts: { ...BASE_CHARTS, costTrends: false },
  };
}

export function supportsCostTrends(reportingType: ReportingType): boolean {
  return usesRmKpiLayout(reportingType);
}

/** Drop sections with no selected cards. */
export function filterKpiSections(
  sections: KpiSectionDefinition[],
  selected: ReadonlySet<keyof MetricsResult> | ReadonlyArray<keyof MetricsResult>,
): KpiSectionDefinition[] {
  const set = selected instanceof Set ? selected : new Set(selected);
  return sections
    .map(section => ({
      ...section,
      cards: section.cards.filter(card => set.has(card.metric)),
      // Hide formula footnotes on client sheets — labels are enough.
      footnote: undefined,
    }))
    .filter(section => section.cards.length > 0);
}

/** Convenience: filtered sections for a reporting type + selection. */
export function getFilteredClientReportSections(
  reportingType: ReportingType,
  selected: ReadonlySet<keyof MetricsResult> | ReadonlyArray<keyof MetricsResult>,
): KpiSectionDefinition[] {
  return filterKpiSections(getKpiSections(reportingType), selected);
}

export const DEFAULT_REPORT_TITLE = "Performance Report";

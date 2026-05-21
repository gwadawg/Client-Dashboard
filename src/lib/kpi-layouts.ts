import type { MetricsResult } from "@/lib/metrics";

export type ReportingType = "RM" | "HE";

export const DEFAULT_REPORTING_TYPE: ReportingType = "RM";

export function normalizeReportingType(value: unknown): ReportingType {
  return value === "HE" ? "HE" : DEFAULT_REPORTING_TYPE;
}

export type KpiFormat = "int" | "pct" | "money" | "decimal";

export type KpiSectionVariant = "grid" | "hero";

export type KpiCardDefinition = {
  label: string;
  metric: keyof MetricsResult;
  format: KpiFormat;
  accent?: boolean;
  visible?: (metrics: MetricsResult) => boolean;
};

export type KpiSectionDefinition = {
  title: string;
  variant?: KpiSectionVariant;
  gridClassName: string;
  cards: KpiCardDefinition[];
  footnote?: string;
};

const LEADS_GRID = "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3";
const COSTS_GRID = "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3";
const DEFAULT_GRID = "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3";

const RM_KPI_SECTIONS: KpiSectionDefinition[] = [
  {
    title: "Leads & Pipeline",
    variant: "grid",
    gridClassName: LEADS_GRID,
    cards: [
      { label: "Total Leads", metric: "new_leads", format: "int" },
      { label: "Qualified Leads", metric: "qualified_leads", format: "int" },
      { label: "Hot Leads", metric: "hot_leads", format: "int", accent: true },
      { label: "Out of State Leads", metric: "out_of_state_leads", format: "int" },
      { label: "Claimed", metric: "claimed", format: "int" },
      { label: "Live Transfers", metric: "live_transfers", format: "int" },
    ],
  },
  {
    title: "Appointments",
    variant: "hero",
    gridClassName: "",
    cards: [
      { label: "Appointments Booked", metric: "booked_appointments", format: "int", accent: true },
    ],
  },
  {
    title: "Acquisition Costs",
    variant: "grid",
    gridClassName: COSTS_GRID,
    footnote:
      "All cost metrics use total ad spend (all platforms). CPQL = spend ÷ qualified leads. CPH = spend ÷ hot leads. Cost per conversation = spend ÷ (live transfers + shows + claimed).",
    cards: [
      { label: "Total Spend", metric: "ad_spend", format: "money", accent: true },
      { label: "CPL", metric: "cpl", format: "money" },
      { label: "CPQL", metric: "cp_qualified", format: "money" },
      { label: "CPH", metric: "cp_hot", format: "money" },
      { label: "Cost per Appointment", metric: "cp_appt", format: "money" },
      { label: "Cost per Conversation", metric: "cp_conversation", format: "money" },
    ],
  },
];

const HE_KPI_SECTIONS: KpiSectionDefinition[] = [
  {
    title: "Appointments",
    gridClassName: DEFAULT_GRID,
    cards: [
      { label: "Appointments Booked", metric: "booked_appointments", format: "int" },
      { label: "Appts To Take Place", metric: "appts_to_take_place", format: "int" },
      { label: "Shows", metric: "shows", format: "int", accent: true },
      { label: "No Shows", metric: "no_shows", format: "int" },
      { label: "LO bailed (no-show)", metric: "lo_bailed", format: "int" },
      { label: "Show Rate", metric: "show_pct", format: "pct", accent: true },
      { label: "Cancellations", metric: "appointment_cancelled", format: "int" },
      { label: "Cancel Rate", metric: "cancel_rate", format: "pct" },
    ],
  },
  {
    title: "Calling Stats",
    gridClassName: DEFAULT_GRID,
    cards: [
      { label: "Outbound Dials", metric: "outbound_dials", format: "int" },
      { label: "Pickups (40s+)", metric: "pickups", format: "int" },
      { label: "Pick Up Rate", metric: "pickup_pct", format: "pct", accent: true },
      { label: "Conversations (2m+)", metric: "conversations", format: "int" },
      { label: "Conversation Rate", metric: "conversation_pct", format: "pct" },
      { label: "Claimed", metric: "claimed", format: "int" },
      { label: "Total Conversations", metric: "total_conversations", format: "int" },
    ],
  },
];

export function getKpiSections(reportingType: ReportingType): KpiSectionDefinition[] {
  return reportingType === "HE" ? HE_KPI_SECTIONS : RM_KPI_SECTIONS;
}

export function formatKpiValue(value: number, format: KpiFormat): string {
  if (format === "money") return `$${Math.round(value).toLocaleString("en-US")}`;
  if (format === "pct") return `${value.toFixed(2)}%`;
  if (format === "decimal") return value.toFixed(2);
  return Math.round(value).toString();
}

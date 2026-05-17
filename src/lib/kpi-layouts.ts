import type { MetricsResult } from "@/lib/metrics";

export type ReportingType = "RM" | "HE";

export const DEFAULT_REPORTING_TYPE: ReportingType = "RM";

export function normalizeReportingType(value: unknown): ReportingType {
  return value === "HE" ? "HE" : DEFAULT_REPORTING_TYPE;
}

export type KpiFormat = "int" | "pct" | "money" | "decimal";

export type KpiCardDefinition = {
  label: string;
  metric: keyof MetricsResult;
  format: KpiFormat;
  accent?: boolean;
  visible?: (metrics: MetricsResult) => boolean;
};

export type KpiSectionDefinition = {
  title: string;
  gridClassName: string;
  cards: KpiCardDefinition[];
};

const DEFAULT_GRID = "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3";

const RM_KPI_SECTIONS: KpiSectionDefinition[] = [
  {
    title: "Leads & Pipeline",
    gridClassName: DEFAULT_GRID,
    cards: [
      { label: "Total Leads", metric: "new_leads", format: "int" },
      { label: "Qualified Leads", metric: "qualified_leads", format: "int" },
      { label: "Hot Leads", metric: "hot_leads", format: "int", accent: true },
      { label: "Out of State Leads", metric: "out_of_state_leads", format: "int" },
      { label: "Proposals Sent", metric: "proposals_sent", format: "int" },
      { label: "Submitted (in processing)", metric: "loan_processing", format: "int" },
      { label: "Funded (closed)", metric: "closed", format: "int", accent: true },
    ],
  },
  {
    title: "Appointments",
    gridClassName: DEFAULT_GRID,
    cards: [
      { label: "Appointments Booked", metric: "booked_appointments", format: "int" },
      { label: "Booking Rate", metric: "appt_booking_rate", format: "pct" },
      { label: "Appts To Take Place", metric: "appts_to_take_place", format: "int" },
      { label: "Shows", metric: "shows", format: "int", accent: true },
      { label: "No Shows (lead)", metric: "no_shows", format: "int" },
      { label: "LO bailed (no-show)", metric: "lo_bailed", format: "int" },
      { label: "Show Rate", metric: "show_pct", format: "pct", accent: true },
      { label: "Cancellations", metric: "appointment_cancelled", format: "int" },
      { label: "Cancel Rate", metric: "cancel_rate", format: "pct" },
    ],
  },
  {
    title: "Engagement",
    gridClassName: DEFAULT_GRID,
    cards: [
      { label: "Live Transfers", metric: "live_transfers", format: "int" },
      { label: "Claimed", metric: "claimed", format: "int" },
      { label: "Total Conversations (2m+)", metric: "total_conversations", format: "int" },
      { label: "Callback Requests", metric: "callbacks", format: "int" },
      { label: "Callback Rate", metric: "cb_pct", format: "pct" },
    ],
  },
  {
    title: "Ad Spend",
    gridClassName: "grid grid-cols-2 sm:grid-cols-4 gap-3",
    cards: [
      { label: "Meta (Facebook) spend", metric: "ad_spend_meta", format: "money", accent: true },
      {
        label: "All platforms",
        metric: "ad_spend",
        format: "money",
        visible: metrics => Math.abs(metrics.ad_spend - metrics.ad_spend_meta) > 0.01,
      },
      { label: "CPL", metric: "cpl", format: "money" },
      { label: "CP Appointment", metric: "cp_appt", format: "money" },
      { label: "CPS", metric: "cps", format: "money" },
    ],
  },
  {
    title: "Calling Stats",
    gridClassName: DEFAULT_GRID,
    cards: [
      { label: "Speed To Lead (Min)", metric: "speed_to_lead_min", format: "decimal" },
      { label: "Outbound Dials", metric: "outbound_dials", format: "int" },
      { label: "Dials Per Lead", metric: "dials_per_lead", format: "decimal" },
      { label: "Pickups (40s+)", metric: "pickups", format: "int" },
      { label: "Pick Up Rate", metric: "pickup_pct", format: "pct", accent: true },
      { label: "Conversations (2m+)", metric: "conversations", format: "int" },
      { label: "Claimed", metric: "claimed", format: "int" },
      { label: "Conversation Rate", metric: "conversation_pct", format: "pct" },
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

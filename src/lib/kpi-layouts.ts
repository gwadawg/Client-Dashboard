import type { MetricsResult } from "@/lib/metrics";
import {
  DEFAULT_REPORTING_TYPE,
  normalizeReportingType,
  usesHeKpiLayout,
  type ReportingType,
} from "@/lib/reporting-types";

export {
  DEFAULT_REPORTING_TYPE,
  normalizeReportingType,
  usesHeKpiLayout,
  usesRmKpiLayout,
  getReportingTypeLabel,
  REPORTING_TYPE_META,
  REPORTING_TYPE_OPTIONS,
  REPORTING_TYPES,
  type ReportingType,
} from "@/lib/reporting-types";

export type KpiFormat = "int" | "pct" | "money" | "decimal";

export type KpiSectionVariant = "grid" | "hero";

export type KpiCardDefinition = {
  label: string;
  metric: keyof MetricsResult;
  format: KpiFormat;
  accent?: boolean;
  /** Short formula/explanation shown in an info tooltip on the card. */
  hint?: string;
  /** When comparing periods, a decrease is the good direction (costs, no-shows, cancel rate). */
  lowerIsBetter?: boolean;
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
      { label: "Total Leads", metric: "new_leads", format: "int", hint: "Every new lead/contact ingested in this date range." },
      { label: "Qualified Leads", metric: "qualified_leads", format: "int", hint: "Leads manually tagged as qualified — the ones worth dialing." },
      { label: "Hot Leads", metric: "hot_leads", format: "int", accent: true, hint: "Leads manually tagged as hot / high-intent." },
      { label: "Out of State Leads", metric: "out_of_state_leads", format: "int", hint: "Leads located outside the target geography." },
      { label: "Claimed", metric: "claimed", format: "int", hint: "Leads the client spoke with or messaged outside our booking flow." },
      { label: "Live Transfers", metric: "live_transfers", format: "int", hint: "Calls transferred live straight to the client / agent." },
    ],
  },
  {
    title: "Appointments",
    variant: "grid",
    gridClassName: DEFAULT_GRID,
    cards: [
      { label: "Appointments Booked", metric: "booked_appointments", format: "int", hint: "Count of appointments booked in this range." },
      {
        label: "Booking Rate",
        metric: "appt_booking_rate",
        format: "pct",
        hint: "Appointments Booked ÷ Qualified Leads.",
      },
      {
        label: "Appts To Take Place",
        metric: "appts_to_take_place",
        format: "int",
        hint: "Booked − Shows − No Shows − Cancellations − LO bailed. Appointments still pending an outcome.",
      },
      { label: "Shows", metric: "shows", format: "int", accent: true, hint: "Appointments the lead attended." },
      { label: "No Shows (lead)", metric: "no_shows", format: "int", lowerIsBetter: true, hint: "Appointments the lead failed to attend." },
      {
        label: "LO bailed (no-show)",
        metric: "lo_bailed",
        format: "int",
        lowerIsBetter: true,
        hint: "Partner loan officer missed the appointment — not the lead's fault.",
      },
      { label: "Cancellations", metric: "appointment_cancelled", format: "int", lowerIsBetter: true, hint: "Appointments cancelled before they took place." },
    ],
  },
  {
    title: "Show Quality & Conversion",
    variant: "grid",
    gridClassName: DEFAULT_GRID,
    footnote:
      "Both show rates ignore appointments that never took place — anything still pending or cancelled is excluded. Net Show Rate counts only lead attendance (Shows vs No Shows); Show Rate (of booked) also counts LO bails against you.",
    cards: [
      {
        label: "Net Show Rate",
        metric: "net_show_pct",
        format: "pct",
        accent: true,
        hint: "Shows ÷ (Shows + No Shows). The true lead-attendance rate — excludes cancellations, LO bails, and still-pending appointments.",
      },
      {
        label: "Show Rate (of booked)",
        metric: "show_pct",
        format: "pct",
        hint: "Shows ÷ (Shows + No Shows + LO bailed). Excludes still-pending and cancelled appointments.",
      },
      {
        label: "Cancel Rate",
        metric: "cancel_rate",
        format: "pct",
        lowerIsBetter: true,
        hint: "Cancellations ÷ (Appointments Booked + Cancellations)",
      },
      {
        label: "LO Bail Rate",
        metric: "lo_bail_rate",
        format: "pct",
        lowerIsBetter: true,
        hint: "LO bailed ÷ Appointments Booked",
      },
      {
        label: "Conversation Rate",
        metric: "conversation_rate",
        format: "pct",
        hint: "(Claimed + Shows + Live Transfers) ÷ Qualified Leads",
      },
    ],
  },
  {
    title: "Acquisition Costs",
    variant: "grid",
    gridClassName: COSTS_GRID,
    footnote:
      "All cost metrics use total ad spend (all platforms). CPQL = spend ÷ qualified leads. CPH = spend ÷ hot leads. Cost per conversation = spend ÷ (live transfers + shows + claimed).",
    cards: [
      { label: "Total Spend", metric: "ad_spend", format: "money", accent: true, hint: "All ad spend in this range (Meta + Google + Local Services)." },
      { label: "CPL", metric: "cpl", format: "money", lowerIsBetter: true, hint: "Cost per Lead = Total Spend ÷ Total Leads." },
      { label: "CPQL", metric: "cp_qualified", format: "money", lowerIsBetter: true, hint: "Cost per Qualified Lead = Total Spend ÷ Qualified Leads." },
      { label: "CPH", metric: "cp_hot", format: "money", lowerIsBetter: true, hint: "Cost per Hot Lead = Total Spend ÷ Hot Leads." },
      { label: "Cost per Appointment", metric: "cp_appt", format: "money", lowerIsBetter: true, hint: "Total Spend ÷ Appointments Booked." },
      { label: "Cost per Conversation", metric: "cp_conversation", format: "money", lowerIsBetter: true, hint: "Total Spend ÷ (Live Transfers + Shows + Claimed)." },
    ],
  },
];

const HE_KPI_SECTIONS: KpiSectionDefinition[] = [
  {
    title: "Appointments",
    gridClassName: DEFAULT_GRID,
    footnote:
      "Both show rates ignore appointments that never took place — anything still pending or cancelled is excluded. Net Show Rate counts only lead attendance (Shows vs No Shows); Show Rate (of booked) also counts LO bails against you.",
    cards: [
      { label: "Total Leads", metric: "new_leads", format: "int", hint: "Every new lead/contact ingested in this date range." },
      { label: "Appointments Booked", metric: "booked_appointments", format: "int", hint: "Count of appointments booked in this range." },
      {
        label: "Booking Rate",
        metric: "lead_booking_rate",
        format: "pct",
        hint: "Appointments Booked ÷ Total Leads.",
      },
      {
        label: "Appts To Take Place",
        metric: "appts_to_take_place",
        format: "int",
        hint: "Booked − Shows − No Shows − Cancellations − LO bailed. Appointments still pending an outcome.",
      },
      { label: "Shows", metric: "shows", format: "int", accent: true, hint: "Appointments the lead attended." },
      { label: "No Shows", metric: "no_shows", format: "int", lowerIsBetter: true, hint: "Appointments the lead failed to attend." },
      {
        label: "LO bailed (no-show)",
        metric: "lo_bailed",
        format: "int",
        lowerIsBetter: true,
        hint: "Partner loan officer missed the appointment — not the lead's fault.",
      },
      {
        label: "Net Show Rate",
        metric: "net_show_pct",
        format: "pct",
        accent: true,
        hint: "Shows ÷ (Shows + No Shows). The true lead-attendance rate — excludes cancellations, LO bails, and still-pending appointments.",
      },
      {
        label: "Show Rate (of booked)",
        metric: "show_pct",
        format: "pct",
        hint: "Shows ÷ (Shows + No Shows + LO bailed). Excludes still-pending and cancelled appointments.",
      },
      {
        label: "LO Bail Rate",
        metric: "lo_bail_rate",
        format: "pct",
        lowerIsBetter: true,
        hint: "LO bailed ÷ Appointments Booked.",
      },
      { label: "Cancellations", metric: "appointment_cancelled", format: "int", lowerIsBetter: true, hint: "Appointments cancelled before they took place." },
      {
        label: "Cancel Rate",
        metric: "cancel_rate",
        format: "pct",
        lowerIsBetter: true,
        hint: "Cancellations ÷ (Appointments Booked + Cancellations).",
      },
    ],
  },
  {
    title: "Calling Stats",
    gridClassName: DEFAULT_GRID,
    cards: [
      { label: "Outbound Dials", metric: "outbound_dials", format: "int", hint: "All outbound dial attempts in this range." },
      { label: "Pickups (40s+)", metric: "pickups", format: "int", hint: "Calls answered — duration of at least 40 seconds." },
      { label: "Pick Up Rate", metric: "pickup_pct", format: "pct", accent: true, hint: "Pickups ÷ Outbound Dials." },
      { label: "Conversations (2m+)", metric: "conversations", format: "int", hint: "Completed calls longer than 2 minutes." },
      { label: "Conversation Rate", metric: "conversation_pct", format: "pct", hint: "Conversations ÷ Pickups." },
      { label: "Claimed", metric: "claimed", format: "int", hint: "Leads the client handled outside our booking flow." },
      { label: "Total Conversations", metric: "total_conversations", format: "int", hint: "Conversations (2m+) plus Claimed." },
    ],
  },
];

export function getKpiSections(reportingType: ReportingType): KpiSectionDefinition[] {
  return usesHeKpiLayout(reportingType) ? HE_KPI_SECTIONS : RM_KPI_SECTIONS;
}

export function formatKpiValue(value: number, format: KpiFormat): string {
  if (format === "money") return `$${Math.round(value).toLocaleString("en-US")}`;
  if (format === "pct") return `${value.toFixed(2)}%`;
  if (format === "decimal") return value.toFixed(2);
  return Math.round(value).toString();
}

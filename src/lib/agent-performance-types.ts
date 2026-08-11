import type { ReportingType } from "@/lib/reporting-types";

export type AgentTodayStats = {
  dials: number;
  pickups: number;
  appointments: number;
  live_transfers: number;
};

export type AgentPerformanceRow = {
  agent_name: string;
  dials: number;
  pickups: number;
  pickup_rate: number;
  conversations: number;
  /** Talk-time conversations ÷ dials (scorecard volume rate). */
  conversation_rate: number;
  /** Unique leads with show ∪ live_transfer (payroll-credited show + LT agents). */
  show_lt_conversations: number;
  appointments: number;
  callbacks: number;
  live_transfers: number;
  shows: number;
  no_shows: number;
  lo_bailed: number;
  pending: number;
  cancelled: number;
  show_rate: number;
  avg_speed_to_lead_min: number | null;
  today: AgentTodayStats;
};

export type TeamToday = {
  dials: number;
  pickups: number;
  appointments: number;
  live_transfers: number;
  pickup_rate: number;
};

export type TeamTotals = {
  dials: number;
  pickups: number;
  conversations: number;
  appointments: number;
  live_transfers: number;
  shows: number;
  no_shows: number;
  lo_bailed: number;
  cancelled: number;
  callbacks: number;
  show_lt_conversations: number;
  pickup_rate: number;
  /** Conversations ÷ pickups (ops KPI definition). */
  conversation_rate: number;
  show_rate: number;
};

/** Per-rep averages over active floor reps only (dials or credits in range). */
export type TeamAverages = {
  dials: number;
  pickups: number;
  appointments: number;
  live_transfers: number;
  shows: number;
  show_lt_conversations: number;
  callbacks: number;
  conversations: number;
  pickup_rate: number;
  /** Team-level conversations ÷ pickups. */
  conversation_rate: number;
  show_rate: number;
  /** Denominator used for per-rep averages. */
  active_rep_count: number;
};

export type VerticalClientDialRow = {
  client_id: string;
  client_name: string;
  dials: number;
  pickups: number;
  conversations: number;
};

export type VerticalBucket = {
  dials: number;
  pickups: number;
  conversations: number;
  pickup_rate: number;
  clients: VerticalClientDialRow[];
};

export type VerticalEffort = {
  by_type: Record<ReportingType, VerticalBucket>;
  unattributed: { dials: number };
  total_attributed_dials: number;
};

export type AgentGoal = {
  agent_name: string | null;
  metric: string;
  target: number;
  period: string;
  month?: string | null;
};

export type ComparisonMetricKey =
  | "dials"
  | "pickups"
  | "appointments"
  | "live_transfers"
  | "shows"
  | "show_lt_conversations";

export const COMPARISON_METRICS: { key: ComparisonMetricKey; label: string; color: string }[] = [
  { key: "dials", label: "Dials", color: "#3b82f6" },
  { key: "pickups", label: "Pickups", color: "#34d399" },
  { key: "appointments", label: "Appointments", color: "#f59e0b" },
  { key: "live_transfers", label: "Live Transfers", color: "#a78bfa" },
  { key: "shows", label: "Shows", color: "#22d3ee" },
  { key: "show_lt_conversations", label: "Show/LT", color: "#f472b6" },
];

export const GOAL_METRICS = [
  { key: "dials", label: "Dials" },
  { key: "appointments", label: "Appointments" },
  { key: "pickups", label: "Pickups" },
  { key: "shows", label: "Shows" },
] as const;

export const EMPTY_TEAM_TODAY: TeamToday = {
  dials: 0,
  pickups: 0,
  appointments: 0,
  live_transfers: 0,
  pickup_rate: 0,
};

export const EMPTY_TEAM_TOTALS: TeamTotals = {
  dials: 0,
  pickups: 0,
  conversations: 0,
  appointments: 0,
  live_transfers: 0,
  shows: 0,
  no_shows: 0,
  lo_bailed: 0,
  cancelled: 0,
  callbacks: 0,
  show_lt_conversations: 0,
  pickup_rate: 0,
  conversation_rate: 0,
  show_rate: 0,
};

export const EMPTY_TEAM_AVERAGES: TeamAverages = {
  dials: 0,
  pickups: 0,
  appointments: 0,
  live_transfers: 0,
  shows: 0,
  show_lt_conversations: 0,
  callbacks: 0,
  conversations: 0,
  pickup_rate: 0,
  conversation_rate: 0,
  show_rate: 0,
  active_rep_count: 0,
};

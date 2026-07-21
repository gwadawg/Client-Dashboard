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
  conversation_rate: number;
  /** Unique leads with show ∪ live_transfer (floor-board Conversations). */
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

export type TeamAverages = {
  dials: number;
  pickups: number;
  appointments: number;
  live_transfers: number;
  shows: number;
  pickup_rate: number;
  show_rate: number;
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
  | "shows";

export const COMPARISON_METRICS: { key: ComparisonMetricKey; label: string; color: string }[] = [
  { key: "dials", label: "Dials", color: "#3b82f6" },
  { key: "pickups", label: "Pickups", color: "#34d399" },
  { key: "appointments", label: "Appointments", color: "#f59e0b" },
  { key: "live_transfers", label: "Live Transfers", color: "#a78bfa" },
  { key: "shows", label: "Shows", color: "#22d3ee" },
];

export const GOAL_METRICS = [
  { key: "dials", label: "Dials" },
  { key: "appointments", label: "Appointments" },
  { key: "pickups", label: "Pickups" },
  { key: "shows", label: "Shows" },
] as const;

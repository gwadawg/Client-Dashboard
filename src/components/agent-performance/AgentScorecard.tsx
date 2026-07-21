"use client";

import {
  type AgentGoal,
  type AgentPerformanceRow,
  GOAL_METRICS,
  type TeamAverages,
} from "@/lib/agent-performance-types";
import AgentActivityLog from "./AgentActivityLog";

type Props = {
  agent: AgentPerformanceRow;
  rank: number;
  goals: AgentGoal[];
  teamAverages: TeamAverages;
  periodDays: number;
  startDate: string;
  endDate: string;
  expanded: boolean;
  onToggle: () => void;
};

function Ring({ pct, color, size = 56 }: { pct: number; color: string; size?: number }) {
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (Math.min(pct, 100) / 100) * circ;
  return (
    <svg width={size} height={size} className="flex-shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={4} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={4}
        strokeDasharray={circ}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x={size / 2} y={size / 2 + 4} textAnchor="middle" fontSize={11} fontWeight={700} fill={color}>
        {pct}%
      </text>
    </svg>
  );
}

function goalRingColor(pct: number): string {
  if (pct >= 100) return "#34d399";
  if (pct >= 70) return "#fbbf24";
  return "#f87171";
}

function rateColor(rate: number): string {
  if (rate >= 50) return "#34d399";
  if (rate >= 25) return "#fbbf24";
  return "#f87171";
}

function getTarget(goals: AgentGoal[], agentName: string, metric: string): number | null {
  return goals.find(g => g.agent_name === agentName && g.metric === metric && g.period === "daily")?.target ?? null;
}

function VsTeamBar({
  label,
  value,
  teamAvg,
}: {
  label: string;
  value: number;
  teamAvg: number;
}) {
  const max = Math.max(value, teamAvg, 1);
  const valuePct = Math.round((value / max) * 100);
  const teamPct = Math.round((teamAvg / max) * 100);
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span style={{ color: "#64748b" }}>{label}</span>
        <span className="tabular-nums" style={{ color: "#94a3b8" }}>
          {value.toLocaleString()} <span style={{ color: "#475569" }}>/ {teamAvg.toLocaleString()} avg</span>
        </span>
      </div>
      <div className="space-y-1">
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
          <div className="h-full rounded-full" style={{ width: `${valuePct}%`, background: "#f59e0b" }} />
        </div>
        <div className="h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.04)" }}>
          <div className="h-full rounded-full" style={{ width: `${teamPct}%`, background: "#475569" }} />
        </div>
      </div>
    </div>
  );
}

export default function AgentScorecard({
  agent,
  rank,
  goals,
  teamAverages,
  periodDays,
  startDate,
  endDate,
  expanded,
  onToggle,
}: Props) {
  const dialTarget = getTarget(goals, agent.agent_name, "dials");
  const apptTarget = getTarget(goals, agent.agent_name, "appointments");
  const dialPct = dialTarget ? Math.min(100, Math.round((agent.today.dials / dialTarget) * 100)) : null;
  const apptPct = apptTarget ? Math.min(100, Math.round((agent.today.appointments / apptTarget) * 100)) : null;

  const dailyApptPace = periodDays > 0 ? Math.round((agent.appointments / periodDays) * 10) / 10 : 0;

  const periodSummary = [
    { label: "Dials", value: agent.dials.toLocaleString() },
    { label: "Pickups", value: agent.pickups.toLocaleString() },
    { label: "Appts", value: agent.appointments.toLocaleString() },
    { label: "Transfers", value: agent.live_transfers.toLocaleString() },
    { label: "Shows", value: agent.shows.toLocaleString() },
    {
      label: "Show/LT",
      value: (agent.show_lt_conversations ?? 0).toLocaleString(),
    },
    { label: "Show %", value: `${agent.show_rate}%`, colored: true, rate: agent.show_rate },
  ];

  const fullMetrics = [
    { label: "Dials", value: agent.dials },
    { label: "Pickups", value: agent.pickups },
    { label: "Pickup %", value: `${agent.pickup_rate}%`, rate: agent.pickup_rate },
    { label: "Talk time convos", value: agent.conversations },
    { label: "Talk time %", value: `${agent.conversation_rate}%`, rate: agent.conversation_rate },
    { label: "Appts booked", value: agent.appointments },
    { label: "Callbacks", value: agent.callbacks },
    { label: "Live transfers", value: agent.live_transfers },
    { label: "Shows", value: agent.shows },
    { label: "No shows", value: agent.no_shows },
    { label: "LO bailed", value: agent.lo_bailed },
    { label: "Pending", value: agent.pending },
    { label: "Cancelled", value: agent.cancelled },
    { label: "Show %", value: `${agent.show_rate}%`, rate: agent.show_rate },
    { label: "Conversations (show/LT)", value: agent.show_lt_conversations ?? 0 },
    {
      label: "Speed to lead (min)",
      value: agent.avg_speed_to_lead_min != null ? agent.avg_speed_to_lead_min : "—",
    },
    { label: "Today dials", value: agent.today.dials },
    { label: "Today pickups", value: agent.today.pickups },
    { label: "Today appts", value: agent.today.appointments },
    { label: "Today LTs", value: agent.today.live_transfers },
  ];

  return (
    <div
      className="rounded-xl overflow-hidden transition-all"
      style={{
        background: "#0a1628",
        border: expanded ? "1px solid rgba(245,158,11,0.25)" : "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        className="w-full text-left p-5 space-y-4 cursor-pointer"
        aria-expanded={expanded}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="flex-shrink-0 text-xs font-bold px-2 py-0.5 rounded-full tabular-nums"
              style={{ background: "rgba(245,158,11,0.12)", color: "#f59e0b" }}
            >
              #{rank}
            </span>
            <span className="font-semibold truncate" style={{ color: "#e2e8f0" }}>
              {agent.agent_name}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {agent.avg_speed_to_lead_min != null && (
              <span
                className="text-xs px-2 py-1 rounded-full hidden sm:inline"
                style={{ background: "rgba(245,158,11,0.1)", color: "#f59e0b" }}
              >
                {agent.avg_speed_to_lead_min}m response
              </span>
            )}
            <span className="text-xs" style={{ color: "#475569" }}>
              {expanded ? "▲" : "▼"}
            </span>
          </div>
        </div>

        <div>
          <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "#334155" }}>
            Today
          </p>
          <div className="flex items-center gap-6">
            <div className="text-center">
              {dialPct !== null ? (
                <Ring pct={dialPct} color={goalRingColor(dialPct)} />
              ) : (
                <p className="text-2xl font-bold tabular-nums" style={{ color: "#e2e8f0" }}>
                  {agent.today.dials}
                </p>
              )}
              <p className="text-xs mt-1" style={{ color: "#475569" }}>
                Dials{dialTarget ? ` / ${dialTarget}` : ""}
              </p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold tabular-nums" style={{ color: "#e2e8f0" }}>
                {agent.today.pickups}
              </p>
              <p className="text-xs mt-1" style={{ color: "#475569" }}>
                Pickups
              </p>
            </div>
            <div className="text-center">
              {apptPct !== null ? (
                <Ring pct={apptPct} color={goalRingColor(apptPct)} />
              ) : (
                <p className="text-2xl font-bold tabular-nums" style={{ color: "#f59e0b" }}>
                  {agent.today.appointments}
                </p>
              )}
              <p className="text-xs mt-1" style={{ color: "#475569" }}>
                Appts{apptTarget ? ` / ${apptTarget}` : ""}
              </p>
            </div>
          </div>
        </div>

        <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: "0.75rem" }}>
          <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "#334155" }}>
            Period Totals
          </p>
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-2 text-center">
            {periodSummary.map(s => (
              <div key={s.label}>
                <p
                  className="text-base font-bold tabular-nums"
                  style={{
                    color: s.colored && s.rate != null ? rateColor(s.rate) : "#94a3b8",
                  }}
                >
                  {s.value}
                </p>
                <p className="text-xs" style={{ color: "#334155" }}>
                  {s.label}
                </p>
              </div>
            ))}
          </div>
        </div>
      </button>

      {expanded && (
        <div
          className="px-5 pb-5 space-y-5"
          style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}
        >
          <div>
            <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "#334155" }}>
              Full KPIs
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {fullMetrics.map(m => (
                <div
                  key={m.label}
                  className="rounded-lg p-3"
                  style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)" }}
                >
                  <p
                    className="text-lg font-bold tabular-nums"
                    style={{ color: m.rate != null ? rateColor(m.rate) : "#94a3b8" }}
                  >
                    {typeof m.value === "number" ? m.value.toLocaleString() : m.value}
                  </p>
                  <p className="text-xs" style={{ color: "#475569" }}>
                    {m.label}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "#334155" }}>
              Daily Goals
            </p>
            <div className="flex flex-wrap gap-6">
              {GOAL_METRICS.map(({ key, label }) => {
                const target = getTarget(goals, agent.agent_name, key);
                if (!target) return null;
                const todayVal =
                  key === "dials"
                    ? agent.today.dials
                    : key === "appointments"
                      ? agent.today.appointments
                      : key === "pickups"
                        ? agent.today.pickups
                        : agent.shows;
                const pct = Math.min(100, Math.round((todayVal / target) * 100));
                return (
                  <div key={key} className="text-center">
                    <Ring pct={pct} color={goalRingColor(pct)} size={48} />
                    <p className="text-xs mt-1" style={{ color: "#475569" }}>
                      {label} / {target}
                    </p>
                  </div>
                );
              })}
              {!GOAL_METRICS.some(({ key }) => getTarget(goals, agent.agent_name, key)) && (
                <p className="text-sm" style={{ color: "#475569" }}>
                  No daily goals set — configure in the Goals tab.
                </p>
              )}
            </div>
          </div>

          <div>
            <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "#334155" }}>
              vs Team Average
            </p>
            <div className="space-y-3">
              <VsTeamBar label="Dials" value={agent.dials} teamAvg={teamAverages.dials} />
              <VsTeamBar label="Pickups" value={agent.pickups} teamAvg={teamAverages.pickups} />
              <VsTeamBar label="Appointments" value={agent.appointments} teamAvg={teamAverages.appointments} />
              <VsTeamBar label="Live Transfers" value={agent.live_transfers} teamAvg={teamAverages.live_transfers} />
              <VsTeamBar label="Shows" value={agent.shows} teamAvg={teamAverages.shows} />
            </div>
          </div>

          <div
            className="rounded-lg p-3 text-sm"
            style={{ background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.12)" }}
          >
            <span style={{ color: "#94a3b8" }}>Today vs period pace: </span>
            <span className="font-semibold tabular-nums" style={{ color: "#f59e0b" }}>
              {agent.today.appointments} appts today
            </span>
            <span style={{ color: "#64748b" }}>
              {" "}
              · {dailyApptPace}/day avg over {periodDays} day{periodDays !== 1 ? "s" : ""}
            </span>
          </div>

          <AgentActivityLog
            agentName={agent.agent_name}
            startDate={startDate}
            endDate={endDate}
          />
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import AgentComparisonChart from "./agent-performance/AgentComparisonChart";
import AgentGoalCard from "./agent-performance/AgentGoalCard";
import AgentScorecard from "./agent-performance/AgentScorecard";
import AgentStatsTable from "./agent-performance/AgentStatsTable";
import {
  type AgentGoal,
  type AgentPerformanceRow,
  type TeamAverages,
} from "@/lib/agent-performance-types";
import { calendarMonthOf } from "@/lib/calendar-month";

type Props = {
  preset: string;
  startDate: string;
  endDate: string;
};

type BoardMode = "monthly" | "daily";

const EMPTY_TEAM_AVERAGES: TeamAverages = {
  dials: 0,
  pickups: 0,
  appointments: 0,
  live_transfers: 0,
  shows: 0,
  pickup_rate: 0,
  show_rate: 0,
};

function periodDays(startDate: string, endDate: string): number {
  if (!startDate || !endDate) return 1;
  const start = new Date(`${startDate}T12:00:00`);
  const end = new Date(`${endDate}T12:00:00`);
  const diff = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(1, diff + 1);
}

function monthlyTarget(goals: AgentGoal[], agentName: string, month: string): number | null {
  const hit = goals.find(
    g =>
      g.agent_name === agentName &&
      g.metric === "conversations" &&
      g.period === "monthly" &&
      g.month === month,
  );
  return hit?.target ?? null;
}

function dailyDialTarget(goals: AgentGoal[], agentName: string): number | null {
  const hit = goals.find(
    g => g.agent_name === agentName && g.metric === "dials" && g.period === "daily",
  );
  return hit?.target ?? null;
}

export default function AgentPerformance({ preset, startDate, endDate }: Props) {
  const [agents, setAgents] = useState<AgentPerformanceRow[]>([]);
  const [teamAverages, setTeamAverages] = useState<TeamAverages>(EMPTY_TEAM_AVERAGES);
  const [goals, setGoals] = useState<AgentGoal[]>([]);
  const [goalMonth, setGoalMonth] = useState(() => calendarMonthOf(endDate).month);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<BoardMode>("monthly");
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  const days = useMemo(() => periodDays(startDate, endDate), [startDate, endDate]);

  useEffect(() => {
    setLoading(true);
    setError("");
    const month = calendarMonthOf(endDate).month;
    setGoalMonth(month);
    const params = new URLSearchParams();
    if (startDate) params.set("startDate", startDate);
    if (endDate) params.set("endDate", endDate);
    params.set("includeAllRoster", "1");

    Promise.all([
      fetch(`/api/agent-stats?${params}`).then(r => r.json()),
      fetch(`/api/goals?month=${encodeURIComponent(month)}`).then(r => r.json()),
    ])
      .then(([statsData, goalsData]) => {
        if (statsData.error) throw new Error(statsData.error);
        if (goalsData.error) throw new Error(goalsData.error);
        setAgents(statsData.agents ?? []);
        setTeamAverages(statsData.team_averages ?? EMPTY_TEAM_AVERAGES);
        if (statsData.goal_month) setGoalMonth(statsData.goal_month);
        setGoals(goalsData.goals ?? []);
        setLoading(false);
      })
      .catch((err: Error) => {
        setError(err.message || "Failed to load performance");
        setLoading(false);
      });
  }, [preset, startDate, endDate]);

  const boardRows = useMemo(() => {
    const rows = agents.map(agent => {
      const target =
        mode === "monthly"
          ? monthlyTarget(goals, agent.agent_name, goalMonth)
          : dailyDialTarget(goals, agent.agent_name);
      const current =
        mode === "monthly" ? (agent.show_lt_conversations ?? 0) : agent.today.dials;
      const pct = target && target > 0 ? current / target : null;
      return { agent, target, current, pct };
    });

    rows.sort((a, b) => {
      const aHas = a.target != null;
      const bHas = b.target != null;
      if (aHas !== bHas) return aHas ? -1 : 1;
      if (a.pct != null && b.pct != null && a.pct !== b.pct) return b.pct - a.pct;
      return a.agent.agent_name.localeCompare(b.agent.agent_name);
    });

    return rows;
  }, [agents, goals, goalMonth, mode]);

  function toggleAgent(name: string) {
    setExpandedAgent(prev => (prev === name ? null : name));
  }

  const monthLabel = (() => {
    const [y, m] = goalMonth.split("-").map(Number);
    if (!y || !m) return goalMonth;
    return new Date(y, m - 1, 1).toLocaleString("en-US", { month: "long", year: "numeric" });
  })();

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold" style={{ color: "#e2e8f0" }}>
            Floor board
          </h2>
          <p className="text-sm mt-0.5" style={{ color: "#475569" }}>
            {mode === "monthly"
              ? `Conversations (show / LT) · ${monthLabel}`
              : "Today dials vs daily goal"}
          </p>
        </div>
        <div
          className="inline-flex gap-1 p-1 rounded-full"
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          {([
            ["monthly", "Monthly"],
            ["daily", "Daily"],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setMode(key)}
              className="px-4 py-1.5 rounded-full text-xs font-semibold transition-colors"
              style={
                mode === key
                  ? { background: "#f59e0b", color: "#0a1628" }
                  : { background: "transparent", color: "#64748b" }
              }
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div
          className="px-4 py-3 rounded-lg text-sm"
          style={{
            background: "rgba(239,68,68,0.12)",
            border: "1px solid rgba(239,68,68,0.25)",
            color: "#f87171",
          }}
        >
          {error}
        </div>
      )}

      {loading ? (
        <div className="py-12 text-center text-sm" style={{ color: "#1e3a5f" }}>
          Loading…
        </div>
      ) : boardRows.length === 0 ? (
        <div className="py-12 text-center text-sm" style={{ color: "#1e3a5f" }}>
          No agents on the roster
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {boardRows.map((row, i) => (
            <AgentGoalCard
              key={row.agent.agent_name}
              rank={i + 1}
              agentName={row.agent.agent_name}
              current={row.current}
              target={row.target}
              metricLabel={
                mode === "monthly" ? "Conversations (show / LT)" : "Dials today"
              }
              muted={row.target == null}
            />
          ))}
        </div>
      )}

      <div>
        <button
          type="button"
          onClick={() => setShowDetails(d => !d)}
          className="text-sm font-medium"
          style={{ color: "#64748b" }}
        >
          {showDetails ? "Hide" : "Show"} detailed scorecards & chart
        </button>
      </div>

      {showDetails && !loading && agents.length > 0 && (
        <div className="space-y-8">
          <AgentComparisonChart agents={agents} />
          <div>
            <h3 className="text-base font-semibold mb-4" style={{ color: "#e2e8f0" }}>
              Agent Scorecards
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {agents.map((a, i) => (
                <AgentScorecard
                  key={a.agent_name}
                  agent={a}
                  rank={i + 1}
                  goals={goals}
                  teamAverages={teamAverages}
                  periodDays={days}
                  startDate={startDate}
                  endDate={endDate}
                  expanded={expandedAgent === a.agent_name}
                  onToggle={() => toggleAgent(a.agent_name)}
                />
              ))}
            </div>
          </div>
          <AgentStatsTable agents={agents} />
        </div>
      )}
    </div>
  );
}

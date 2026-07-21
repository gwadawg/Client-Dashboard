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
import { cachedJsonFetch, peekCachedJson } from "@/lib/client-fetch-cache";

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

  const days = useMemo(() => periodDays(startDate, endDate), [startDate, endDate]);

  const kpiAgents = useMemo(
    () =>
      [...agents].sort(
        (a, b) => b.appointments - a.appointments || a.agent_name.localeCompare(b.agent_name),
      ),
    [agents],
  );

  const teamTotals = useMemo(() => {
    return agents.reduce(
      (acc, a) => ({
        dials: acc.dials + a.dials,
        pickups: acc.pickups + a.pickups,
        appointments: acc.appointments + a.appointments,
        live_transfers: acc.live_transfers + a.live_transfers,
        shows: acc.shows + a.shows,
        no_shows: acc.no_shows + a.no_shows,
        show_lt: acc.show_lt + (a.show_lt_conversations ?? 0),
        today_dials: acc.today_dials + a.today.dials,
        callbacks: acc.callbacks + a.callbacks,
      }),
      {
        dials: 0,
        pickups: 0,
        appointments: 0,
        live_transfers: 0,
        shows: 0,
        no_shows: 0,
        show_lt: 0,
        today_dials: 0,
        callbacks: 0,
      },
    );
  }, [agents]);

  useEffect(() => {
    setError("");
    const month = calendarMonthOf(endDate).month;
    setGoalMonth(month);
    const params = new URLSearchParams();
    if (startDate) params.set("startDate", startDate);
    if (endDate) params.set("endDate", endDate);
    params.set("includeAllRoster", "1");

    const statsKey = `agent-stats|${params.toString()}`;
    const goalsKey = `goals|${month}`;
    type StatsPayload = {
      error?: string;
      agents?: AgentPerformanceRow[];
      team_averages?: TeamAverages;
      goal_month?: string;
    };
    type GoalsPayload = { error?: string; goals?: AgentGoal[] };

    const peekStats = peekCachedJson<StatsPayload>(statsKey);
    const peekGoals = peekCachedJson<GoalsPayload>(goalsKey);
    if (peekStats?.agents && peekGoals?.goals) {
      setAgents(peekStats.agents);
      setTeamAverages(peekStats.team_averages ?? EMPTY_TEAM_AVERAGES);
      if (peekStats.goal_month) setGoalMonth(peekStats.goal_month);
      setGoals(peekGoals.goals);
      setLoading(false);
    } else {
      setLoading(true);
    }

    const ac = new AbortController();
    Promise.all([
      cachedJsonFetch<StatsPayload>(statsKey, `/api/agent-stats?${params}`, {
        signal: ac.signal,
        preferCache: false,
      }),
      cachedJsonFetch<GoalsPayload>(goalsKey, `/api/goals?month=${encodeURIComponent(month)}`, {
        signal: ac.signal,
        preferCache: false,
      }),
    ])
      .then(([statsData, goalsData]) => {
        if (ac.signal.aborted) return;
        if (statsData.error) throw new Error(statsData.error);
        if (goalsData.error) throw new Error(goalsData.error);
        setAgents(statsData.agents ?? []);
        setTeamAverages(statsData.team_averages ?? EMPTY_TEAM_AVERAGES);
        if (statsData.goal_month) setGoalMonth(statsData.goal_month);
        setGoals(goalsData.goals ?? []);
        setLoading(false);
      })
      .catch((err: Error) => {
        if (ac.signal.aborted) return;
        setError(err.message || "Failed to load performance");
        setLoading(false);
      });
    return () => ac.abort();
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

      {!loading && kpiAgents.length > 0 && (
        <div className="space-y-8 pt-2">
          <div
            className="rounded-xl px-5 py-4"
            style={{
              background: "#0a1628",
              border: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
              <div>
                <h3 className="text-base font-semibold" style={{ color: "#e2e8f0" }}>
                  Team KPI report
                </h3>
                <p className="text-xs mt-0.5" style={{ color: "#475569" }}>
                  Period totals for the selected date range · click a scorecard to expand
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9 gap-3">
              {[
                { label: "Today dials", value: teamTotals.today_dials },
                { label: "Dials", value: teamTotals.dials },
                { label: "Pickups", value: teamTotals.pickups },
                { label: "Appts", value: teamTotals.appointments },
                { label: "Live transfers", value: teamTotals.live_transfers },
                { label: "Shows", value: teamTotals.shows },
                { label: "No shows", value: teamTotals.no_shows },
                { label: "Convos (show/LT)", value: teamTotals.show_lt },
                { label: "Callbacks", value: teamTotals.callbacks },
              ].map(stat => (
                <div key={stat.label}>
                  <p className="text-lg font-bold tabular-nums" style={{ color: "#e2e8f0" }}>
                    {stat.value.toLocaleString()}
                  </p>
                  <p className="text-[11px]" style={{ color: "#64748b" }}>
                    {stat.label}
                  </p>
                </div>
              ))}
            </div>
            <div
              className="mt-4 pt-3 flex flex-wrap gap-4 text-xs"
              style={{ borderTop: "1px solid rgba(255,255,255,0.05)", color: "#64748b" }}
            >
              <span>
                Avg pickup{" "}
                <span className="font-semibold tabular-nums" style={{ color: "#94a3b8" }}>
                  {teamAverages.pickup_rate}%
                </span>
              </span>
              <span>
                Avg show{" "}
                <span className="font-semibold tabular-nums" style={{ color: "#94a3b8" }}>
                  {teamAverages.show_rate}%
                </span>
              </span>
              <span>
                Per-rep avg dials{" "}
                <span className="font-semibold tabular-nums" style={{ color: "#94a3b8" }}>
                  {teamAverages.dials.toLocaleString()}
                </span>
              </span>
              <span>
                Per-rep avg appts{" "}
                <span className="font-semibold tabular-nums" style={{ color: "#94a3b8" }}>
                  {teamAverages.appointments.toLocaleString()}
                </span>
              </span>
            </div>
          </div>

          <AgentComparisonChart agents={kpiAgents} />

          <div>
            <h3 className="text-base font-semibold mb-4" style={{ color: "#e2e8f0" }}>
              Agent scorecards
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {kpiAgents.map((a, i) => (
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

          <div>
            <h3 className="text-base font-semibold mb-4" style={{ color: "#e2e8f0" }}>
              Full KPI table
            </h3>
            <AgentStatsTable agents={kpiAgents} />
          </div>
        </div>
      )}
    </div>
  );
}

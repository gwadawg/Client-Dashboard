"use client";

import { useEffect, useMemo, useState } from "react";
import AgentComparisonChart from "./agent-performance/AgentComparisonChart";
import AgentGoalCard from "./agent-performance/AgentGoalCard";
import AgentScorecard from "./agent-performance/AgentScorecard";
import AgentStatsTable from "./agent-performance/AgentStatsTable";
import {
  defaultBoardMode,
  formatPeriodLabel,
  periodAlignsWithMonthlyGoals,
  type FloorBoardMode,
} from "./agent-performance/board-mode";
import FloorPulseStrip from "./agent-performance/FloorPulseStrip";
import MonthlyRankingBoard, {
  buildRankMap,
} from "./agent-performance/MonthlyRankingBoard";
import TeamAveragesPanel from "./agent-performance/TeamAveragesPanel";
import VerticalDialMix from "./agent-performance/VerticalDialMix";
import {
  EMPTY_TEAM_AVERAGES,
  EMPTY_TEAM_TODAY,
  EMPTY_TEAM_TOTALS,
  type AgentGoal,
  type AgentPerformanceRow,
  type TeamAverages,
  type TeamToday,
  type TeamTotals,
  type VerticalEffort,
} from "@/lib/agent-performance-types";
import { calendarMonthOf } from "@/lib/calendar-month";
import { cachedJsonFetch, peekCachedJson } from "@/lib/client-fetch-cache";

type Props = {
  preset: string;
  startDate: string;
  endDate: string;
};

function emptyVerticalEffort(): VerticalEffort {
  const emptyBucket = (): VerticalEffort["by_type"]["RM"] => ({
    dials: 0,
    pickups: 0,
    conversations: 0,
    pickup_rate: 0,
    clients: [],
  });
  return {
    by_type: {
      RM: emptyBucket(),
      DSCR: emptyBucket(),
      CALL_CENTER: emptyBucket(),
    },
    unattributed: { dials: 0 },
    total_attributed_dials: 0,
  };
}

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
  const [teamTotals, setTeamTotals] = useState<TeamTotals>(EMPTY_TEAM_TOTALS);
  const [teamToday, setTeamToday] = useState<TeamToday>(EMPTY_TEAM_TODAY);
  const [verticalEffort, setVerticalEffort] = useState<VerticalEffort>(emptyVerticalEffort);
  const [goals, setGoals] = useState<AgentGoal[]>([]);
  const [goalMonth, setGoalMonth] = useState(() => calendarMonthOf(endDate).month);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<FloorBoardMode>(() => defaultBoardMode(preset));
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);

  const days = useMemo(() => periodDays(startDate, endDate), [startDate, endDate]);
  const periodLabel = useMemo(
    () => formatPeriodLabel(preset, startDate, endDate),
    [preset, startDate, endDate],
  );
  const monthlyGoalFit = useMemo(
    () => periodAlignsWithMonthlyGoals(startDate, endDate),
    [startDate, endDate],
  );

  // When the dashboard date preset changes, pick a sensible default lens
  useEffect(() => {
    setMode(defaultBoardMode(preset));
  }, [preset]);

  const rankMap = useMemo(() => buildRankMap(agents, mode), [agents, mode]);

  const scorecardAgents = useMemo(() => {
    return [...agents].sort((a, b) => {
      const ra = rankMap.get(a.agent_name) ?? 999;
      const rb = rankMap.get(b.agent_name) ?? 999;
      return ra - rb || a.agent_name.localeCompare(b.agent_name);
    });
  }, [agents, rankMap]);

  useEffect(() => {
    setError("");
    const month = calendarMonthOf(endDate).month;
    setGoalMonth(month);
    const params = new URLSearchParams();
    if (startDate) params.set("startDate", startDate);
    if (endDate) params.set("endDate", endDate);
    params.set("includeAllRoster", "1");

    const statsKey = `agent-stats|manager-v2|${params.toString()}`;
    const goalsKey = `goals|${month}`;
    type StatsPayload = {
      error?: string;
      agents?: AgentPerformanceRow[];
      team_averages?: TeamAverages;
      team_totals?: TeamTotals;
      team_today?: TeamToday;
      vertical_effort?: VerticalEffort;
      goal_month?: string;
    };
    type GoalsPayload = { error?: string; goals?: AgentGoal[] };

    const peekStats = peekCachedJson<StatsPayload>(statsKey);
    const peekGoals = peekCachedJson<GoalsPayload>(goalsKey);
    if (peekStats?.agents && peekGoals?.goals) {
      setAgents(peekStats.agents);
      setTeamAverages(peekStats.team_averages ?? EMPTY_TEAM_AVERAGES);
      setTeamTotals(peekStats.team_totals ?? EMPTY_TEAM_TOTALS);
      setTeamToday(peekStats.team_today ?? EMPTY_TEAM_TODAY);
      setVerticalEffort(peekStats.vertical_effort ?? emptyVerticalEffort());
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
        setTeamTotals(statsData.team_totals ?? EMPTY_TEAM_TOTALS);
        setTeamToday(statsData.team_today ?? EMPTY_TEAM_TODAY);
        setVerticalEffort(statsData.vertical_effort ?? emptyVerticalEffort());
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
    const showMonthlyGoals = mode === "period" && monthlyGoalFit.aligned;
    const rows = agents.map(agent => {
      if (mode === "today") {
        const target = dailyDialTarget(goals, agent.agent_name);
        const current = agent.today.dials;
        const pct = target && target > 0 ? current / target : null;
        return { agent, target, current, pct };
      }
      const target = showMonthlyGoals
        ? monthlyTarget(goals, agent.agent_name, goalMonth)
        : null;
      const current = agent.show_lt_conversations ?? 0;
      const pct = target && target > 0 ? current / target : null;
      return { agent, target, current, pct };
    });

    rows.sort((a, b) => {
      const aHas = a.target != null;
      const bHas = b.target != null;
      if (aHas !== bHas) return aHas ? -1 : 1;
      if (a.pct != null && b.pct != null && a.pct !== b.pct) return b.pct - a.pct;
      // Without goals: sort by score
      if (a.current !== b.current) return b.current - a.current;
      return a.agent.agent_name.localeCompare(b.agent.agent_name);
    });

    return rows;
  }, [agents, goals, goalMonth, mode, monthlyGoalFit.aligned]);

  function toggleAgent(name: string) {
    setExpandedAgent(prev => (prev === name ? null : name));
  }

  const monthName = (() => {
    const [y, m] = goalMonth.split("-").map(Number);
    if (!y || !m) return goalMonth;
    return new Date(y, m - 1, 1).toLocaleString("en-US", { month: "long", year: "numeric" });
  })();

  const defaultComparisonMetric =
    mode === "period" ? ("show_lt_conversations" as const) : ("dials" as const);

  const showMonthlyGoalSection = mode === "period" && monthlyGoalFit.aligned;
  const showTodayGoalSection = mode === "today";

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight" style={{ color: "#e2e8f0" }}>
            Floor command
          </h2>
          <p className="text-sm mt-0.5" style={{ color: "#475569" }}>
            <span style={{ color: "#94a3b8" }}>{periodLabel}</span>
            {" · "}
            period numbers follow the date filter · Today is always the live call-center day
          </p>
        </div>
        <div
          className="inline-flex gap-1 p-1 rounded-full"
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
          title="Lens only — does not change the date filter window"
        >
          {(
            [
              ["period", "Period"],
              ["today", "Today"],
            ] as const
          ).map(([key, label]) => (
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
          Loading floor…
        </div>
      ) : agents.length === 0 ? (
        <div className="py-12 text-center text-sm" style={{ color: "#1e3a5f" }}>
          No agents on the roster
        </div>
      ) : (
        <div className="space-y-8">
          <FloorPulseStrip
            mode={mode}
            teamToday={teamToday}
            teamTotals={teamTotals}
            teamAverages={teamAverages}
            periodLabel={periodLabel}
          />

          <TeamAveragesPanel teamAverages={teamAverages} />

          <MonthlyRankingBoard mode={mode} agents={agents} periodLabel={periodLabel} />

          {/* Goals — only when current compares cleanly to target window */}
          {(showMonthlyGoalSection || showTodayGoalSection) && (
            <div>
              <div className="flex flex-wrap items-end justify-between gap-2 mb-4">
                <div>
                  <h3 className="text-base font-semibold" style={{ color: "#e2e8f0" }}>
                    {showTodayGoalSection
                      ? "Daily dial goals"
                      : `Monthly conversation goals · ${monthName}`}
                  </h3>
                  <p className="text-xs mt-0.5" style={{ color: "#475569" }}>
                    {showTodayGoalSection
                      ? "Today dials vs daily dial goals (live call-center day)"
                      : `Show/LT in this period (month-to-date or full month) vs ${monthName} targets`}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {boardRows.map((row, i) => (
                  <AgentGoalCard
                    key={row.agent.agent_name}
                    rank={i + 1}
                    agentName={row.agent.agent_name}
                    current={row.current}
                    target={row.target}
                    metricLabel={
                      showTodayGoalSection
                        ? "Dials today"
                        : "Conversations (show / LT) this period"
                    }
                    muted={row.target == null}
                  />
                ))}
              </div>
            </div>
          )}

          {mode === "period" && !monthlyGoalFit.aligned && (
            <div
              className="rounded-xl px-4 py-3 text-sm"
              style={{
                background: "rgba(245,158,11,0.06)",
                border: "1px solid rgba(245,158,11,0.15)",
                color: "#94a3b8",
              }}
            >
              Monthly conversation goals are hidden because the filter is{" "}
              <span style={{ color: "#e2e8f0" }}>{periodLabel}</span>, not a month view. Rankings
              and KPIs still use this period. Choose{" "}
              <span style={{ color: "#f59e0b" }}>This Month</span> (or Last Month) to track
              monthly goals.
            </div>
          )}

          <VerticalDialMix verticalEffort={verticalEffort} />

          <AgentComparisonChart
            agents={scorecardAgents}
            defaultMetric={defaultComparisonMetric}
          />

          <div>
            <h3 className="text-base font-semibold mb-4" style={{ color: "#e2e8f0" }}>
              Agent scorecards
              <span className="text-xs font-normal ml-2" style={{ color: "#475569" }}>
                period stats = date filter · today strip = live day
              </span>
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {scorecardAgents.map(a => (
                <AgentScorecard
                  key={a.agent_name}
                  agent={a}
                  rank={rankMap.get(a.agent_name) ?? 0}
                  rankLabel={mode === "period" ? "Period rank" : "Today rank"}
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
            <AgentStatsTable agents={scorecardAgents} rankMap={rankMap} mode={mode} />
          </div>

          <p className="text-[11px] leading-relaxed pb-2" style={{ color: "#334155" }}>
            Date filter sets the period for dials, pickups, appts, shows, LTs, Show/LT, vertical
            mix, and averages. Today lens ranks live call-center day only. Appts / Shows / LTs =
            call-rep pay credit rules.
          </p>
        </div>
      )}
    </div>
  );
}

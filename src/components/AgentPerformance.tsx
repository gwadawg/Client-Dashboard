"use client";

import { useEffect, useMemo, useState } from "react";
import AgentComparisonChart from "./agent-performance/AgentComparisonChart";
import AgentScorecard from "./agent-performance/AgentScorecard";
import AgentStatsTable from "./agent-performance/AgentStatsTable";
import {
  type AgentGoal,
  type AgentPerformanceRow,
  type TeamAverages,
} from "@/lib/agent-performance-types";

type Props = {
  preset: string;
  startDate: string;
  endDate: string;
};

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

export default function AgentPerformance({ preset, startDate, endDate }: Props) {
  const [agents, setAgents] = useState<AgentPerformanceRow[]>([]);
  const [teamAverages, setTeamAverages] = useState<TeamAverages>(EMPTY_TEAM_AVERAGES);
  const [goals, setGoals] = useState<AgentGoal[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);
  const [showTable, setShowTable] = useState(false);

  const days = useMemo(() => periodDays(startDate, endDate), [startDate, endDate]);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (startDate) params.set("startDate", startDate);
    if (endDate) params.set("endDate", endDate);

    Promise.all([
      fetch(`/api/agent-stats?${params}`).then(r => r.json()),
      fetch("/api/goals").then(r => r.json()),
    ])
      .then(([statsData, goalsData]) => {
        setAgents(statsData.agents ?? []);
        setTeamAverages(statsData.team_averages ?? EMPTY_TEAM_AVERAGES);
        setGoals(goalsData.goals ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [preset, startDate, endDate]);

  function toggleAgent(name: string) {
    setExpandedAgent(prev => (prev === name ? null : name));
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold" style={{ color: "#e2e8f0" }}>
          Agent Performance
        </h2>
        <p className="text-sm mt-0.5" style={{ color: "#475569" }}>
          Compare agents, track today&apos;s pace, and drill into full KPIs (all clients combined)
        </p>
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm" style={{ color: "#1e3a5f" }}>
          Loading…
        </div>
      ) : agents.length === 0 ? (
        <div className="py-12 text-center text-sm" style={{ color: "#1e3a5f" }}>
          No agent data for this period
        </div>
      ) : (
        <>
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
                  expanded={expandedAgent === a.agent_name}
                  onToggle={() => toggleAgent(a.agent_name)}
                />
              ))}
            </div>
          </div>

          <div>
            <button
              type="button"
              onClick={() => setShowTable(v => !v)}
              className="text-sm font-medium px-4 py-2 rounded-lg transition-colors"
              style={{
                background: "rgba(255,255,255,0.04)",
                color: "#94a3b8",
                border: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              {showTable ? "Hide full table" : "View full table"}
            </button>
            {showTable && (
              <div className="mt-4">
                <AgentStatsTable agents={agents} />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

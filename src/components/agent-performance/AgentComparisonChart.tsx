"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  COMPARISON_METRICS,
  type AgentPerformanceRow,
  type ComparisonMetricKey,
} from "@/lib/agent-performance-types";

type Props = {
  agents: AgentPerformanceRow[];
};

const MUTED = "#475569";
const TOOLTIP_STYLE = {
  background: "#0f2040",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 8,
  fontSize: 12,
};

export default function AgentComparisonChart({ agents }: Props) {
  const [metric, setMetric] = useState<ComparisonMetricKey>("appointments");
  const [showGrouped, setShowGrouped] = useState(false);

  const metricDef = COMPARISON_METRICS.find(m => m.key === metric)!;

  const singleMetricData = useMemo(() => {
    return [...agents]
      .sort((a, b) => b[metric] - a[metric])
      .map(a => ({
        name: a.agent_name.length > 14 ? `${a.agent_name.slice(0, 12)}…` : a.agent_name,
        fullName: a.agent_name,
        value: a[metric],
      }));
  }, [agents, metric]);

  const groupedData = useMemo(() => {
    const top = [...agents]
      .sort((a, b) => b.appointments - a.appointments)
      .slice(0, 5);
    return top.map(a => ({
      name: a.agent_name.length > 12 ? `${a.agent_name.slice(0, 10)}…` : a.agent_name,
      fullName: a.agent_name,
      Dials: a.dials,
      Pickups: a.pickups,
      Appointments: a.appointments,
      Transfers: a.live_transfers,
      Shows: a.shows,
    }));
  }, [agents]);

  if (agents.length === 0) return null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-base font-semibold" style={{ color: "#e2e8f0" }}>
          Agent Comparison
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowGrouped(v => !v)}
            className="text-xs px-3 py-1.5 rounded-lg transition-colors"
            style={{
              background: showGrouped ? "rgba(245,158,11,0.15)" : "rgba(255,255,255,0.04)",
              color: showGrouped ? "#f59e0b" : "#64748b",
              border: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            {showGrouped ? "Single metric" : "Grouped view"}
          </button>
          {!showGrouped &&
            COMPARISON_METRICS.map(m => (
              <button
                key={m.key}
                type="button"
                onClick={() => setMetric(m.key)}
                className="text-xs px-3 py-1.5 rounded-lg transition-colors"
                style={{
                  background: metric === m.key ? "rgba(245,158,11,0.15)" : "rgba(255,255,255,0.04)",
                  color: metric === m.key ? "#f59e0b" : "#64748b",
                  border: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                {m.label}
              </button>
            ))}
        </div>
      </div>

      <div
        className="rounded-xl p-4"
        style={{
          background: "#0a1628",
          border: "1px solid rgba(255,255,255,0.06)",
          height: showGrouped ? 320 : Math.max(240, singleMetricData.length * 36 + 48),
        }}
      >
        <ResponsiveContainer width="100%" height="100%">
          {showGrouped ? (
            <BarChart data={groupedData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis dataKey="name" tick={{ fill: MUTED, fontSize: 11 }} />
              <YAxis tick={{ fill: MUTED, fontSize: 11 }} />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                labelFormatter={(_, payload) =>
                  payload?.[0]?.payload?.fullName ? String(payload[0].payload.fullName) : ""
                }
              />
              <Legend wrapperStyle={{ fontSize: 11, color: MUTED }} />
              {COMPARISON_METRICS.map(m => (
                <Bar
                  key={m.key}
                  dataKey={
                    m.key === "live_transfers"
                      ? "Transfers"
                      : m.key.charAt(0).toUpperCase() + m.key.slice(1)
                  }
                  fill={m.color}
                  radius={[2, 2, 0, 0]}
                  maxBarSize={28}
                />
              ))}
            </BarChart>
          ) : (
            <BarChart
              data={singleMetricData}
              layout="vertical"
              margin={{ left: 8, right: 24, top: 8, bottom: 8 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" horizontal={false} />
              <XAxis type="number" tick={{ fill: MUTED, fontSize: 11 }} />
              <YAxis
                type="category"
                dataKey="name"
                width={100}
                tick={{ fill: "#94a3b8", fontSize: 11 }}
              />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(v) => [typeof v === "number" ? v : Number(v ?? 0), metricDef.label]}
                labelFormatter={(_, payload) =>
                  payload?.[0]?.payload?.fullName ? String(payload[0].payload.fullName) : ""
                }
              />
              <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={22}>
                {singleMetricData.map((_, i) => (
                  <Cell key={i} fill={metricDef.color} fillOpacity={0.85} />
                ))}
              </Bar>
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

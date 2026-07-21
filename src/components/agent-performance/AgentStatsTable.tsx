"use client";

import type { AgentPerformanceRow } from "@/lib/agent-performance-types";

type Props = {
  agents: AgentPerformanceRow[];
};

function rateColor(rate: number): string {
  if (rate >= 50) return "#34d399";
  if (rate >= 25) return "#fbbf24";
  return "#f87171";
}

type Col =
  | { key: keyof AgentPerformanceRow; label: string; kind: "number" | "rate" }
  | { key: "today_dials"; label: string; kind: "today" }
  | { key: "stl"; label: string; kind: "stl" };

const STAT_COLS: Col[] = [
  { key: "today_dials", label: "Today dials", kind: "today" },
  { key: "dials", label: "Dials", kind: "number" },
  { key: "pickups", label: "Pickups", kind: "number" },
  { key: "pickup_rate", label: "Pickup %", kind: "rate" },
  { key: "conversations", label: "Talk convos", kind: "number" },
  { key: "conversation_rate", label: "Talk %", kind: "rate" },
  { key: "appointments", label: "Appts", kind: "number" },
  { key: "callbacks", label: "Callbacks", kind: "number" },
  { key: "live_transfers", label: "LTs", kind: "number" },
  { key: "shows", label: "Shows", kind: "number" },
  { key: "no_shows", label: "No shows", kind: "number" },
  { key: "lo_bailed", label: "LO bail", kind: "number" },
  { key: "pending", label: "Pending", kind: "number" },
  { key: "show_rate", label: "Show %", kind: "rate" },
  { key: "show_lt_conversations", label: "Show/LT", kind: "number" },
  { key: "stl", label: "STL (min)", kind: "stl" },
];

export default function AgentStatsTable({ agents }: Props) {
  return (
    <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: "#050c18" }}>
              <th
                className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider whitespace-nowrap"
                style={{ color: "#475569", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
              >
                Agent
              </th>
              {STAT_COLS.map(c => (
                <th
                  key={c.key}
                  className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider whitespace-nowrap"
                  style={{ color: "#475569", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {agents.length === 0 ? (
              <tr>
                <td
                  colSpan={STAT_COLS.length + 1}
                  className="px-4 py-12 text-center text-sm"
                  style={{ color: "#1e3a5f" }}
                >
                  No agent data
                </td>
              </tr>
            ) : (
              agents.map((a, i) => (
                <tr
                  key={a.agent_name}
                  style={{
                    borderTop: "1px solid rgba(255,255,255,0.03)",
                    background: i % 2 === 0 ? "rgba(255,255,255,0.015)" : "transparent",
                  }}
                >
                  <td className="px-4 py-3 font-medium whitespace-nowrap" style={{ color: "#e2e8f0" }}>
                    {a.agent_name}
                  </td>
                  {STAT_COLS.map(c => {
                    if (c.kind === "today") {
                      return (
                        <td
                          key={c.key}
                          className="px-4 py-3 text-right whitespace-nowrap tabular-nums"
                          style={{ color: "#f59e0b" }}
                        >
                          {a.today.dials.toLocaleString()}
                        </td>
                      );
                    }
                    if (c.kind === "stl") {
                      return (
                        <td
                          key={c.key}
                          className="px-4 py-3 text-right whitespace-nowrap tabular-nums"
                          style={{ color: "#94a3b8" }}
                        >
                          {a.avg_speed_to_lead_min != null ? a.avg_speed_to_lead_min : "—"}
                        </td>
                      );
                    }
                    const v = a[c.key] as number;
                    return (
                      <td
                        key={c.key}
                        className="px-4 py-3 text-right whitespace-nowrap tabular-nums"
                        style={{ color: c.kind === "rate" ? rateColor(v) : "#94a3b8" }}
                      >
                        {c.kind === "rate" ? `${v}%` : (v ?? 0).toLocaleString()}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

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

export default function AgentStatsTable({ agents }: Props) {
  const statCols = [
    { key: "dials", label: "Dials" },
    { key: "pickups", label: "Pickups" },
    { key: "pickup_rate", label: "Pickup %" },
    { key: "conversations", label: "Convos" },
    { key: "conversation_rate", label: "Convo %" },
    { key: "appointments", label: "Appts" },
    { key: "callbacks", label: "Callbacks" },
    { key: "live_transfers", label: "Transfers" },
    { key: "shows", label: "Shows" },
    { key: "no_shows", label: "No Shows" },
    { key: "show_rate", label: "Show %" },
  ] as const;

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
              {statCols.map(c => (
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
                <td colSpan={statCols.length + 1} className="px-4 py-12 text-center text-sm" style={{ color: "#1e3a5f" }}>
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
                  {statCols.map(c => {
                    const v = a[c.key];
                    const isRate = c.key.endsWith("_rate");
                    return (
                      <td
                        key={c.key}
                        className="px-4 py-3 text-right whitespace-nowrap tabular-nums"
                        style={{ color: isRate ? rateColor(v as number) : "#94a3b8" }}
                      >
                        {isRate ? `${v}%` : (v as number).toLocaleString()}
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

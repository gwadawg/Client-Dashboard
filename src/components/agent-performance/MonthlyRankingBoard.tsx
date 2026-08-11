"use client";

import type { AgentPerformanceRow } from "@/lib/agent-performance-types";
import type { FloorBoardMode } from "./board-mode";

export type RankMode = FloorBoardMode;

type Props = {
  mode: RankMode;
  agents: AgentPerformanceRow[];
  periodLabel: string;
};

function rankValue(a: AgentPerformanceRow, mode: RankMode): number {
  return mode === "period" ? (a.show_lt_conversations ?? 0) : a.today.dials;
}

function rankColor(rank: number): string {
  if (rank === 1) return "#f59e0b";
  if (rank === 2) return "#94a3b8";
  if (rank === 3) return "#d97706";
  return "#64748b";
}

export default function MonthlyRankingBoard({ mode, agents, periodLabel }: Props) {
  const ranked = [...agents].sort((a, b) => {
    const dv = rankValue(b, mode) - rankValue(a, mode);
    if (dv !== 0) return dv;
    if (mode === "period") {
      const ap = b.appointments - a.appointments;
      if (ap !== 0) return ap;
    } else {
      const ap = b.today.appointments - a.today.appointments;
      if (ap !== 0) return ap;
    }
    return a.agent_name.localeCompare(b.agent_name);
  });

  const podium = ranked.slice(0, 3);

  const title =
    mode === "period" ? `Period rank · ${periodLabel}` : "Today rank · dials (live day)";
  const metricHint =
    mode === "period"
      ? "Primary: Show/LT in the selected period (unique pay show ∪ live transfer)"
      : "Primary: dials today · secondary appointments / LTs · not limited by period filter";

  if (ranked.length === 0) return null;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold" style={{ color: "#e2e8f0" }}>
            {title}
          </h3>
          <p className="text-xs mt-0.5" style={{ color: "#475569" }}>
            {metricHint}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {podium.map((a, i) => {
          const rank = i + 1;
          const val = rankValue(a, mode);
          const heights = ["sm:order-2 sm:mt-0", "sm:order-1 sm:mt-4", "sm:order-3 sm:mt-6"];
          return (
            <div
              key={a.agent_name}
              className={`rounded-2xl p-5 ${heights[i] ?? ""}`}
              style={{
                background:
                  rank === 1
                    ? "linear-gradient(165deg, rgba(245,158,11,0.14) 0%, #0a1628 70%)"
                    : "linear-gradient(165deg, #0d1b2e 0%, #0a1628 100%)",
                border:
                  rank === 1
                    ? "1px solid rgba(245,158,11,0.4)"
                    : "1px solid rgba(255,255,255,0.07)",
                boxShadow: rank === 1 ? "inset 0 1px 0 rgba(245,158,11,0.2)" : undefined,
              }}
            >
              <div className="flex items-start justify-between gap-2">
                <span
                  className="text-3xl font-black tabular-nums leading-none"
                  style={{ color: rankColor(rank) }}
                >
                  {rank}
                </span>
                <span
                  className="text-[10px] font-bold uppercase tracking-widest"
                  style={{ color: "#64748b" }}
                >
                  {rank === 1 ? "Leader" : rank === 2 ? "2nd" : "3rd"}
                </span>
              </div>
              <p className="text-lg font-bold mt-3 truncate" style={{ color: "#f8fafc" }}>
                {a.agent_name}
              </p>
              <p
                className="text-3xl font-extrabold tabular-nums mt-2"
                style={{ color: rankColor(rank) }}
              >
                {val.toLocaleString()}
              </p>
              <p className="text-xs mt-1" style={{ color: "#64748b" }}>
                {mode === "period" ? "Show/LT in period" : "Dials today"}
              </p>
              <div
                className="mt-4 grid grid-cols-3 gap-2 pt-3 text-center"
                style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
              >
                {mode === "period" ? (
                  <>
                    <Mini k="Appts" v={a.appointments} />
                    <Mini k="Shows" v={a.shows} />
                    <Mini k="Dials" v={a.dials} />
                  </>
                ) : (
                  <>
                    <Mini k="Pickups" v={a.today.pickups} />
                    <Mini k="Appts" v={a.today.appointments} />
                    <Mini k="LTs" v={a.today.live_transfers} />
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div
        className="rounded-xl overflow-hidden"
        style={{ border: "1px solid rgba(255,255,255,0.06)" }}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: "#050c18" }}>
                {(mode === "period"
                  ? ["#", "Agent", "Show/LT", "Appts", "Shows", "LTs", "Dials", "Pickup %", "Show %"]
                  : ["#", "Agent", "Dials", "Pickups", "Appts", "LTs", "Period dials", "Period appts"]
                ).map((h, i) => (
                  <th
                    key={h}
                    className={`px-3 py-2.5 text-xs font-semibold uppercase tracking-wider whitespace-nowrap ${
                      i <= 1 ? "text-left" : "text-right"
                    }`}
                    style={{ color: "#475569", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ranked.map((a, i) => {
                const rank = i + 1;
                return (
                  <tr
                    key={a.agent_name}
                    style={{
                      background:
                        rank <= 3
                          ? "rgba(245,158,11,0.04)"
                          : i % 2 === 0
                            ? "rgba(255,255,255,0.015)"
                            : "transparent",
                      borderTop: "1px solid rgba(255,255,255,0.03)",
                    }}
                  >
                    <td
                      className="px-3 py-2.5 tabular-nums font-bold"
                      style={{ color: rankColor(rank) }}
                    >
                      {rank}
                    </td>
                    <td
                      className="px-3 py-2.5 font-medium whitespace-nowrap"
                      style={{ color: "#e2e8f0" }}
                    >
                      {a.agent_name}
                    </td>
                    {mode === "period" ? (
                      <>
                        <Td bold v={a.show_lt_conversations ?? 0} />
                        <Td v={a.appointments} />
                        <Td v={a.shows} />
                        <Td v={a.live_transfers} />
                        <Td v={a.dials} />
                        <Td v={a.pickup_rate} suffix="%" />
                        <Td v={a.show_rate} suffix="%" />
                      </>
                    ) : (
                      <>
                        <Td bold v={a.today.dials} accent />
                        <Td v={a.today.pickups} />
                        <Td v={a.today.appointments} />
                        <Td v={a.today.live_transfers} />
                        <Td v={a.dials} />
                        <Td v={a.appointments} />
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function Mini({ k, v }: { k: string; v: number }) {
  return (
    <div>
      <p className="text-sm font-bold tabular-nums" style={{ color: "#cbd5e1" }}>
        {v.toLocaleString()}
      </p>
      <p className="text-[10px]" style={{ color: "#475569" }}>
        {k}
      </p>
    </div>
  );
}

function Td({
  v,
  bold,
  accent,
  suffix,
}: {
  v: number;
  bold?: boolean;
  accent?: boolean;
  suffix?: string;
}) {
  return (
    <td
      className={`px-3 py-2.5 text-right tabular-nums whitespace-nowrap ${bold ? "font-bold" : ""}`}
      style={{ color: accent ? "#f59e0b" : bold ? "#e2e8f0" : "#94a3b8" }}
    >
      {v.toLocaleString()}
      {suffix ?? ""}
    </td>
  );
}

/** Build rank map for scorecards (1-based). */
export function buildRankMap(agents: AgentPerformanceRow[], mode: RankMode): Map<string, number> {
  const sorted = [...agents].sort((a, b) => {
    const dv = rankValue(b, mode) - rankValue(a, mode);
    if (dv !== 0) return dv;
    if (mode === "period") {
      const ap = b.appointments - a.appointments;
      if (ap !== 0) return ap;
    } else {
      const ap = b.today.appointments - a.today.appointments;
      if (ap !== 0) return ap;
    }
    return a.agent_name.localeCompare(b.agent_name);
  });
  const map = new Map<string, number>();
  sorted.forEach((a, i) => map.set(a.agent_name, i + 1));
  return map;
}

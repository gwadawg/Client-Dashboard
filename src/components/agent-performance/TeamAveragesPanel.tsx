"use client";

import type { TeamAverages } from "@/lib/agent-performance-types";

type Props = {
  teamAverages: TeamAverages;
};

const CELLS: { key: keyof TeamAverages; label: string; isRate?: boolean }[] = [
  { key: "dials", label: "Dials" },
  { key: "pickups", label: "Pickups" },
  { key: "appointments", label: "Appts" },
  { key: "live_transfers", label: "LTs" },
  { key: "shows", label: "Shows" },
  { key: "show_lt_conversations", label: "Show/LT" },
  { key: "conversations", label: "Talk convos" },
  { key: "callbacks", label: "Callbacks" },
  { key: "pickup_rate", label: "Pickup %", isRate: true },
  { key: "conversation_rate", label: "Talk %", isRate: true },
  { key: "show_rate", label: "Show %", isRate: true },
];

export default function TeamAveragesPanel({ teamAverages }: Props) {
  const n = teamAverages.active_rep_count;
  return (
    <section
      className="rounded-2xl px-5 py-4 sm:px-6"
      style={{
        background: "rgba(255,255,255,0.02)",
        border: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
        <div>
          <h3 className="text-sm font-semibold" style={{ color: "#e2e8f0" }}>
            Floor averages
          </h3>
          <p className="text-xs mt-0.5" style={{ color: "#475569" }}>
            Benchmark per active rep · use this line on scorecards
          </p>
        </div>
        <span
          className="text-[11px] font-semibold tabular-nums px-2.5 py-1 rounded-full"
          style={{
            background: "rgba(245,158,11,0.1)",
            color: "#f59e0b",
            border: "1px solid rgba(245,158,11,0.2)",
          }}
        >
          {n} active rep{n === 1 ? "" : "s"}
        </span>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-11 gap-3">
        {CELLS.map(c => {
          const v = teamAverages[c.key];
          if (typeof v !== "number") return null;
          return (
            <div key={c.key}>
              <p className="text-base font-bold tabular-nums" style={{ color: "#cbd5e1" }}>
                {c.isRate ? `${v}%` : v.toLocaleString()}
              </p>
              <p className="text-[10px] uppercase tracking-wider" style={{ color: "#475569" }}>
                {c.label}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

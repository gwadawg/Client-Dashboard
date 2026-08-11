"use client";

import type { TeamAverages, TeamToday, TeamTotals } from "@/lib/agent-performance-types";
import type { FloorBoardMode } from "./board-mode";

type Props = {
  mode: FloorBoardMode;
  teamToday: TeamToday;
  teamTotals: TeamTotals;
  teamAverages: TeamAverages;
  periodLabel: string;
};

function StatCell({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="min-w-0">
      <p
        className="text-[2rem] sm:text-[2.25rem] font-extrabold tabular-nums leading-none tracking-tight"
        style={{ color: accent ?? "#f8fafc" }}
      >
        {value}
      </p>
      <p
        className="text-[10px] font-semibold uppercase tracking-[0.14em] mt-2"
        style={{ color: "#64748b" }}
      >
        {label}
      </p>
      {sub ? (
        <p className="text-[11px] mt-0.5 tabular-nums" style={{ color: "#475569" }}>
          {sub}
        </p>
      ) : null}
    </div>
  );
}

export default function FloorPulseStrip({
  mode,
  teamToday,
  teamTotals,
  teamAverages,
  periodLabel,
}: Props) {
  if (mode === "today") {
    return (
      <section
        className="rounded-2xl px-5 py-5 sm:px-7 sm:py-6 relative overflow-hidden"
        style={{
          background: "linear-gradient(135deg, #0c1a30 0%, #0a1628 55%, #0d2038 100%)",
          border: "1px solid rgba(245,158,11,0.18)",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
        }}
      >
        <div
          className="pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full opacity-30"
          style={{ background: "radial-gradient(circle, rgba(245,158,11,0.25), transparent 70%)" }}
        />
        <div className="relative flex flex-wrap items-end justify-between gap-3 mb-5">
          <div>
            <p
              className="text-[10px] font-bold uppercase tracking-[0.18em]"
              style={{ color: "#f59e0b" }}
            >
              Floor pulse · Live today
            </p>
            <h2 className="text-lg sm:text-xl font-semibold mt-1" style={{ color: "#e2e8f0" }}>
              Call-center local day
            </h2>
          </div>
          <p className="text-xs max-w-xs text-right" style={{ color: "#64748b" }}>
            Not limited by the period filter · always today
          </p>
        </div>
        <div className="relative grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-6 sm:gap-8">
          <StatCell
            label="Dials today"
            value={teamToday.dials.toLocaleString()}
            accent="#f59e0b"
          />
          <StatCell
            label="Pickups today"
            value={teamToday.pickups.toLocaleString()}
            sub={`${teamToday.pickup_rate}% pickup`}
          />
          <StatCell label="Appts today" value={teamToday.appointments.toLocaleString()} />
          <StatCell label="LTs today" value={teamToday.live_transfers.toLocaleString()} />
          <StatCell
            label="Team pickup %"
            value={`${teamToday.pickup_rate}%`}
            accent={teamToday.pickup_rate >= 25 ? "#34d399" : "#fbbf24"}
            sub="on today's dials"
          />
        </div>
      </section>
    );
  }

  const headlines: { label: string; value: string; avg?: string; accent?: string }[] = [
    {
      label: "Dials",
      value: teamTotals.dials.toLocaleString(),
      avg: `avg ${teamAverages.dials.toLocaleString()}/rep`,
    },
    {
      label: "Pickup %",
      value: `${teamTotals.pickup_rate}%`,
      accent: teamTotals.pickup_rate >= 25 ? "#34d399" : "#fbbf24",
      avg: "team rate",
    },
    {
      label: "Appts",
      value: teamTotals.appointments.toLocaleString(),
      avg: `avg ${teamAverages.appointments.toLocaleString()}/rep`,
      accent: "#f59e0b",
    },
    {
      label: "Live transfers",
      value: teamTotals.live_transfers.toLocaleString(),
      avg: `avg ${teamAverages.live_transfers.toLocaleString()}/rep`,
    },
    {
      label: "Shows",
      value: teamTotals.shows.toLocaleString(),
      avg: `avg ${teamAverages.shows.toLocaleString()}/rep`,
    },
    {
      label: "Show / LT",
      value: teamTotals.show_lt_conversations.toLocaleString(),
      avg: `avg ${teamAverages.show_lt_conversations.toLocaleString()}/rep`,
      accent: "#f472b6",
    },
    {
      label: "Show %",
      value: `${teamTotals.show_rate}%`,
      accent: teamTotals.show_rate >= 50 ? "#34d399" : "#fbbf24",
      avg: "pay shows / dispositioned",
    },
  ];

  return (
    <section
      className="rounded-2xl px-5 py-5 sm:px-7 sm:py-6"
      style={{
        background: "linear-gradient(160deg, #0a1628 0%, #0c1e36 100%)",
        border: "1px solid rgba(255,255,255,0.07)",
      }}
    >
      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <p
            className="text-[10px] font-bold uppercase tracking-[0.18em]"
            style={{ color: "#64748b" }}
          >
            Period · {periodLabel}
          </p>
          <h2 className="text-lg sm:text-xl font-semibold mt-1" style={{ color: "#e2e8f0" }}>
            Team KPI strip
          </h2>
        </div>
        <p className="text-xs max-w-sm text-right" style={{ color: "#475569" }}>
          Matches the date filter above · averages over {teamAverages.active_rep_count} active rep
          {teamAverages.active_rep_count === 1 ? "" : "s"}
        </p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-5 sm:gap-6">
        {headlines.map(h => (
          <StatCell key={h.label} label={h.label} value={h.value} sub={h.avg} accent={h.accent} />
        ))}
      </div>
    </section>
  );
}

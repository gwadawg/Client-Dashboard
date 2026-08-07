"use client";

import dynamic from "next/dynamic";
import type { TeamDashboardTab } from "@/lib/nav";
import { TEAM_DASHBOARD_TABS } from "@/lib/nav";
import { seatLabel, seatSubtitle } from "@/lib/team-dashboards/access";

const CcmCommandDashboard = dynamic(
  () => import("./CcmCommandDashboard"),
  { loading: () => <SeatSkeleton label="CCM" />, ssr: false },
);
const MediaBuyerCommandDashboard = dynamic(
  () => import("./MediaBuyerCommandDashboard"),
  { loading: () => <SeatSkeleton label="Media Buyer" />, ssr: false },
);
const CsCommandDashboard = dynamic(
  () => import("./CsCommandDashboard"),
  { loading: () => <SeatSkeleton label="CS" />, ssr: false },
);

function SeatSkeleton({ label }: { label: string }) {
  return (
    <div className="space-y-4 pt-2" aria-busy="true" aria-label={`Loading ${label}`}>
      <div
        className="h-24 w-full animate-pulse rounded-lg"
        style={{ background: "rgba(148,163,184,0.1)" }}
      />
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4">
        <div
          className="h-56 animate-pulse rounded-lg"
          style={{ background: "rgba(148,163,184,0.08)" }}
        />
        <div
          className="h-56 animate-pulse rounded-lg"
          style={{ background: "rgba(148,163,184,0.08)" }}
        />
      </div>
    </div>
  );
}

type Props = {
  /** Active seat lens — only this panel mounts (one data load at a time). */
  seat: TeamDashboardTab;
  /** Seat the signed-in user lands on by role (visual “My plate”). */
  homeSeat: TeamDashboardTab | null;
  onSeatChange: (seat: TeamDashboardTab) => void;
  onNavigate?: (view: string, tab?: string) => void;
};

/**
 * One Team Command surface. Seat switcher defaults to the rep’s plate;
 * peer seats load only when selected — never all three in parallel.
 */
export default function TeamCommandDashboard({
  seat,
  homeSeat,
  onSeatChange,
  onNavigate,
}: Props) {
  return (
    <div className="team-command space-y-5">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p
            className="text-[10px] font-semibold uppercase tracking-[0.22em]"
            style={{ color: "#64748b" }}
          >
            Team Command
          </p>
          <h1
            className="mt-1 text-2xl font-semibold tracking-tight"
            style={{ color: "#f1f5f9" }}
          >
            {seatLabel(seat)}
          </h1>
          <p className="mt-1 text-sm" style={{ color: "#64748b" }}>
            {seatSubtitle(seat)}
            {homeSeat && seat === homeSeat ? (
              <span style={{ color: "#94a3b8" }}> · Your plate</span>
            ) : homeSeat && seat !== homeSeat ? (
              <span style={{ color: "#64748b" }}>
                {" "}
                · Viewing {seatLabel(seat)} plate
              </span>
            ) : null}
          </p>
        </div>

        <div
          role="tablist"
          aria-label="Team seat view"
          className="inline-flex shrink-0 rounded-lg p-1 self-start"
          style={{
            background: "rgba(15,23,42,0.85)",
            border: "1px solid rgba(148,163,184,0.14)",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
          }}
        >
          {TEAM_DASHBOARD_TABS.map(tab => {
            const active = seat === tab.key;
            const isMine = homeSeat === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onSeatChange(tab.key)}
                className="relative px-3.5 py-2 text-xs font-semibold tracking-wide rounded-md transition-colors"
                style={{
                  color: active ? "#f8fafc" : "#64748b",
                  background: active
                    ? "linear-gradient(180deg, rgba(56,189,248,0.18), rgba(30,58,95,0.55))"
                    : "transparent",
                  boxShadow: active
                    ? "0 0 0 1px rgba(56,189,248,0.22)"
                    : "none",
                }}
              >
                {tab.label}
                {isMine ? (
                  <span
                    className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle"
                    style={{ background: "#38bdf8" }}
                    title="Your default seat"
                  />
                ) : null}
              </button>
            );
          })}
        </div>
      </header>

      {/* Mount ONLY the active seat — avoids stacked health / floor reloads. */}
      <div key={seat} className="team-command-seat">
        {seat === "cs" && (
          <CsCommandDashboard onNavigate={onNavigate} embedded />
        )}
        {seat === "ccm" && (
          <CcmCommandDashboard onNavigate={onNavigate} embedded />
        )}
        {seat === "media" && (
          <MediaBuyerCommandDashboard onNavigate={onNavigate} embedded />
        )}
      </div>
    </div>
  );
}

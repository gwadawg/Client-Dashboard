"use client";

import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { FRESH_LAUNCH_DAYS, FOCUS_STYLES, type ClientFocus, type HealthTier } from "@/lib/client-health";

type OpsCounts = {
  active: number;
  onboarding: number;
  fresh_launched: number;
  act_now: number;
  monitor: number;
  on_track: number;
  recovering: number;
  offboarding_or_paused: number;
  cs_upcoming?: number;
  cs_unmapped?: number;
};

type OnboardingRow = {
  client_id: string;
  client_name: string;
  lifecycle_status: string | null;
  days_in_onboarding: number | null;
  kickoff_incomplete: boolean;
  next_gate: string;
};

type FreshRow = {
  client_id: string;
  client_name: string;
  launch_date: string | null;
  days_since_launch: number;
  reporting_type: string;
  leading_label: string;
  worst_tier: HealthTier | null;
};

type UnderRow = {
  client_id: string;
  client_name: string;
  focus: ClientFocus;
  focus_label: string;
  north_star_tier: HealthTier;
  north_star_label: string;
  constraint: string;
  constraint_label: string;
  owner_hint: string;
  days_live: number | null;
  reporting_type: string;
};

type LeaderRow = {
  agent_name: string;
  today_dials: number;
  today_bookings: number;
  week_dials: number;
  week_bookings: number;
};

type CsUpcomingRow = {
  id: string;
  clickup_task_id: string;
  client_id: string | null;
  client_name: string | null;
  call_type: "onboarding" | "launch" | "checkin" | null;
  scheduled_at: string;
  calendar_name: string | null;
};

type OpsPayload = {
  generated_at: string;
  today: string;
  health_period: { start: string; end: string };
  week_period: { start: string; end: string };
  counts: OpsCounts;
  onboarding: OnboardingRow[];
  fresh_launched: FreshRow[];
  underperforming: UnderRow[];
  cs_upcoming?: CsUpcomingRow[];
  floor: {
    team_today: { dials: number; bookings: number };
    team_week: { dials: number; bookings: number };
    leaderboard: LeaderRow[];
  };
  definitions: Record<string, string>;
  error?: string;
};

const PANEL: CSSProperties = {
  background: "#0a1628",
  border: "1px solid rgba(255,255,255,0.06)",
};

const TIER_PILL: Record<HealthTier, { bg: string; text: string; border: string }> = {
  critical: { bg: "rgba(239,68,68,0.18)", text: "#f87171", border: "rgba(239,68,68,0.4)" },
  below: { bg: "rgba(245,158,11,0.15)", text: "#fbbf24", border: "rgba(245,158,11,0.35)" },
  at: { bg: "rgba(52,211,153,0.12)", text: "#34d399", border: "rgba(52,211,153,0.3)" },
  above: { bg: "rgba(59,130,246,0.15)", text: "#60a5fa", border: "rgba(59,130,246,0.35)" },
  insufficient: { bg: "rgba(100,116,139,0.12)", text: "#64748b", border: "rgba(100,116,139,0.25)" },
};

function CountCard({
  label,
  value,
  hint,
  accent,
  title,
}: {
  label: string;
  value: number;
  hint?: string;
  accent: string;
  title?: string;
}) {
  return (
    <div
      className="rounded-xl px-4 py-3.5 min-w-0"
      style={PANEL}
      title={title}
    >
      <p className="text-[11px] font-medium uppercase tracking-wide truncate" style={{ color: "#64748b" }}>
        {label}
      </p>
      <p className="text-2xl font-semibold mt-1 tabular-nums" style={{ color: accent }}>
        {value.toLocaleString()}
      </p>
      {hint ? (
        <p className="text-[11px] mt-1 truncate" style={{ color: "#475569" }}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function EmptyLine({ text }: { text: string }) {
  return (
    <p className="text-sm py-6 text-center" style={{ color: "#475569" }}>
      {text}
    </p>
  );
}

function csTypeLabel(type: CsUpcomingRow["call_type"]): string {
  if (type === "onboarding") return "Onboarding";
  if (type === "launch") return "Launch";
  if (type === "checkin") return "Check-in";
  return "CS Call";
}

function formatCsWhen(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function SectionHead({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 mb-3">
      <div className="min-w-0">
        <h3 className="text-sm font-semibold" style={{ color: "#e2e8f0" }}>
          {title}
        </h3>
        {subtitle ? (
          <p className="text-xs mt-0.5" style={{ color: "#64748b" }}>
            {subtitle}
          </p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

export default function OpsOverview() {
  const router = useRouter();
  const [data, setData] = useState<OpsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ops-overview");
      const json = (await res.json()) as OpsPayload;
      if (!res.ok) {
        setError(json.error ?? "Failed to load ops overview");
        setData(null);
      } else {
        setData(json);
      }
    } catch {
      setError("Failed to load ops overview");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 10 * 60 * 1000);
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  const goClientSuccess = () => router.push("/dashboard?view=client_health");
  const goAgents = () => router.push("/dashboard?view=agents&tab=performance");

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-24" style={{ color: "#334155" }}>
        <svg className="w-5 h-5 animate-spin mr-2" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <span className="text-sm font-medium">Loading ops overview…</span>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="rounded-xl px-5 py-8 text-center max-w-md mx-auto" style={PANEL}>
        <p className="text-sm font-medium" style={{ color: "#f87171" }}>
          {error}
        </p>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-4 text-xs font-semibold px-3 py-2 rounded-lg"
          style={{ color: "#38bdf8", background: "rgba(56,189,248,0.1)", border: "1px solid rgba(56,189,248,0.25)" }}
        >
          Retry
        </button>
      </div>
    );
  }

  if (!data) return null;

  const { counts, floor } = data;

  return (
    <div className="space-y-6 max-w-[1400px]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold" style={{ color: "#e2e8f0" }}>
            Ops Overview
          </h2>
          <p className="text-sm mt-1 max-w-2xl" style={{ color: "#64748b" }}>
            Portfolio pulse for Laura &amp; Christian — onboarding, fresh launches, Act Now accounts, and floor dials/bookings.
            Health baseline {data.health_period.start} → {data.health_period.end}.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="text-xs font-semibold px-3 py-2 rounded-lg shrink-0"
          style={{ color: "#94a3b8", background: "#0a1628", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          Refresh
        </button>
      </div>

      {/* Count strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <CountCard
          label="Active clients"
          value={counts.active}
          accent="#e2e8f0"
          title={data.definitions.active}
        />
        <CountCard
          label="Onboarding"
          value={counts.onboarding}
          accent="#38bdf8"
          title={data.definitions.onboarding}
        />
        <CountCard
          label={`Fresh (≤${FRESH_LAUNCH_DAYS}d)`}
          value={counts.fresh_launched}
          accent="#a78bfa"
          title={data.definitions.fresh_launched}
        />
        <CountCard
          label="Act now"
          value={counts.act_now}
          accent="#f87171"
          hint={`${counts.monitor} monitor`}
          title={data.definitions.underperforming}
        />
        <CountCard
          label="On track"
          value={counts.on_track}
          accent="#34d399"
          hint={counts.offboarding_or_paused > 0 ? `${counts.offboarding_or_paused} paused/OB` : undefined}
        />
      </div>

      {/* Upcoming CS calls */}
      <div className="rounded-xl p-4" style={PANEL}>
        <SectionHead
          title="Upcoming CS calls"
          subtitle={
            counts.cs_unmapped
              ? `Next 14 days · ${counts.cs_unmapped} unmapped ClickUp ID${counts.cs_unmapped === 1 ? "" : "s"}`
              : "Next 14 days · onboarding, launch, check-in"
          }
        />
        {(data.cs_upcoming ?? []).length === 0 ? (
          <EmptyLine text="No CS calls scheduled in the next 14 days" />
        ) : (
          <ul className="divide-y" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
            {(data.cs_upcoming ?? []).map(row => (
              <li key={row.id} className="py-2.5 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: "#e2e8f0" }}>
                    {row.client_name ?? (
                      <span style={{ color: "#fbbf24" }}>
                        Unmapped · {row.clickup_task_id}
                      </span>
                    )}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: "#64748b" }}>
                    {csTypeLabel(row.call_type)}
                  </p>
                </div>
                <span className="text-xs tabular-nums shrink-0 text-right" style={{ color: "#94a3b8" }}>
                  {formatCsWhen(row.scheduled_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Onboarding + Fresh */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl p-4" style={PANEL}>
          <SectionHead
            title="Onboarding now"
            subtitle="new_account + onboarding"
          />
          {data.onboarding.length === 0 ? (
            <EmptyLine text="No clients in onboarding" />
          ) : (
            <ul className="divide-y" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
              {data.onboarding.map(row => (
                <li key={row.client_id} className="py-2.5 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: "#e2e8f0" }}>
                      {row.client_name}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: "#64748b" }}>
                      {row.next_gate}
                      {row.kickoff_incomplete ? (
                        <span style={{ color: "#fbbf24" }}> · Kickoff stuck</span>
                      ) : null}
                    </p>
                  </div>
                  <span className="text-xs tabular-nums shrink-0" style={{ color: "#94a3b8" }}>
                    {row.days_in_onboarding != null ? `${row.days_in_onboarding}d` : "—"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl p-4" style={PANEL}>
          <SectionHead
            title="Freshly launched"
            subtitle={`First ${FRESH_LAUNCH_DAYS} days — leading KPIs only`}
          />
          {data.fresh_launched.length === 0 ? (
            <EmptyLine text="No fresh launches" />
          ) : (
            <ul className="divide-y" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
              {data.fresh_launched.map(row => {
                const tier = row.worst_tier;
                const pill = tier ? TIER_PILL[tier] : null;
                return (
                  <li key={row.client_id} className="py-2.5 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: "#e2e8f0" }}>
                        {row.client_name}
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: "#64748b" }}>
                        {row.leading_label}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className="text-xs tabular-nums" style={{ color: "#94a3b8" }}>
                        Day {row.days_since_launch + 1}
                      </span>
                      {pill ? (
                        <span
                          className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                          style={{ background: pill.bg, color: pill.text, border: `1px solid ${pill.border}` }}
                        >
                          {tier}
                        </span>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* Underperforming */}
      <div className="rounded-xl p-4 overflow-x-auto" style={PANEL}>
        <SectionHead
          title="Underperforming (Act Now)"
          subtitle="Excludes fresh launches · constraint routes the ticket"
          action={
            <button
              type="button"
              onClick={goClientSuccess}
              className="text-xs font-semibold whitespace-nowrap"
              style={{ color: "#38bdf8" }}
            >
              Client Success →
            </button>
          }
        />
        {data.underperforming.length === 0 ? (
          <EmptyLine text="No Act Now accounts — portfolio is clear" />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ color: "#64748b" }}>
                <th className="text-left font-medium py-2 pr-3">Client</th>
                <th className="text-left font-medium py-2 pr-3">Focus</th>
                <th className="text-left font-medium py-2 pr-3">North star</th>
                <th className="text-left font-medium py-2 pr-3">Constraint</th>
                <th className="text-left font-medium py-2 pr-3">Owner</th>
                <th className="text-right font-medium py-2">Days live</th>
              </tr>
            </thead>
            <tbody>
              {data.underperforming.map(row => {
                const focusStyle = FOCUS_STYLES[row.focus];
                const tierStyle = TIER_PILL[row.north_star_tier];
                return (
                  <tr
                    key={row.client_id}
                    className="border-t"
                    style={{ borderColor: "rgba(255,255,255,0.04)" }}
                  >
                    <td className="py-2.5 pr-3">
                      <button
                        type="button"
                        onClick={goClientSuccess}
                        className="font-medium text-left hover:underline"
                        style={{ color: "#e2e8f0" }}
                      >
                        {row.client_name}
                      </button>
                    </td>
                    <td className="py-2.5 pr-3">
                      <span
                        className="text-[11px] font-semibold px-2 py-0.5 rounded-md"
                        style={{
                          background: focusStyle.bg,
                          color: focusStyle.text,
                          border: `1px solid ${focusStyle.border}`,
                        }}
                      >
                        {row.focus_label}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3">
                      <span
                        className="text-[11px] font-semibold px-2 py-0.5 rounded-md"
                        style={{
                          background: tierStyle.bg,
                          color: tierStyle.text,
                          border: `1px solid ${tierStyle.border}`,
                        }}
                      >
                        {row.north_star_label}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 max-w-[220px]">
                      <span className="text-xs" style={{ color: "#94a3b8" }} title={row.constraint_label}>
                        {row.constraint_label}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3">
                      <span className="text-xs font-medium" style={{ color: "#cbd5e1" }}>
                        {row.owner_hint}
                      </span>
                    </td>
                    <td className="py-2.5 text-right tabular-nums" style={{ color: "#94a3b8" }}>
                      {row.days_live != null ? row.days_live : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Floor pulse + leaderboard */}
      <div className="rounded-xl p-4" style={PANEL}>
        <SectionHead
          title="Floor pulse"
          subtitle={`Today + last 7 days (${data.week_period.start} → ${data.week_period.end}) · call reps only`}
          action={
            <button
              type="button"
              onClick={goAgents}
              className="text-xs font-semibold whitespace-nowrap"
              style={{ color: "#38bdf8" }}
            >
              Call Center Hub →
            </button>
          }
        />

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <div className="rounded-lg px-3 py-2.5" style={{ background: "#050c18" }}>
            <p className="text-[10px] uppercase tracking-wide" style={{ color: "#64748b" }}>
              Team dials today
            </p>
            <p className="text-xl font-semibold tabular-nums mt-0.5" style={{ color: "#e2e8f0" }}>
              {floor.team_today.dials.toLocaleString()}
            </p>
          </div>
          <div className="rounded-lg px-3 py-2.5" style={{ background: "#050c18" }}>
            <p className="text-[10px] uppercase tracking-wide" style={{ color: "#64748b" }}>
              Team bookings today
            </p>
            <p className="text-xl font-semibold tabular-nums mt-0.5" style={{ color: "#34d399" }}>
              {floor.team_today.bookings.toLocaleString()}
            </p>
          </div>
          <div className="rounded-lg px-3 py-2.5" style={{ background: "#050c18" }}>
            <p className="text-[10px] uppercase tracking-wide" style={{ color: "#64748b" }}>
              Team dials (7d)
            </p>
            <p className="text-xl font-semibold tabular-nums mt-0.5" style={{ color: "#94a3b8" }}>
              {floor.team_week.dials.toLocaleString()}
            </p>
          </div>
          <div className="rounded-lg px-3 py-2.5" style={{ background: "#050c18" }}>
            <p className="text-[10px] uppercase tracking-wide" style={{ color: "#64748b" }}>
              Team bookings (7d)
            </p>
            <p className="text-xl font-semibold tabular-nums mt-0.5" style={{ color: "#94a3b8" }}>
              {floor.team_week.bookings.toLocaleString()}
            </p>
          </div>
        </div>

        {floor.leaderboard.length === 0 ? (
          <EmptyLine text="No call-rep activity in this window" />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ color: "#64748b" }}>
                <th className="text-left font-medium py-2 pr-3">#</th>
                <th className="text-left font-medium py-2 pr-3">Rep</th>
                <th className="text-right font-medium py-2 pr-3">Dials today</th>
                <th className="text-right font-medium py-2 pr-3">Bookings today</th>
                <th className="text-right font-medium py-2 pr-3">Dials 7d</th>
                <th className="text-right font-medium py-2">Bookings 7d</th>
              </tr>
            </thead>
            <tbody>
              {floor.leaderboard.map((row, i) => (
                <tr
                  key={row.agent_name}
                  className="border-t"
                  style={{ borderColor: "rgba(255,255,255,0.04)" }}
                >
                  <td className="py-2 pr-3 tabular-nums" style={{ color: "#475569" }}>
                    {i + 1}
                  </td>
                  <td className="py-2 pr-3 font-medium" style={{ color: "#e2e8f0" }}>
                    {row.agent_name}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums" style={{ color: "#cbd5e1" }}>
                    {row.today_dials}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums font-semibold" style={{ color: "#34d399" }}>
                    {row.today_bookings}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums" style={{ color: "#94a3b8" }}>
                    {row.week_dials}
                  </td>
                  <td className="py-2 text-right tabular-nums" style={{ color: "#94a3b8" }}>
                    {row.week_bookings}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className="text-[11px]" style={{ color: "#334155" }}>
        Updated {new Date(data.generated_at).toLocaleString()} · Underperformers match Client Success Act Now ·
        Leaderboard matches Call Center Hub dials/bookings for call reps
      </p>
    </div>
  );
}

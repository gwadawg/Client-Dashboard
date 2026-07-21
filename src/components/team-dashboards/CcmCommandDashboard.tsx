"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { CcmCommandPayload } from "@/lib/team-dashboards/ccm";
import type { TeamMeetingInstanceView } from "@/lib/team-meetings";
import { CALL_CENTER_TIMEZONE, todayYmdInCallCenterTz } from "@/lib/team-meetings";

const POLL_MS = 90_000;

const STATUS_COLOR = {
  on_track: "#34d399",
  behind: "#fbbf24",
  critical: "#f87171",
  unknown: "#64748b",
} as const;

const TIER_COLOR: Record<string, string> = {
  critical: "#f87171",
  below: "#fbbf24",
  at: "#60a5fa",
  above: "#34d399",
  insufficient: "#64748b",
};

function statusLabel(s: keyof typeof STATUS_COLOR): string {
  if (s === "on_track") return "On track";
  if (s === "behind") return "Behind";
  if (s === "critical") return "Critical";
  return "—";
}

function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded ${className}`}
      style={{ background: "rgba(148,163,184,0.12)" }}
    />
  );
}

type Props = {
  onNavigate?: (view: string, tab?: string) => void;
};

export default function CcmCommandDashboard({ onNavigate }: Props) {
  const router = useRouter();
  const [data, setData] = useState<CcmCommandPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/team-dashboards/ccm");
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Failed to load CCM Command");
        return;
      }
      setData(json);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  function go(view: string, tab?: string) {
    if (onNavigate) {
      onNavigate(view, tab);
      return;
    }
    const params = new URLSearchParams();
    params.set("view", view);
    if (tab) params.set("tab", tab);
    router.push(`/dashboard?${params.toString()}`);
  }

  if (loading && !data) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-28 w-full" />
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div
        className="rounded-lg border px-5 py-8 text-sm"
        style={{ borderColor: "rgba(248,113,113,0.35)", color: "#fca5a5", background: "rgba(127,29,29,0.2)" }}
      >
        {error}
      </div>
    );
  }

  if (!data) return null;

  const { floor, agents, underKpiClients, dayContext } = data;
  const floorColor = STATUS_COLOR[floor.status];

  return (
    <div className="ccm-command space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p
            className="text-[11px] font-semibold uppercase tracking-[0.2em]"
            style={{ color: "#64748b" }}
          >
            Team Dashboards
          </p>
          <h1
            className="text-2xl font-semibold tracking-tight mt-1"
            style={{ color: "#f1f5f9", fontFamily: "ui-sans-serif, system-ui, sans-serif" }}
          >
            CCM Command
          </h1>
          <p className="text-sm mt-1" style={{ color: "#64748b" }}>
            Floor pace · under-KPI dial focus · Daily OS reminder
          </p>
        </div>
        <div className="text-right text-xs" style={{ color: "#475569" }}>
          <div>{data.today}</div>
          <div>Updated {new Date(data.generated_at).toLocaleTimeString()}</div>
        </div>
      </header>

      {dayContext.is_reds_day && (
        <div
          className="rounded-md border px-4 py-3 text-sm"
          style={{
            borderColor: "rgba(251,191,36,0.35)",
            background: "linear-gradient(90deg, rgba(251,191,36,0.12), transparent)",
            color: "#fde68a",
          }}
        >
          <strong style={{ color: "#fbbf24" }}>Reds day (Mon/Thu).</strong>{" "}
          Bring Booking % / Show % / dial reds and name one commitment per red for Laura.
        </div>
      )}

      <TodayTeamMeetingsStrip onOpen={() => go("team_meetings")} />

      {/* Band 1 — Situation */}
      <section
        className="rounded-xl border p-5"
        style={{
          borderColor: "rgba(148,163,184,0.15)",
          background:
            "linear-gradient(145deg, rgba(15,23,42,0.95) 0%, rgba(30,41,59,0.6) 100%)",
        }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: "#94a3b8" }}>
            Floor situation
          </h2>
          <span
            className="text-[11px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded"
            style={{
              color: floorColor,
              background: `${floorColor}22`,
              border: `1px solid ${floorColor}44`,
            }}
          >
            {statusLabel(floor.status)}
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-4">
          <Stat
            label="Today dials"
            value={
              floor.dial_goal_today != null
                ? `${floor.today.dials} / ${floor.dial_goal_today}`
                : String(floor.today.dials)
            }
            sub={
              floor.dial_pace_pct != null
                ? `${floor.dial_pace_pct}% of goal`
                : "No dial goals set"
            }
            accent={floorColor}
          />
          <Stat label="Today bookings" value={String(floor.today.bookings)} />
          <Stat label="Today conversations" value={String(floor.today.conversations)} />
          <Stat label="Week dials" value={String(floor.week.dials)} />
          <Stat label="Week bookings" value={String(floor.week.bookings)} />
          <Stat
            label="Week show rate"
            value={floor.week.show_rate != null ? `${floor.week.show_rate}%` : "—"}
            sub={`${floor.week.shows} shows · ${floor.week.no_shows} no-shows`}
          />
        </div>

        {data.errors.floor && (
          <p className="text-xs mt-3" style={{ color: "#f87171" }}>
            Floor feed: {data.errors.floor}
          </p>
        )}
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_300px] gap-6 items-start">
        <div className="space-y-6 min-w-0">
          {/* Band 2a — Team */}
          <section
            className="rounded-xl border p-5"
            style={{
              borderColor: "rgba(148,163,184,0.15)",
              background: "rgba(15,23,42,0.55)",
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: "#94a3b8" }}>
                Team at a glance
              </h2>
              <button
                type="button"
                onClick={() => go("agents", "performance")}
                className="text-xs hover:underline"
                style={{ color: "#64748b" }}
              >
                Call Center Hub →
              </button>
            </div>

            {agents.length === 0 ? (
              <p className="text-sm py-6" style={{ color: "#64748b" }}>
                No call-rep activity this week yet.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {agents.map(agent => {
                  const color = STATUS_COLOR[agent.pace_status];
                  const elapsed = dayContext.day_elapsed_pct ?? 0;
                  const goalPct =
                    agent.dial_goal && agent.dial_goal > 0
                      ? Math.min(100, (agent.today_dials / agent.dial_goal) * 100)
                      : 0;
                  return (
                    <button
                      key={agent.agent_name}
                      type="button"
                      onClick={() => go("agents", "performance")}
                      className="text-left rounded-lg border p-4 transition-colors hover:border-slate-500"
                      style={{
                        borderColor: "rgba(148,163,184,0.18)",
                        background: "rgba(2,6,23,0.45)",
                      }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-medium text-sm" style={{ color: "#e2e8f0" }}>
                            {agent.agent_name}
                          </div>
                          <div className="text-[11px] mt-0.5" style={{ color: "#64748b" }}>
                            Live status — pending
                          </div>
                        </div>
                        <span
                          className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded"
                          style={{ color, background: `${color}18` }}
                        >
                          {statusLabel(agent.pace_status)}
                        </span>
                      </div>

                      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                        <Mini
                          label="Dials"
                          value={
                            agent.dial_goal != null
                              ? `${agent.today_dials}/${agent.dial_goal}`
                              : String(agent.today_dials)
                          }
                        />
                        <Mini label="Booked" value={String(agent.today_bookings)} />
                        <Mini
                          label="Wk show"
                          value={
                            agent.week_show_rate != null
                              ? `${agent.week_show_rate}%`
                              : "—"
                          }
                        />
                      </div>

                      {agent.dial_goal != null && (
                        <div className="mt-3">
                          <div className="flex justify-between text-[10px] mb-1" style={{ color: "#64748b" }}>
                            <span>Dial pace</span>
                            <span>
                              {Math.round(goalPct)}% · day {Math.round(elapsed * 100)}%
                            </span>
                          </div>
                          <div
                            className="h-1.5 rounded-full overflow-hidden relative"
                            style={{ background: "rgba(51,65,85,0.8)" }}
                          >
                            <div
                              className="absolute inset-y-0 left-0 rounded-full"
                              style={{
                                width: `${Math.min(100, goalPct)}%`,
                                background: color,
                              }}
                            />
                            <div
                              className="absolute top-0 bottom-0 w-px"
                              style={{
                                left: `${Math.min(100, elapsed * 100)}%`,
                                background: "rgba(226,232,240,0.55)",
                              }}
                            />
                          </div>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
            {data.errors.agents && (
              <p className="text-xs mt-3" style={{ color: "#f87171" }}>
                Agents feed: {data.errors.agents}
              </p>
            )}
          </section>

          {/* Band 2b — Under-KPI */}
          <section
            className="rounded-xl border p-5"
            style={{
              borderColor: "rgba(148,163,184,0.15)",
              background: "rgba(15,23,42,0.55)",
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: "#94a3b8" }}>
                Under-KPI clients
                <span className="ml-2 normal-case tracking-normal font-normal" style={{ color: "#475569" }}>
                  CCM lens · Booking / Show / Hand-raise
                </span>
              </h2>
              <button
                type="button"
                onClick={() => go("client_health")}
                className="text-xs hover:underline"
                style={{ color: "#64748b" }}
              >
                Client Success →
              </button>
            </div>

            {underKpiClients.length === 0 ? (
              <p className="text-sm py-6" style={{ color: "#34d399" }}>
                No under-KPI accounts — keep schedule tight.
              </p>
            ) : (
              <ul className="divide-y" style={{ borderColor: "rgba(51,65,85,0.6)" }}>
                {underKpiClients.map(c => {
                  const color = TIER_COLOR[c.ccm_tier] ?? TIER_COLOR.insufficient;
                  return (
                    <li key={c.client_id}>
                      <button
                        type="button"
                        onClick={() => go("client_health")}
                        className="w-full text-left py-3 flex flex-wrap items-center justify-between gap-2 hover:bg-white/[0.02] transition-colors"
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate" style={{ color: "#e2e8f0" }}>
                            {c.client_name}
                          </div>
                          <div className="text-xs mt-0.5" style={{ color: "#64748b" }}>
                            {c.constraint_label}
                            {c.red_kpis.length > 0 ? ` · ${c.red_kpis.join(", ")}` : ""}
                          </div>
                        </div>
                        <span
                          className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded shrink-0"
                          style={{ color, background: `${color}18` }}
                        >
                          {c.ccm_tier_label}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {data.errors.underKpi && (
              <p className="text-xs mt-3" style={{ color: "#f87171" }}>
                Health feed: {data.errors.underKpi}
              </p>
            )}
          </section>
        </div>

        {/* Band 3 — Day Playbook */}
        <aside
          className="rounded-xl border p-5 xl:sticky xl:top-4"
          style={{
            borderColor: "rgba(148,163,184,0.18)",
            background:
              "linear-gradient(180deg, rgba(30,41,59,0.85) 0%, rgba(15,23,42,0.95) 100%)",
          }}
        >
          <h2 className="text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: "#94a3b8" }}>
            Day playbook
          </h2>
          <p className="text-[11px] mt-1 mb-4" style={{ color: "#475569" }}>
            Read-only reminder — not a checklist
          </p>

          <ol className="space-y-2 mb-6">
            {dayContext.blocks.map(block => {
              const active = block.id === dayContext.active_block_id;
              return (
                <li
                  key={block.id}
                  className="rounded-md px-3 py-2 border"
                  style={{
                    borderColor: active ? "rgba(52,211,153,0.45)" : "rgba(51,65,85,0.5)",
                    background: active ? "rgba(52,211,153,0.08)" : "transparent",
                  }}
                >
                  <div
                    className="text-xs font-semibold"
                    style={{ color: active ? "#6ee7b7" : "#cbd5e1" }}
                  >
                    {block.label}
                    {active && (
                      <span className="ml-2 text-[10px] font-normal uppercase tracking-wider" style={{ color: "#34d399" }}>
                        Now
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] mt-0.5 leading-snug" style={{ color: "#64748b" }}>
                    {block.detail}
                  </div>
                </li>
              );
            })}
          </ol>

          <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] mb-2" style={{ color: "#64748b" }}>
            Priority stack
          </h3>
          <ol className="space-y-1.5 mb-6">
            {dayContext.priorities.map((p, i) => (
              <li key={i} className="flex gap-2 text-[11px] leading-snug" style={{ color: "#94a3b8" }}>
                <span className="shrink-0 font-mono" style={{ color: "#475569" }}>
                  {i + 1}.
                </span>
                <span>{p}</span>
              </li>
            ))}
          </ol>

          <div className="pt-3 border-t space-y-2" style={{ borderColor: "rgba(51,65,85,0.7)" }}>
            <DeepLink label="Weekly Focus" onClick={() => go("agents", "weekly_focus")} />
            <DeepLink label="Credit Queue" onClick={() => go("agents", "credit_queue")} />
            <a
              href="/forms/eod/ccm"
              className="block text-xs hover:underline"
              style={{ color: "#60a5fa" }}
            >
              CCM EOD form →
            </a>
            <p className="text-[10px] pt-2" style={{ color: "#334155" }}>
              Stack bugs / Commitments — coming
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Stat({
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
    <div>
      <div className="text-[10px] uppercase tracking-wider" style={{ color: "#64748b" }}>
        {label}
      </div>
      <div
        className="text-xl font-semibold tabular-nums mt-1"
        style={{ color: accent ?? "#f1f5f9" }}
      >
        {value}
      </div>
      {sub && (
        <div className="text-[11px] mt-0.5" style={{ color: "#475569" }}>
          {sub}
        </div>
      )}
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase" style={{ color: "#475569" }}>
        {label}
      </div>
      <div className="text-sm font-semibold tabular-nums" style={{ color: "#e2e8f0" }}>
        {value}
      </div>
    </div>
  );
}

function DeepLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="block text-xs hover:underline"
      style={{ color: "#60a5fa" }}
    >
      {label} →
    </button>
  );
}

function TodayTeamMeetingsStrip({ onOpen }: { onOpen: () => void }) {
  const [rows, setRows] = useState<TeamMeetingInstanceView[]>([]);

  useEffect(() => {
    const today = todayYmdInCallCenterTz();
    fetch(`/api/team-meetings?from=${today}&to=${today}`)
      .then(r => r.json())
      .then(d => setRows(d.rows ?? []))
      .catch(() => setRows([]));
  }, []);

  if (!rows.length) return null;

  return (
    <section
      className="rounded-xl border px-4 py-3"
      style={{
        borderColor: "rgba(148,163,184,0.15)",
        background: "rgba(15,23,42,0.7)",
      }}
    >
      <div className="flex items-center justify-between gap-3 mb-2">
        <h2 className="text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: "#94a3b8" }}>
          Today&apos;s meetings
        </h2>
        <DeepLink label="Open Team Meetings" onClick={onOpen} />
      </div>
      <ul className="space-y-1.5">
        {rows.slice(0, 5).map(row => (
          <li key={row.id} className="flex items-center justify-between gap-2 text-sm">
            <span style={{ color: "#e2e8f0" }}>{row.template.title}</span>
            <span className="text-xs tabular-nums shrink-0" style={{ color: "#64748b" }}>
              {new Date(row.scheduled_at).toLocaleTimeString("en-US", {
                timeZone: CALL_CENTER_TIMEZONE,
                hour: "numeric",
                minute: "2-digit",
              })}{" "}
              · {row.status.replace("_", " ")}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

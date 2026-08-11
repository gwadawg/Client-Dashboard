"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { CsCommandPayload } from "@/lib/team-dashboards/cs";
import { cachedJsonFetch, peekCachedJson } from "@/lib/client-fetch-cache";
import type { TeamMeetingInstanceView } from "@/lib/team-meetings";
import { CALL_CENTER_TIMEZONE, todayYmdInCallCenterTz } from "@/lib/team-meetings";

const POLL_MS = 90_000;
const CACHE_KEY = "team-command-cs";
const STALE_MS = 45_000;

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
  embedded?: boolean;
};

export default function CsCommandDashboard({ onNavigate, embedded = false }: Props) {
  const router = useRouter();
  const [data, setData] = useState<CsCommandPayload | null>(
    () => peekCachedJson<CsCommandPayload>(CACHE_KEY) ?? null,
  );
  const [loading, setLoading] = useState(!data);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const json = await cachedJsonFetch<CsCommandPayload & { error?: string }>(
        CACHE_KEY,
        "/api/team-dashboards/cs",
        { staleTime: STALE_MS, preferCache: false },
      );
      if (json.error) {
        setError(json.error);
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
    void load();
    const id = setInterval(() => void load(), POLL_MS);
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
        <Skeleton className="h-24 w-full" />
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
        style={{
          borderColor: "rgba(248,113,113,0.35)",
          color: "#fca5a5",
          background: "rgba(127,29,29,0.2)",
        }}
      >
        {error}
      </div>
    );
  }

  if (!data) return null;

  const { counts, followups, calls_today, dayContext, eod } = data;
  const overdueColor = counts.overdue_followups > 0 ? "#f87171" : "#34d399";
  const todayColor = counts.today_followups > 0 ? "#fbbf24" : "#94a3b8";
  const eodColor = eod.submitted ? "#34d399" : "#fbbf24";

  return (
    <div className="cs-command space-y-6">
      {!embedded ? (
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
              style={{ color: "#f1f5f9" }}
            >
              Client Success
            </h1>
            <p className="text-sm mt-1" style={{ color: "#64748b" }}>
              Follow-ups · live calls · day priorities · EOD
            </p>
          </div>
          <div className="text-right text-xs" style={{ color: "#475569" }}>
            <div>{data.today}</div>
            <div>Updated {new Date(data.generated_at).toLocaleTimeString()}</div>
          </div>
        </header>
      ) : (
        <div className="flex justify-end text-xs" style={{ color: "#475569" }}>
          <div className="text-right">
            <div>{data.today}</div>
            <div>Updated {new Date(data.generated_at).toLocaleTimeString()}</div>
          </div>
        </div>
      )}

      {dayContext.is_reds_day && (
        <div
          className="rounded-md border px-4 py-3 text-sm"
          style={{
            borderColor: "rgba(251,191,36,0.35)",
            background: "linear-gradient(90deg, rgba(251,191,36,0.12), transparent)",
            color: "#fde68a",
          }}
        >
          <strong style={{ color: "#fbbf24" }}>KPI day (Mon/Thu).</strong>{" "}
          Bring the health rollup. Leave with a named commitment + due date from Christian
          and/or Pedro on every red.
        </div>
      )}

      <TodayCsMeetingsStrip onOpen={() => go("team_meetings")} />

      {/* Count strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <CountCard
          label="Overdue follow-ups"
          value={counts.overdue_followups}
          accent={overdueColor}
          hint="Due before today"
        />
        <CountCard
          label="Due today"
          value={counts.today_followups}
          accent={todayColor}
          hint="Open + snoozed"
        />
        <CountCard
          label="Calls today"
          value={counts.calls_today}
          accent="#60a5fa"
          hint="Scheduled next 24h"
        />
        <CountCard
          label="EOD form"
          value={eod.submitted ? "Done" : "Open"}
          accent={eodColor}
          hint={eod.submitted ? "Submitted today" : "Still needs submit"}
          isText
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-6 items-start">
        <div className="space-y-6 min-w-0">
          {/* Follow-ups due */}
          <section
            className="rounded-xl border p-5"
            style={{
              borderColor: "rgba(148,163,184,0.15)",
              background: "rgba(10,22,40,0.9)",
            }}
          >
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h2
                  className="text-sm font-semibold"
                  style={{ color: "#e2e8f0" }}
                >
                  Follow-ups due
                </h2>
                <p className="text-xs mt-0.5" style={{ color: "#64748b" }}>
                  Overdue first, then today — complete from Follow-ups or Client File
                </p>
              </div>
              <button
                type="button"
                onClick={() => go("client_health", "followups")}
                className="text-xs font-semibold shrink-0 hover:underline"
                style={{ color: "#60a5fa" }}
              >
                Full queue →
              </button>
            </div>

            {followups.length === 0 ? (
              <p className="text-sm py-6 text-center" style={{ color: "#475569" }}>
                No open follow-ups due today. Nice clean plate.
              </p>
            ) : (
              <ul className="divide-y" style={{ borderColor: "rgba(51,65,85,0.5)" }}>
                {followups.map(row => (
                  <li
                    key={row.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0"
                    style={{ borderColor: "rgba(51,65,85,0.45)" }}
                  >
                    <div className="min-w-0">
                      <button
                        type="button"
                        onClick={() => go("client_health", "followups")}
                        className="text-sm font-medium text-left hover:underline truncate max-w-full"
                        style={{ color: "#f1f5f9" }}
                      >
                        {row.client_name}
                      </button>
                      <p className="text-xs mt-0.5" style={{ color: "#64748b" }}>
                        {row.touchpoint_label}
                        {row.status === "snoozed" ? " · snoozed" : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className="text-[11px] font-semibold px-2 py-0.5 rounded"
                        style={{
                          color: row.is_overdue ? "#f87171" : "#fbbf24",
                          background: row.is_overdue
                            ? "rgba(239,68,68,0.15)"
                            : "rgba(245,158,11,0.12)",
                        }}
                      >
                        {row.is_overdue ? "Overdue" : "Today"}
                      </span>
                      <span
                        className="text-xs tabular-nums"
                        style={{ color: "#64748b" }}
                      >
                        {formatDue(row.due_at)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Calls today */}
          <section
            className="rounded-xl border p-5"
            style={{
              borderColor: "rgba(148,163,184,0.15)",
              background: "rgba(10,22,40,0.9)",
            }}
          >
            <h2 className="text-sm font-semibold mb-1" style={{ color: "#e2e8f0" }}>
              Calls today
            </h2>
            <p className="text-xs mb-4" style={{ color: "#64748b" }}>
              Upcoming CS appointments (next 24 hours)
            </p>
            {calls_today.length === 0 ? (
              <p className="text-sm py-4 text-center" style={{ color: "#475569" }}>
                No remaining scheduled CS calls in the next day.
              </p>
            ) : (
              <ul className="space-y-2">
                {calls_today.map(row => (
                  <li
                    key={row.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2.5"
                    style={{
                      background: "rgba(15,23,42,0.7)",
                      border: "1px solid rgba(51,65,85,0.4)",
                    }}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: "#e2e8f0" }}>
                        {row.client_name ?? row.title ?? "Unmapped calendar"}
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: "#64748b" }}>
                        {row.call_type_label}
                        {row.calendar_name ? ` · ${row.calendar_name}` : ""}
                      </p>
                    </div>
                    <span className="text-xs tabular-nums shrink-0" style={{ color: "#94a3b8" }}>
                      {formatWhen(row.scheduled_at)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* EOD CTA */}
          <section
            className="rounded-xl border px-5 py-4 flex flex-wrap items-center justify-between gap-3"
            style={{
              borderColor: eod.submitted
                ? "rgba(52,211,153,0.3)"
                : "rgba(251,191,36,0.35)",
              background: eod.submitted
                ? "rgba(52,211,153,0.06)"
                : "rgba(251,191,36,0.06)",
            }}
          >
            <div>
              <h2 className="text-sm font-semibold" style={{ color: "#e2e8f0" }}>
                {eod.label}
              </h2>
              <p className="text-xs mt-0.5" style={{ color: "#64748b" }}>
                {eod.submitted
                  ? "Submitted for today — update if anything material changes."
                  : "End of day: rollup · tomorrow’s calls · no open ownership gaps."}
              </p>
            </div>
            <a
              href={eod.href}
              className="text-xs font-semibold px-3 py-2 rounded-lg shrink-0"
              style={{
                color: eod.submitted ? "#6ee7b7" : "#0f172a",
                background: eod.submitted
                  ? "rgba(52,211,153,0.15)"
                  : "#fbbf24",
              }}
            >
              {eod.submitted ? "Open EOD →" : "Submit EOD →"}
            </a>
          </section>
        </div>

        {/* Day playbook rail */}
        <aside
          className="rounded-xl border p-5 xl:sticky xl:top-4"
          style={{
            borderColor: "rgba(148,163,184,0.18)",
            background:
              "linear-gradient(180deg, rgba(30,41,59,0.85) 0%, rgba(15,23,42,0.95) 100%)",
          }}
        >
          <h2
            className="text-xs font-semibold uppercase tracking-[0.16em]"
            style={{ color: "#94a3b8" }}
          >
            Day playbook
          </h2>
          <p className="text-[11px] mt-1 mb-4" style={{ color: "#475569" }}>
            Laura · relationship · commitments · launch gate — not craft for Pedro/Christian
          </p>

          <ol className="space-y-2 mb-6">
            {dayContext.blocks.map(block => {
              const active = block.id === dayContext.active_block_id;
              return (
                <li
                  key={block.id}
                  className="rounded-md px-3 py-2 border"
                  style={{
                    borderColor: active
                      ? "rgba(56,189,248,0.45)"
                      : "rgba(51,65,85,0.5)",
                    background: active ? "rgba(56,189,248,0.08)" : "transparent",
                  }}
                >
                  <div
                    className="text-xs font-semibold"
                    style={{ color: active ? "#7dd3fc" : "#cbd5e1" }}
                  >
                    {block.label}
                    {active && (
                      <span
                        className="ml-2 text-[10px] font-normal uppercase tracking-wider"
                        style={{ color: "#38bdf8" }}
                      >
                        Now
                      </span>
                    )}
                  </div>
                  <div
                    className="text-[11px] mt-0.5 leading-snug"
                    style={{ color: "#64748b" }}
                  >
                    {block.detail}
                  </div>
                </li>
              );
            })}
          </ol>

          <h3
            className="text-[11px] font-semibold uppercase tracking-[0.14em] mb-2"
            style={{ color: "#64748b" }}
          >
            Priority stack
          </h3>
          <ol className="space-y-1.5 mb-6">
            {dayContext.priorities.map((p, i) => (
              <li
                key={i}
                className="flex gap-2 text-[11px] leading-snug"
                style={{ color: "#94a3b8" }}
              >
                <span className="shrink-0 font-mono" style={{ color: "#475569" }}>
                  {i + 1}.
                </span>
                <span>{p}</span>
              </li>
            ))}
          </ol>

          <div
            className="pt-3 border-t space-y-2"
            style={{ borderColor: "rgba(51,65,85,0.7)" }}
          >
            <DeepLink
              label="Follow-ups queue"
              onClick={() => go("client_health", "followups")}
            />
            <DeepLink
              label="Client Success board"
              onClick={() => go("client_health", "health")}
            />
            <DeepLink label="Calendars" onClick={() => go("team_meetings")} />
            <a
              href={eod.href}
              className="block text-xs hover:underline"
              style={{ color: "#60a5fa" }}
            >
              {eod.label} →
            </a>
          </div>
        </aside>
      </div>
    </div>
  );
}

function CountCard({
  label,
  value,
  accent,
  hint,
  isText,
}: {
  label: string;
  value: number | string;
  accent: string;
  hint?: string;
  isText?: boolean;
}) {
  return (
    <div
      className="rounded-xl px-4 py-3.5 min-w-0"
      style={{
        background: "#0a1628",
        border: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <p
        className="text-[11px] font-medium uppercase tracking-wide truncate"
        style={{ color: "#64748b" }}
      >
        {label}
      </p>
      <p
        className={`mt-1 font-semibold tabular-nums ${isText ? "text-lg" : "text-2xl"}`}
        style={{ color: accent }}
      >
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
      {hint ? (
        <p className="text-[11px] mt-1 truncate" style={{ color: "#475569" }}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function formatDue(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
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

function TodayCsMeetingsStrip({ onOpen }: { onOpen: () => void }) {
  const [rows, setRows] = useState<TeamMeetingInstanceView[]>([]);

  useEffect(() => {
    const today = todayYmdInCallCenterTz();
    fetch(`/api/team-meetings?from=${today}&to=${today}`)
      .then(r => r.json())
      .then(d => {
        const all = (d.rows ?? []) as TeamMeetingInstanceView[];
        // Prefer meetings hosted by CS; fall back to any today
        const csHosted = all.filter(
          r => r.template?.host_role === "client_success",
        );
        setRows(csHosted.length ? csHosted : all.slice(0, 5));
      })
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
        <h2
          className="text-xs font-semibold uppercase tracking-[0.16em]"
          style={{ color: "#94a3b8" }}
        >
          Today&apos;s meetings
        </h2>
        <DeepLink label="Open Calendars" onClick={onOpen} />
      </div>
      <ul className="space-y-1.5">
        {rows.slice(0, 5).map(row => (
          <li
            key={row.id}
            className="flex items-center justify-between gap-2 text-sm"
          >
            <span style={{ color: "#e2e8f0" }}>{row.template.title}</span>
            <span
              className="text-xs tabular-nums shrink-0"
              style={{ color: "#64748b" }}
            >
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

"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { MediaBuyerCommandPayload, MbLaunchCheckField } from "@/lib/team-dashboards/media";
import { MB_LAUNCH_CHECK_DAYS } from "@/lib/team-dashboards/media";
import { cachedJsonFetch, peekCachedJson, invalidateCachedJson } from "@/lib/client-fetch-cache";
import DueTodayPlate from "@/components/team-dashboards/DueTodayPlate";
import MbAccountPulse from "@/components/team-dashboards/MbAccountPulse";
import MbChangesInFlight from "@/components/team-dashboards/MbChangesInFlight";
import BetOutcomeForm from "@/components/team-dashboards/BetOutcomeForm";

const POLL_MS = 90_000;
const CACHE_KEY = "team-command-media";
const STALE_MS = 45_000;

const CHECK_FIELDS: { key: MbLaunchCheckField; label: string }[] = [
  { key: "funnel", label: "Funnel" },
  { key: "ads_manager", label: "Ads Manager" },
  { key: "mr_waiz", label: "Mr. Waiz" },
];

function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded ${className}`}
      style={{ background: "rgba(148,163,184,0.12)" }}
    />
  );
}

function money(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `$${Math.round(n)}`;
}

function pct(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${Math.round(n)}%`;
}

type PulseFilter = "attention" | "red" | "all" | "paused";

type Props = {
  onNavigate?: (view: string, tab?: string) => void;
  embedded?: boolean;
};

export default function MediaBuyerCommandDashboard({ onNavigate, embedded = false }: Props) {
  const router = useRouter();
  const [data, setData] = useState<MediaBuyerCommandPayload | null>(
    () => peekCachedJson<MediaBuyerCommandPayload>(CACHE_KEY) ?? null,
  );
  const [loading, setLoading] = useState(!data);
  const [error, setError] = useState<string | null>(null);
  const [pendingCheck, setPendingCheck] = useState<string | null>(null);
  const [pulseFilter, setPulseFilter] = useState<PulseFilter>("attention");
  const [playbookOpen, setPlaybookOpen] = useState(false);
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [hiddenReflections, setHiddenReflections] = useState<Set<string>>(new Set());
  const [evaluating, setEvaluating] = useState(false);

  const load = useCallback(async () => {
    try {
      const json = await cachedJsonFetch<MediaBuyerCommandPayload & { error?: string }>(
        CACHE_KEY,
        "/api/team-dashboards/media",
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
      if (view === "ops_overview") {
        onNavigate("team_dashboard", "cs");
        return;
      }
      if (view === "team_dashboard_ccm") {
        onNavigate("team_dashboard", "ccm");
        return;
      }
      if (view === "team_dashboard_media") {
        onNavigate("team_dashboard", "media");
        return;
      }
      onNavigate(view, tab);
      return;
    }
    const params = new URLSearchParams();
    if (view === "ops_overview" || view === "team_dashboard_ccm" || view === "team_dashboard_media") {
      params.set("view", "team_dashboard");
      params.set(
        "tab",
        view === "ops_overview" ? "cs" : view === "team_dashboard_ccm" ? "ccm" : "media",
      );
    } else {
      params.set("view", view);
      if (tab) params.set("tab", tab);
    }
    router.push(`/dashboard?${params.toString()}`);
  }

  function scrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function toggleCheck(clientId: string, field: MbLaunchCheckField, checked: boolean) {
    const key = `${clientId}:${field}`;
    setPendingCheck(key);
    try {
      const res = await fetch("/api/team-dashboards/media/launch-checks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: clientId, field, checked }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Failed to update check");
        return;
      }
      setData(prev => {
        if (!prev) return prev;
        const freshLaunches = prev.freshLaunches
          .map(row => {
            if (row.client_id !== clientId) return row;
            return {
              ...row,
              checks: json.checks,
              all_checked: json.all_checked,
            };
          })
          .sort(
            (a, b) =>
              Number(a.all_checked) - Number(b.all_checked) ||
              a.days_since_launch - b.days_since_launch ||
              a.client_name.localeCompare(b.client_name),
          );
        const fresh_incomplete = freshLaunches.filter(f => !f.all_checked).length;
        return {
          ...prev,
          freshLaunches,
          counts: { ...prev.counts, fresh_incomplete },
        };
      });
      invalidateCachedJson(CACHE_KEY);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update check");
    } finally {
      setPendingCheck(null);
    }
  }

  async function runAutoEvaluate() {
    setEvaluating(true);
    setError(null);
    try {
      const res = await fetch("/api/client-actions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? "Auto-evaluation failed");
        return;
      }
      invalidateCachedJson(CACHE_KEY);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Auto-evaluation failed");
    } finally {
      setEvaluating(false);
    }
  }

  if (loading && !data) {
    return (
      <div className="mbc space-y-6">
        <Skeleton className="h-16 w-full" />
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-6">
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
          borderColor: "color-mix(in srgb, var(--color-ws-negative) 35%, transparent)",
          color: "#fca5a5",
          background: "rgba(127,29,29,0.2)",
        }}
      >
        {error}
      </div>
    );
  }

  if (!data) return null;

  const {
    underperforming: _underperforming,
    freshLaunches,
    onboarding,
    reflectionsDue,
    changesInFlight = [],
    pulse = null,
    dayContext,
    counts,
  } = data;
  void _underperforming;
  const modeLabel = dayContext.mode === "tech" ? "Tech block" : "Buy-default";
  const activeBlock = dayContext.blocks.find(b => b.id === dayContext.active_block_id);
  const visibleReflections = reflectionsDue.filter(r => !hiddenReflections.has(r.id));

  function formatMetric(key: string | null, value: number | null): string {
    if (value == null || !Number.isFinite(value)) return "—";
    if (key === "cpl" || key === "cpql" || key === "cpconv") return money(value);
    if (
      key === "lead_to_qual" ||
      key === "optin_rate" ||
      key === "show_rate" ||
      key === "hand_raise_rate"
    ) {
      return pct(value);
    }
    return String(Math.round(value * 100) / 100);
  }

  return (
    <div className="mbc space-y-5">
      {!embedded ? (
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p
              className="text-[11px] font-semibold uppercase tracking-[0.2em]"
              style={{ color: "var(--color-ws-text-dim)" }}
            >
              Team Dashboards
            </p>
            <h1
              className="text-2xl font-semibold tracking-tight mt-1"
              style={{ color: "var(--color-ws-text-loud)" }}
            >
              Media Buyer Command
            </h1>
            <p className="text-sm mt-1" style={{ color: "var(--color-ws-text-dim)" }}>
              Account pulse · changes in flight · launch checks
            </p>
          </div>
          <div className="text-right text-xs font-data" style={{ color: "var(--color-ws-text-faint)" }}>
            <div>{data.today}</div>
            <div>Updated {new Date(data.generated_at).toLocaleTimeString()}</div>
            <div className="mt-1" style={{ color: "var(--color-ws-text-muted)" }}>
              Mode: {modeLabel}
            </div>
          </div>
        </header>
      ) : (
        <div className="flex justify-end text-xs font-data" style={{ color: "var(--color-ws-text-faint)" }}>
          <div className="text-right">
            <div>{data.today}</div>
            <div>Updated {new Date(data.generated_at).toLocaleTimeString()}</div>
            <div className="mt-1" style={{ color: "var(--color-ws-text-muted)" }}>
              Mode: {modeLabel}
            </div>
          </div>
        </div>
      )}

      {dayContext.is_reds_day && (
        <div
          className="rounded-md border px-4 py-2.5 text-sm"
          style={{
            borderColor: "color-mix(in srgb, var(--color-ws-accent) 35%, transparent)",
            background: "var(--color-ws-accent-wash)",
            color: "#fde68a",
          }}
        >
          <strong style={{ color: "var(--color-ws-accent)" }}>Reds day (Mon/Thu).</strong>{" "}
          Name CPL / CPQL / Opt-in % reds and one commitment per red for Laura.
        </div>
      )}

      {error && (
        <p className="text-xs" style={{ color: "var(--color-ws-negative)" }}>
          {error}
        </p>
      )}

      <DueTodayPlate onNavigate={go} />

      {/* Triage strip */}
      <section
        className="mbc-panel rounded-[var(--radius-card)] border px-4 py-3"
        style={{
          borderColor: "var(--color-ws-hairline)",
          background: "var(--color-ws-panel)",
        }}
      >
        <div className="flex flex-wrap items-center gap-3">
          <span
            className="text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-md"
            style={{
              color: pulse?.sync_stale
                ? "var(--color-ws-negative)"
                : "var(--color-ws-positive)",
              background: pulse?.sync_stale
                ? "rgba(248,113,113,0.14)"
                : "rgba(52,211,153,0.12)",
            }}
          >
            {pulse?.sync_stale
              ? `Sync stale · ${pulse.sync_watermark ?? "none"}`
              : `Meta · ${pulse?.sync_watermark ?? "—"}`}
          </span>
          <div className="flex flex-wrap gap-1.5 flex-1">
            <TriageBtn
              label="Not spending"
              value={counts.pulse_no_delivery ?? 0}
              tone="red"
              onClick={() => {
                setPulseFilter("attention");
                scrollTo("mbc-pulse");
              }}
            />
            <TriageBtn
              label="Off-track bets"
              value={counts.in_flight_off_track ?? 0}
              tone="red"
              onClick={() => scrollTo("mbc-inflight")}
            />
            <TriageBtn
              label="Reflections overdue"
              value={counts.reflections_overdue}
              tone="amber"
              onClick={() => scrollTo("mbc-reflections")}
            />
            <TriageBtn
              label="Fresh unchecked"
              value={counts.fresh_incomplete}
              tone="amber"
              onClick={() => scrollTo("mbc-fresh")}
            />
            <TriageBtn
              label="Needs attention"
              value={counts.pulse_flagged ?? 0}
              tone="amber"
              onClick={() => {
                setPulseFilter("attention");
                scrollTo("mbc-pulse");
              }}
            />
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-5 items-start">
        {/* Left: do */}
        <div className="space-y-5 min-w-0 mbc-col">
          <MbAccountPulse
            pulse={pulse}
            error={data.errors.pulse}
            fatigueError={data.errors.pulse_fatigue}
            filter={pulseFilter}
            onFilterChange={setPulseFilter}
            onLogged={() => void load()}
            sectionId="mbc-pulse"
          />
          <MbChangesInFlight
            rows={changesInFlight}
            error={data.errors.in_flight}
            onReload={() => void load()}
            sectionId="mbc-inflight"
          />
        </div>

        {/* Right: check */}
        <aside className="space-y-5 xl:sticky xl:top-4 mbc-col" style={{ animationDelay: "80ms" }}>
          {/* Reflections */}
          <section
            id="mbc-reflections"
            className="mbc-panel rounded-[var(--radius-card)] border p-4"
            style={{
              borderColor:
                counts.reflections_due > 0
                  ? "color-mix(in srgb, var(--color-ws-accent) 35%, transparent)"
                  : "var(--color-ws-hairline)",
              background: "var(--color-ws-panel)",
            }}
          >
            <div className="flex items-center justify-between mb-3 gap-2">
              <h2
                className="text-xs font-semibold uppercase tracking-[0.16em]"
                style={{ color: "var(--color-ws-text-muted)" }}
              >
                Reflections due
                {counts.reflections_overdue > 0 && (
                  <span className="ml-2 font-data" style={{ color: "var(--color-ws-negative)" }}>
                    {counts.reflections_overdue} overdue
                  </span>
                )}
              </h2>
              <button
                type="button"
                disabled={evaluating || visibleReflections.length === 0}
                onClick={() => void runAutoEvaluate()}
                className="text-[11px] hover:underline disabled:opacity-40"
                style={{ color: "var(--color-ws-info)" }}
              >
                {evaluating ? "Evaluating…" : "Auto-evaluate"}
              </button>
            </div>

            {visibleReflections.length === 0 ? (
              <p className="text-sm py-4" style={{ color: "var(--color-ws-positive)" }}>
                No L1/L2 account changes due for review.
              </p>
            ) : (
              <ul className="space-y-2">
                {visibleReflections.map(row => (
                  <li
                    key={row.id}
                    className="rounded-lg border p-3"
                    style={{
                      borderColor: row.overdue
                        ? "color-mix(in srgb, var(--color-ws-negative) 40%, transparent)"
                        : "var(--color-ws-hairline)",
                      background: "var(--color-ws-grouped)",
                    }}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium" style={{ color: "var(--color-ws-text)" }}>
                        {row.client_name}
                      </span>
                      <span
                        className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded"
                        style={{
                          color: row.overdue
                            ? "var(--color-ws-negative)"
                            : "var(--color-ws-accent)",
                          background: row.overdue
                            ? "rgba(248,113,113,0.15)"
                            : "var(--color-ws-accent-wash)",
                        }}
                      >
                        {row.overdue ? "Overdue" : "Due today"}
                      </span>
                    </div>
                    <div className="text-xs mt-1" style={{ color: "var(--color-ws-text-muted)" }}>
                      {row.title}
                    </div>
                    <div
                      className="flex flex-wrap gap-2 mt-1.5 text-[11px] font-data tabular-nums"
                      style={{ color: "var(--color-ws-text-dim)" }}
                    >
                      {row.success_metric_label && <span>{row.success_metric_label}</span>}
                      <span>Base {formatMetric(row.success_metric, row.baseline_value)}</span>
                      {row.target_value != null && (
                        <span>Target {formatMetric(row.success_metric, row.target_value)}</span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setRecordingId(prev => (prev === row.id ? null : row.id))
                      }
                      className="text-[11px] mt-2 hover:underline"
                      style={{ color: "var(--color-ws-info)" }}
                    >
                      {recordingId === row.id ? "Cancel" : "Record outcome"}
                    </button>
                    {recordingId === row.id && (
                      <BetOutcomeForm
                        actionId={row.id}
                        defaultOutcomeValue={null}
                        metricUnit={
                          row.success_metric === "cpl" ||
                          row.success_metric === "cpql" ||
                          row.success_metric === "cpconv"
                            ? "money"
                            : row.success_metric === "lead_to_qual" ||
                                row.success_metric === "optin_rate"
                              ? "pct"
                              : null
                        }
                        onCancel={() => setRecordingId(null)}
                        onSaved={() => {
                          setHiddenReflections(prev => new Set(prev).add(row.id));
                          setRecordingId(null);
                          invalidateCachedJson(CACHE_KEY);
                          void load();
                        }}
                      />
                    )}
                  </li>
                ))}
              </ul>
            )}
            {data.errors.reflections && (
              <p className="text-xs mt-2" style={{ color: "var(--color-ws-negative)" }}>
                {data.errors.reflections}
              </p>
            )}
          </section>

          {/* Fresh launches */}
          <section
            id="mbc-fresh"
            className="mbc-panel rounded-[var(--radius-card)] border p-4"
            style={{
              borderColor: "var(--color-ws-hairline)",
              background: "var(--color-ws-panel)",
            }}
          >
            <h2
              className="text-xs font-semibold uppercase tracking-[0.16em] mb-3"
              style={{ color: "var(--color-ws-text-muted)" }}
            >
              Freshly launched
              <span
                className="ml-2 normal-case tracking-normal font-normal"
                style={{ color: "var(--color-ws-text-faint)" }}
              >
                ≤{MB_LAUNCH_CHECK_DAYS}d
              </span>
            </h2>
            {freshLaunches.length === 0 ? (
              <p className="text-sm py-3" style={{ color: "var(--color-ws-text-dim)" }}>
                No clients launched in the last {MB_LAUNCH_CHECK_DAYS} days.
              </p>
            ) : (
              <ul className="space-y-2">
                {freshLaunches.map(row => (
                  <li
                    key={row.client_id}
                    className="rounded-lg border p-3"
                    style={{
                      borderColor: row.all_checked
                        ? "color-mix(in srgb, var(--color-ws-positive) 25%, transparent)"
                        : "var(--color-ws-hairline)",
                      background: "var(--color-ws-grouped)",
                    }}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div>
                        <div className="text-sm font-medium" style={{ color: "var(--color-ws-text)" }}>
                          {row.client_name}
                        </div>
                        <div className="text-[11px] font-data" style={{ color: "var(--color-ws-text-faint)" }}>
                          Day {row.days_since_launch + 1} / {MB_LAUNCH_CHECK_DAYS}
                        </div>
                      </div>
                      {row.all_checked && (
                        <span
                          className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded"
                          style={{
                            color: "var(--color-ws-positive)",
                            background: "rgba(52,211,153,0.12)",
                          }}
                        >
                          Cleared
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {CHECK_FIELDS.map(({ key, label }) => {
                        const col =
                          key === "funnel"
                            ? "funnel_checked_at"
                            : key === "ads_manager"
                              ? "ads_manager_checked_at"
                              : "mr_waiz_checked_at";
                        const isOn = Boolean(row.checks[col]);
                        const busy = pendingCheck === `${row.client_id}:${key}`;
                        return (
                          <button
                            key={key}
                            type="button"
                            disabled={busy}
                            onClick={() => toggleCheck(row.client_id, key, !isOn)}
                            className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-[11px] disabled:opacity-50"
                            style={{
                              borderColor: isOn
                                ? "color-mix(in srgb, var(--color-ws-positive) 40%, transparent)"
                                : "var(--color-ws-hairline)",
                              background: isOn
                                ? "rgba(52,211,153,0.1)"
                                : "transparent",
                              color: isOn
                                ? "var(--color-ws-positive)"
                                : "var(--color-ws-text-muted)",
                            }}
                          >
                            <span
                              className="inline-flex h-3.5 w-3.5 items-center justify-center rounded border text-[9px]"
                              style={{
                                borderColor: isOn
                                  ? "var(--color-ws-positive)"
                                  : "var(--color-ws-text-dim)",
                                background: isOn ? "var(--color-ws-positive)" : "transparent",
                                color: isOn ? "#0f172a" : "transparent",
                              }}
                            >
                              {isOn ? "✓" : ""}
                            </span>
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Onboarding compact */}
          <section
            className="mbc-panel rounded-[var(--radius-card)] border p-4"
            style={{
              borderColor: "var(--color-ws-hairline)",
              background: "var(--color-ws-panel)",
            }}
          >
            <div className="flex items-center justify-between mb-2">
              <h2
                className="text-xs font-semibold uppercase tracking-[0.16em]"
                style={{ color: "var(--color-ws-text-muted)" }}
              >
                Onboarding ({onboarding.length})
              </h2>
              <button
                type="button"
                onClick={() => go("admin_clients")}
                className="text-[11px] hover:underline"
                style={{ color: "var(--color-ws-text-dim)" }}
              >
                Roster →
              </button>
            </div>
            {onboarding.length === 0 ? (
              <p className="text-xs py-2" style={{ color: "var(--color-ws-text-dim)" }}>
                Queue clear.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {onboarding.slice(0, 6).map(c => (
                  <li
                    key={c.client_id}
                    className="flex items-center justify-between gap-2 text-xs"
                  >
                    <span className="truncate" style={{ color: "var(--color-ws-text)" }}>
                      {c.client_name}
                    </span>
                    <span
                      className="font-data tabular-nums shrink-0"
                      style={{
                        color:
                          (c.days_in_onboarding ?? 0) >= 14
                            ? "var(--color-ws-negative)"
                            : (c.days_in_onboarding ?? 0) >= 7
                              ? "var(--color-ws-accent)"
                              : "var(--color-ws-text-dim)",
                      }}
                    >
                      {c.days_in_onboarding != null ? `${c.days_in_onboarding}d` : "—"}
                    </span>
                  </li>
                ))}
                {onboarding.length > 6 && (
                  <li className="text-[11px]" style={{ color: "var(--color-ws-text-faint)" }}>
                    +{onboarding.length - 6} more
                  </li>
                )}
              </ul>
            )}
          </section>

          {/* Day playbook — collapsed */}
          <section
            className="mbc-panel rounded-[var(--radius-card)] border p-4"
            style={{
              borderColor: "var(--color-ws-hairline)",
              background: "var(--color-ws-panel)",
            }}
          >
            <button
              type="button"
              onClick={() => setPlaybookOpen(o => !o)}
              className="w-full flex items-center justify-between text-left"
            >
              <div>
                <h2
                  className="text-xs font-semibold uppercase tracking-[0.16em]"
                  style={{ color: "var(--color-ws-text-muted)" }}
                >
                  Day playbook
                </h2>
                {activeBlock && (
                  <p className="text-[11px] mt-1" style={{ color: "var(--color-ws-info)" }}>
                    Now: {activeBlock.label}
                  </p>
                )}
              </div>
              <span className="text-xs" style={{ color: "var(--color-ws-text-dim)" }}>
                {playbookOpen ? "Hide" : "Show"}
              </span>
            </button>
            {playbookOpen && (
              <div className="mt-3 space-y-3">
                <ol className="space-y-1.5">
                  {dayContext.blocks.map(block => {
                    const active = block.id === dayContext.active_block_id;
                    return (
                      <li
                        key={block.id}
                        className="rounded-md px-2.5 py-2 border text-[11px]"
                        style={{
                          borderColor: active
                            ? "color-mix(in srgb, var(--color-ws-info) 45%, transparent)"
                            : "var(--color-ws-hairline-soft)",
                          background: active ? "rgba(96,165,250,0.08)" : "transparent",
                        }}
                      >
                        <div
                          className="font-semibold"
                          style={{
                            color: active ? "#93c5fd" : "var(--color-ws-text)",
                          }}
                        >
                          {block.label}
                          {active && (
                            <span className="ml-2 text-[10px] font-normal uppercase tracking-wider">
                              Now
                            </span>
                          )}
                        </div>
                        <div style={{ color: "var(--color-ws-text-dim)" }}>{block.detail}</div>
                      </li>
                    );
                  })}
                </ol>
                <Link
                  href="/forms/eod/media-buyer"
                  className="block text-xs hover:underline"
                  style={{ color: "var(--color-ws-info)" }}
                >
                  Media Buyer EOD form →
                </Link>
                <button
                  type="button"
                  onClick={() => go("media_buyer")}
                  className="block text-xs hover:underline"
                  style={{ color: "var(--color-ws-info)" }}
                >
                  Ad Performance →
                </button>
              </div>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

function TriageBtn({
  label,
  value,
  tone,
  onClick,
}: {
  label: string;
  value: number;
  tone: "red" | "amber" | "neutral";
  onClick: () => void;
}) {
  const active = value > 0;
  const color =
    !active
      ? "var(--color-ws-text-dim)"
      : tone === "red"
        ? "var(--color-ws-negative)"
        : "var(--color-ws-accent)";
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-left transition-colors hover:bg-white/[0.03]"
      style={{ borderColor: "var(--color-ws-hairline)" }}
    >
      <span
        className="text-sm font-semibold font-data tabular-nums"
        style={{ color }}
      >
        {value}
      </span>
      <span className="text-[10px] uppercase tracking-wider" style={{ color: "var(--color-ws-text-faint)" }}>
        {label}
      </span>
    </button>
  );
}

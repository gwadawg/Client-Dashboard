"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { MediaBuyerCommandPayload, MbLaunchCheckField } from "@/lib/team-dashboards/media";
import { MB_LAUNCH_CHECK_DAYS } from "@/lib/team-dashboards/media";

const POLL_MS = 90_000;

const TIER_COLOR: Record<string, string> = {
  critical: "#f87171",
  below: "#fbbf24",
  at: "#60a5fa",
  above: "#34d399",
  insufficient: "#64748b",
};

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

type Props = {
  onNavigate?: (view: string, tab?: string) => void;
};

export default function MediaBuyerCommandDashboard({ onNavigate }: Props) {
  const router = useRouter();
  const [data, setData] = useState<MediaBuyerCommandPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingCheck, setPendingCheck] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/team-dashboards/media");
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Failed to load Media Buyer Command");
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

  async function toggleCheck(
    clientId: string,
    field: MbLaunchCheckField,
    checked: boolean,
  ) {
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
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update check");
    } finally {
      setPendingCheck(null);
    }
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

  const {
    underperforming,
    freshLaunches,
    onboarding,
    reflectionsDue,
    dayContext,
    counts,
  } = data;
  const modeLabel = dayContext.mode === "tech" ? "Tech block" : "Buy-default";

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
    <div className="mb-command space-y-6">
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
            Media Buyer Command
          </h1>
          <p className="text-sm mt-1" style={{ color: "#64748b" }}>
            Underperforming ads · {MB_LAUNCH_CHECK_DAYS}d launch checks · OB queue
          </p>
        </div>
        <div className="text-right text-xs" style={{ color: "#475569" }}>
          <div>{data.today}</div>
          <div>Updated {new Date(data.generated_at).toLocaleTimeString()}</div>
          <div className="mt-1" style={{ color: "#94a3b8" }}>
            Mode: {modeLabel}
          </div>
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
          Name CPL / CPQL / Opt-in % reds and one commitment per red for Laura.
        </div>
      )}

      {error && (
        <p className="text-xs" style={{ color: "#f87171" }}>
          {error}
        </p>
      )}

      {/* Counts band */}
      <section
        className="rounded-xl border p-5"
        style={{
          borderColor: "rgba(148,163,184,0.15)",
          background:
            "linear-gradient(145deg, rgba(15,23,42,0.95) 0%, rgba(30,41,59,0.6) 100%)",
        }}
      >
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Stat
            label="Reflections due"
            value={String(counts.reflections_due)}
            sub={
              counts.reflections_overdue > 0
                ? `${counts.reflections_overdue} overdue`
                : counts.reflections_due > 0
                  ? "Check if change worked"
                  : "None today"
            }
            accent={
              counts.reflections_overdue > 0
                ? "#f87171"
                : counts.reflections_due > 0
                  ? "#fbbf24"
                  : "#34d399"
            }
          />
          <Stat
            label={`Fresh launches (≤${MB_LAUNCH_CHECK_DAYS}d)`}
            value={String(counts.fresh_launches)}
            sub={
              counts.fresh_incomplete > 0
                ? `${counts.fresh_incomplete} unchecked`
                : "All checked"
            }
            accent={counts.fresh_incomplete > 0 ? "#fbbf24" : "#34d399"}
          />
          <Stat label="Onboarding queue" value={String(counts.onboarding)} />
          <Stat
            label="Underperforming"
            value={String(counts.underperforming)}
            accent={counts.underperforming > 0 ? "#f87171" : "#34d399"}
          />
          <Stat
            label="Today mode"
            value={modeLabel}
            sub={dayContext.is_tech_block_day ? "Tue/Wed AM tech protected" : "Buy-default"}
          />
        </div>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_300px] gap-6 items-start">
        <div className="space-y-6 min-w-0">
          {/* 1. Reflections due — check if yesterday's change worked */}
          <section
            className="rounded-xl border p-5"
            style={{
              borderColor:
                counts.reflections_due > 0
                  ? "rgba(251,191,36,0.35)"
                  : "rgba(148,163,184,0.15)",
              background:
                counts.reflections_due > 0
                  ? "linear-gradient(145deg, rgba(251,191,36,0.08) 0%, rgba(15,23,42,0.7) 100%)"
                  : "rgba(15,23,42,0.55)",
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <h2
                className="text-xs font-semibold uppercase tracking-[0.16em]"
                style={{ color: "#94a3b8" }}
              >
                Reflections due
                <span
                  className="ml-2 normal-case tracking-normal font-normal"
                  style={{ color: "#475569" }}
                >
                  Account changes with review today — did it work?
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

            {reflectionsDue.length === 0 ? (
              <p className="text-sm py-6" style={{ color: "#64748b" }}>
                No L1/L2 account changes due for review today.
              </p>
            ) : (
              <ul className="space-y-3">
                {reflectionsDue.map(row => (
                  <li
                    key={row.id}
                    className="rounded-lg border p-4"
                    style={{
                      borderColor: row.overdue
                        ? "rgba(248,113,113,0.4)"
                        : "rgba(251,191,36,0.3)",
                      background: "rgba(2,6,23,0.5)",
                    }}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className="text-sm font-medium"
                            style={{ color: "#e2e8f0" }}
                          >
                            {row.client_name}
                          </span>
                          <span
                            className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded"
                            style={{
                              color: row.overdue ? "#f87171" : "#fbbf24",
                              background: row.overdue
                                ? "rgba(248,113,113,0.15)"
                                : "rgba(251,191,36,0.15)",
                            }}
                          >
                            {row.overdue ? "Overdue" : "Due today"}
                          </span>
                          {row.layer && (
                            <span
                              className="text-[10px] uppercase tracking-wider"
                              style={{ color: "#64748b" }}
                            >
                              {row.layer}
                            </span>
                          )}
                        </div>
                        <div className="text-sm mt-1" style={{ color: "#cbd5e1" }}>
                          {row.title}
                        </div>
                        {row.change_description && (
                          <p className="text-xs mt-1.5 leading-snug" style={{ color: "#94a3b8" }}>
                            Changed: {row.change_description}
                          </p>
                        )}
                        {row.hypothesis && (
                          <p className="text-xs mt-1 leading-snug" style={{ color: "#64748b" }}>
                            Hypothesis: {row.hypothesis}
                          </p>
                        )}
                        <div
                          className="flex flex-wrap gap-3 mt-2 text-[11px] tabular-nums"
                          style={{ color: "#94a3b8" }}
                        >
                          {row.success_metric_label && (
                            <span>Metric: {row.success_metric_label}</span>
                          )}
                          <span>
                            Baseline {formatMetric(row.success_metric, row.baseline_value)}
                          </span>
                          {row.target_value != null && (
                            <span>
                              Target {formatMetric(row.success_metric, row.target_value)}
                            </span>
                          )}
                          {row.change_date && <span>Changed {row.change_date}</span>}
                          {row.review_date && <span>Review {row.review_date}</span>}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => go("client_health")}
                        className="text-xs shrink-0 hover:underline"
                        style={{ color: "#60a5fa" }}
                      >
                        Record outcome →
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {data.errors.reflections && (
              <p className="text-xs mt-3" style={{ color: "#f87171" }}>
                Reflections feed: {data.errors.reflections}
              </p>
            )}
          </section>

          {/* 2. Fresh launches */}
          <section
            className="rounded-xl border p-5"
            style={{
              borderColor: "rgba(148,163,184,0.15)",
              background: "rgba(15,23,42,0.55)",
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <h2
                className="text-xs font-semibold uppercase tracking-[0.16em]"
                style={{ color: "#94a3b8" }}
              >
                Freshly launched
                <span
                  className="ml-2 normal-case tracking-normal font-normal"
                  style={{ color: "#475569" }}
                >
                  First {MB_LAUNCH_CHECK_DAYS} days — verify Funnel / Ads / Mr. Waiz
                </span>
              </h2>
            </div>

            {freshLaunches.length === 0 ? (
              <p className="text-sm py-6" style={{ color: "#64748b" }}>
                No clients launched in the last {MB_LAUNCH_CHECK_DAYS} days.
              </p>
            ) : (
              <ul className="space-y-3">
                {freshLaunches.map(row => (
                  <li
                    key={row.client_id}
                    className="rounded-lg border p-4"
                    style={{
                      borderColor: row.all_checked
                        ? "rgba(52,211,153,0.25)"
                        : "rgba(148,163,184,0.18)",
                      background: "rgba(2,6,23,0.45)",
                    }}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
                      <div>
                        <div className="text-sm font-medium" style={{ color: "#e2e8f0" }}>
                          {row.client_name}
                        </div>
                        <div className="text-[11px] mt-0.5" style={{ color: "#64748b" }}>
                          Day {row.days_since_launch + 1} / {MB_LAUNCH_CHECK_DAYS}
                          {" · "}
                          launched {row.launch_date}
                        </div>
                      </div>
                      {row.all_checked && (
                        <span
                          className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded"
                          style={{ color: "#34d399", background: "rgba(52,211,153,0.12)" }}
                        >
                          Cleared
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
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
                            className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-xs transition-colors disabled:opacity-50"
                            style={{
                              borderColor: isOn
                                ? "rgba(52,211,153,0.4)"
                                : "rgba(71,85,105,0.6)",
                              background: isOn
                                ? "rgba(52,211,153,0.1)"
                                : "rgba(15,23,42,0.6)",
                              color: isOn ? "#6ee7b7" : "#94a3b8",
                            }}
                          >
                            <span
                              className="inline-flex h-4 w-4 items-center justify-center rounded border text-[10px]"
                              style={{
                                borderColor: isOn
                                  ? "rgba(52,211,153,0.6)"
                                  : "rgba(100,116,139,0.7)",
                                background: isOn ? "#34d399" : "transparent",
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
            {data.errors.fresh && (
              <p className="text-xs mt-3" style={{ color: "#f87171" }}>
                Fresh feed: {data.errors.fresh}
              </p>
            )}
          </section>

          {/* 3. Onboarding */}
          <section
            className="rounded-xl border p-5"
            style={{
              borderColor: "rgba(148,163,184,0.15)",
              background: "rgba(15,23,42,0.55)",
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <h2
                className="text-xs font-semibold uppercase tracking-[0.16em]"
                style={{ color: "#94a3b8" }}
              >
                Onboarding queue
                <span
                  className="ml-2 normal-case tracking-normal font-normal"
                  style={{ color: "#475569" }}
                >
                  Days waiting · next gate
                </span>
              </h2>
              <button
                type="button"
                onClick={() => go("admin_clients")}
                className="text-xs hover:underline"
                style={{ color: "#64748b" }}
              >
                Client Roster →
              </button>
            </div>

            {onboarding.length === 0 ? (
              <p className="text-sm py-6" style={{ color: "#64748b" }}>
                No clients in onboarding.
              </p>
            ) : (
              <ul className="divide-y" style={{ borderColor: "rgba(51,65,85,0.6)" }}>
                {onboarding.map(c => (
                  <li
                    key={c.client_id}
                    className="py-3 flex flex-wrap items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium" style={{ color: "#e2e8f0" }}>
                        {c.client_name}
                      </div>
                      <div className="text-xs mt-0.5" style={{ color: "#64748b" }}>
                        {c.lifecycle_status?.replace(/_/g, " ") ?? "—"}
                        {" · "}
                        {c.next_gate}
                        {c.kickoff_incomplete ? " · kickoff incomplete" : ""}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div
                        className="text-sm font-semibold tabular-nums"
                        style={{
                          color:
                            (c.days_in_onboarding ?? 0) >= 14
                              ? "#f87171"
                              : (c.days_in_onboarding ?? 0) >= 7
                                ? "#fbbf24"
                                : "#e2e8f0",
                        }}
                      >
                        {c.days_in_onboarding != null
                          ? `${c.days_in_onboarding}d`
                          : "—"}
                      </div>
                      <div className="text-[10px] uppercase tracking-wider" style={{ color: "#475569" }}>
                        in queue
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {data.errors.onboarding && (
              <p className="text-xs mt-3" style={{ color: "#f87171" }}>
                Onboarding feed: {data.errors.onboarding}
              </p>
            )}
          </section>

          {/* 4. Underperforming — bottom */}
          <section
            className="rounded-xl border p-5"
            style={{
              borderColor: "rgba(148,163,184,0.15)",
              background: "rgba(15,23,42,0.55)",
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <h2
                className="text-xs font-semibold uppercase tracking-[0.16em]"
                style={{ color: "#94a3b8" }}
              >
                Underperforming clients
                <span
                  className="ml-2 normal-case tracking-normal font-normal"
                  style={{ color: "#475569" }}
                >
                  MB lens · CPL / CPQL / Qual %
                </span>
              </h2>
              <button
                type="button"
                onClick={() => go("media_buyer")}
                className="text-xs hover:underline"
                style={{ color: "#64748b" }}
              >
                Ad Performance →
              </button>
            </div>

            {underperforming.length === 0 ? (
              <p className="text-sm py-6" style={{ color: "#34d399" }}>
                No underperforming ads accounts — keep testing.
              </p>
            ) : (
              <ul className="divide-y" style={{ borderColor: "rgba(51,65,85,0.6)" }}>
                {underperforming.map(c => {
                  const color = TIER_COLOR[c.mb_tier] ?? TIER_COLOR.insufficient;
                  return (
                    <li key={c.client_id}>
                      <button
                        type="button"
                        onClick={() => go("media_buyer")}
                        className="w-full text-left py-3 flex flex-wrap items-center justify-between gap-3 hover:bg-white/[0.02] transition-colors"
                      >
                        <div className="min-w-0 flex-1">
                          <div
                            className="text-sm font-medium truncate"
                            style={{ color: "#e2e8f0" }}
                          >
                            {c.client_name}
                          </div>
                          <div className="text-xs mt-0.5" style={{ color: "#64748b" }}>
                            {c.constraint_label}
                            {c.red_kpis.length > 0 ? ` · ${c.red_kpis.join(", ")}` : ""}
                            {c.days_live != null ? ` · ${c.days_live}d live` : ""}
                          </div>
                          <div
                            className="flex flex-wrap gap-3 mt-1.5 text-[11px] tabular-nums"
                            style={{ color: "#94a3b8" }}
                          >
                            <span>CPL {money(c.cpl)}</span>
                            <span>CPQL {money(c.cpql)}</span>
                            <span>Qual {pct(c.qual_pct)}</span>
                          </div>
                        </div>
                        <span
                          className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded shrink-0"
                          style={{ color, background: `${color}18` }}
                        >
                          {c.mb_tier_label}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {data.errors.underperforming && (
              <p className="text-xs mt-3" style={{ color: "#f87171" }}>
                Health feed: {data.errors.underperforming}
              </p>
            )}
          </section>
        </div>

        {/* Side rail */}
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
            {dayContext.mode === "tech"
              ? "Tech block priorities (Tue/Wed AM)"
              : "Buy-default priorities"}
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
                      ? "rgba(96,165,250,0.45)"
                      : "rgba(51,65,85,0.5)",
                    background: active ? "rgba(96,165,250,0.08)" : "transparent",
                  }}
                >
                  <div
                    className="text-xs font-semibold"
                    style={{ color: active ? "#93c5fd" : "#cbd5e1" }}
                  >
                    {block.label}
                    {active && (
                      <span
                        className="ml-2 text-[10px] font-normal uppercase tracking-wider"
                        style={{ color: "#60a5fa" }}
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
            <a
              href="/forms/eod/media-buyer"
              className="block text-xs hover:underline"
              style={{ color: "#60a5fa" }}
            >
              Media Buyer EOD form →
            </a>
            <DeepLink label="Ad Performance" onClick={() => go("media_buyer")} />
            <DeepLink label="Ops Dashboard" onClick={() => go("ops_overview")} />
            <DeepLink label="Client Roster" onClick={() => go("admin_clients")} />
            <DeepLink
              label="Client Success (Media lens)"
              onClick={() => go("client_health")}
            />
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

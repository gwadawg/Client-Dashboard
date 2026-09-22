"use client";

import { useState } from "react";
import type { MbChangeInFlight, MbInFlightVerdict } from "@/lib/team-dashboards/media";
import BetOutcomeForm from "@/components/team-dashboards/BetOutcomeForm";
import { invalidateCachedJson } from "@/lib/client-fetch-cache";

const VERDICT_META: Record<
  MbInFlightVerdict,
  { label: string; color: string; bg: string }
> = {
  on_track: {
    label: "On track",
    color: "var(--color-ws-positive)",
    bg: "rgba(52,211,153,0.14)",
  },
  off_track: {
    label: "Off track",
    color: "var(--color-ws-negative)",
    bg: "rgba(248,113,113,0.14)",
  },
  measuring: {
    label: "Measuring",
    color: "var(--color-ws-info)",
    bg: "rgba(96,165,250,0.14)",
  },
  no_data: {
    label: "No read yet",
    color: "var(--color-ws-text-muted)",
    bg: "rgba(148,163,184,0.12)",
  },
};

const BET_CATEGORY_LABEL: Record<string, string> = {
  new_creatives: "New creatives",
  new_angle_offer: "New angle / offer",
  audience_targeting: "Audience / targeting",
  landing_optin: "Landing / opt-in",
  budget_allocation: "Budget allocation",
  campaign_structure: "Campaign structure",
  reactivate_leads: "Reactivate leads",
  confirmation_rebook: "Confirmation / rebook",
  dial_coverage: "Dial coverage",
  script_booking: "Script / booking",
  live_transfer: "Live transfer",
  lo_show_process: "LO show process",
  other: "Other",
};

function fmt(unit: MbChangeInFlight["metric_unit"], v: number | null): string {
  if (v == null || !Number.isFinite(v)) return "—";
  if (unit === "money") return `$${Math.round(v)}`;
  if (unit === "pct") return `${v.toFixed(1)}%`;
  return v.toFixed(3);
}

function signedPct(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return "";
  const r = Math.round(v);
  return `${r > 0 ? "+" : ""}${r}%`;
}

function workspaceHref(clientId: string): string {
  const p = new URLSearchParams({ view: "client_workspace", tab: "kpis", client: clientId });
  return `/dashboard?${p.toString()}`;
}

type Props = {
  rows: MbChangeInFlight[];
  error?: string;
  onReload?: () => void;
  sectionId?: string;
};

export default function MbChangesInFlight({
  rows,
  error,
  onReload,
  sectionId = "mbc-inflight",
}: Props) {
  const live = rows.filter(r => r.phase === "live");
  const planned = rows.filter(r => r.phase === "planned");
  const offTrack = live.filter(r => r.verdict === "off_track").length;
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const visibleLive = live.filter(r => !hidden.has(r.id));
  const visiblePlanned = planned.filter(r => !hidden.has(r.id));

  return (
    <section
      id={sectionId}
      className="mbc-panel rounded-[var(--radius-card)] border p-5"
      style={{
        borderColor:
          offTrack > 0
            ? "color-mix(in srgb, var(--color-ws-negative) 35%, transparent)"
            : "var(--color-ws-hairline)",
        background: "var(--color-ws-panel)",
      }}
    >
      <div className="flex items-center justify-between mb-4">
        <h2
          className="text-xs font-semibold uppercase tracking-[0.16em]"
          style={{ color: "var(--color-ws-text-muted)" }}
        >
          Changes in flight
          <span
            className="ml-2 normal-case tracking-normal font-normal"
            style={{ color: "var(--color-ws-text-faint)" }}
          >
            Live read since the day you changed it
          </span>
        </h2>
      </div>

      {visibleLive.length === 0 && visiblePlanned.length === 0 ? (
        <p className="text-sm py-6" style={{ color: "var(--color-ws-text-dim)" }}>
          No open ads bets. Log a change from Account pulse when you touch an account.
        </p>
      ) : (
        <>
          {visibleLive.length > 0 && (
            <ul className="space-y-2">
              {visibleLive.map(row => (
                <InFlightCard
                  key={row.id}
                  row={row}
                  recording={recordingId === row.id}
                  onToggleRecord={() =>
                    setRecordingId(prev => (prev === row.id ? null : row.id))
                  }
                  onSaved={() => {
                    setHidden(prev => new Set(prev).add(row.id));
                    setRecordingId(null);
                    invalidateCachedJson("team-command-media");
                    onReload?.();
                  }}
                />
              ))}
            </ul>
          )}

          {visiblePlanned.length > 0 && (
            <div className={visibleLive.length > 0 ? "mt-5" : ""}>
              <div
                className="text-[10px] font-semibold uppercase tracking-wider mb-2"
                style={{ color: "var(--color-ws-text-faint)" }}
              >
                Planned · not live yet ({visiblePlanned.length})
              </div>
              <ul className="divide-y" style={{ borderColor: "var(--color-ws-hairline-soft)" }}>
                {visiblePlanned.map(row => (
                  <li
                    key={row.id}
                    className="py-2 flex flex-wrap items-center justify-between gap-2 text-xs"
                  >
                    <div className="min-w-0">
                      <a
                        href={workspaceHref(row.client_id)}
                        className="font-medium hover:underline"
                        style={{ color: "var(--color-ws-text)" }}
                      >
                        {row.client_name}
                      </a>
                      <span style={{ color: "var(--color-ws-text-dim)" }}> · {row.title}</span>
                    </div>
                    <span className="font-data tabular-nums" style={{ color: "var(--color-ws-text-dim)" }}>
                      {row.planned_date
                        ? `planned ${row.planned_date}`
                        : row.change_date
                          ? `goes live ${row.change_date}`
                          : "no date"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {error && (
        <p className="text-xs mt-3" style={{ color: "var(--color-ws-negative)" }}>
          In-flight feed: {error}
        </p>
      )}
    </section>
  );
}

function InFlightCard({
  row,
  recording,
  onToggleRecord,
  onSaved,
}: {
  row: MbChangeInFlight;
  recording: boolean;
  onToggleRecord: () => void;
  onSaved: () => void;
}) {
  const [openDetail, setOpenDetail] = useState(false);
  const verdict = VERDICT_META[row.verdict];
  const lowerIsBetter = row.lower_is_better ?? true;
  const hasRead = row.current_value != null;
  const progress = row.progress_pct;
  const barPct = progress == null ? null : Math.max(0, Math.min(100, progress));
  const barColor =
    row.direction === "worsening"
      ? "var(--color-ws-negative)"
      : row.verdict === "on_track"
        ? "var(--color-ws-positive)"
        : "var(--color-ws-info)";
  const deltaColor =
    row.direction === "improving"
      ? "var(--color-ws-positive)"
      : row.direction === "worsening"
        ? "var(--color-ws-negative)"
        : "var(--color-ws-text-muted)";

  const reviewLabel =
    row.days_to_review == null
      ? "no review date"
      : row.days_to_review === 0
        ? "review today"
        : row.days_to_review === 1
          ? "review tomorrow"
          : `review in ${row.days_to_review}d`;

  return (
    <li
      className="rounded-lg border px-3.5 py-3"
      style={{
        borderColor:
          row.verdict === "off_track"
            ? "color-mix(in srgb, var(--color-ws-negative) 40%, transparent)"
            : "var(--color-ws-hairline)",
        background: "var(--color-ws-grouped)",
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={workspaceHref(row.client_id)}
              className="text-sm font-medium hover:underline"
              style={{ color: "var(--color-ws-text)" }}
            >
              {row.client_name}
            </a>
            <span
              className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded"
              style={{ color: verdict.color, background: verdict.bg }}
            >
              {verdict.label}
            </span>
            {row.layer && (
              <span
                className="text-[10px] uppercase tracking-wider"
                style={{ color: "var(--color-ws-text-faint)" }}
              >
                {row.layer}
              </span>
            )}
            {row.bet_category && (
              <span
                className="text-[10px] uppercase tracking-wider"
                style={{ color: "var(--color-ws-text-faint)" }}
              >
                {BET_CATEGORY_LABEL[row.bet_category] ?? row.bet_category}
              </span>
            )}
          </div>
          <div className="text-sm mt-0.5" style={{ color: "var(--color-ws-text-secondary, #cbd5e1)" }}>
            {row.title}
          </div>
        </div>
        <div
          className="text-right text-[11px] font-data tabular-nums shrink-0"
          style={{ color: "var(--color-ws-text-dim)" }}
        >
          <div>Day {row.days_since_change != null ? row.days_since_change + 1 : "—"}</div>
          <div
            style={{
              color:
                row.days_to_review != null && row.days_to_review <= 1
                  ? "var(--color-ws-accent)"
                  : undefined,
            }}
          >
            {reviewLabel}
          </div>
        </div>
      </div>

      {/* Baseline → now → target meter */}
      <div className="mt-3">
        <div className="flex flex-wrap items-end justify-between gap-2 text-[11px]">
          <div style={{ color: "var(--color-ws-text-muted)" }}>
            {row.success_metric_label ?? "Metric"}
            <span style={{ color: "var(--color-ws-text-faint)" }}>
              {" "}
              · {lowerIsBetter ? "lower better" : "higher better"}
            </span>
          </div>
          <div className="flex items-baseline gap-3 font-data tabular-nums">
            <span style={{ color: "var(--color-ws-text-dim)" }}>
              Base{" "}
              <span style={{ color: "var(--color-ws-text)" }}>
                {fmt(row.metric_unit, row.baseline_value)}
              </span>
            </span>
            <span style={{ color: "var(--color-ws-text-dim)" }}>
              Now{" "}
              <span
                className="text-sm font-semibold"
                style={{ color: hasRead ? deltaColor : "var(--color-ws-text-dim)" }}
              >
                {fmt(row.metric_unit, row.current_value)}
              </span>
              {hasRead && row.delta_pct != null && (
                <span className="ml-1" style={{ color: deltaColor }}>
                  {signedPct(row.delta_pct)}
                </span>
              )}
            </span>
            {row.target_value != null && (
              <span style={{ color: "var(--color-ws-text-dim)" }}>
                Target{" "}
                <span style={{ color: "var(--color-ws-text)" }}>
                  {fmt(row.metric_unit, row.target_value)}
                </span>
              </span>
            )}
          </div>
        </div>

        {barPct != null ? (
          <div className="mt-2 relative">
            <div
              className="h-1.5 w-full rounded-full overflow-hidden"
              style={{ background: "rgba(148,163,184,0.15)" }}
            >
              <div
                className="h-full rounded-full transition-[width] duration-[var(--duration-med)]"
                style={{
                  width: `${barPct}%`,
                  background: barColor,
                  transitionTimingFunction: "var(--ease-ws)",
                }}
              />
            </div>
            {/* Target tick at 100% */}
            <div
              className="absolute top-0 right-0 h-1.5 w-px"
              style={{ background: "var(--color-ws-text-muted)" }}
              title="Target"
            />
            <div
              className="flex justify-between text-[10px] mt-1 font-data tabular-nums"
              style={{ color: "var(--color-ws-text-faint)" }}
            >
              <span>
                {progress != null && progress < 0
                  ? "Moving away from baseline"
                  : `${Math.round(progress ?? 0)}% to target`}
              </span>
              {row.window && (
                <span>
                  {row.window.start} → {row.window.end}
                </span>
              )}
            </div>
          </div>
        ) : null}

        {(row.change_description || row.hypothesis || row.summary) && (
          <button
            type="button"
            onClick={() => setOpenDetail(d => !d)}
            className="text-[11px] mt-2 hover:underline"
            style={{ color: "var(--color-ws-text-dim)" }}
          >
            {openDetail ? "Hide detail" : "Show detail"}
          </button>
        )}
        {openDetail && (
          <div className="mt-2 space-y-1 text-xs" style={{ color: "var(--color-ws-text-muted)" }}>
            {row.change_description && <p>Changed: {row.change_description}</p>}
            {row.hypothesis && <p>Hypothesis: {row.hypothesis}</p>}
            {row.summary && (
              <p style={{ color: row.insufficient_volume ? "var(--color-ws-text-dim)" : undefined }}>
                {row.summary}
              </p>
            )}
            {row.loom_url && (
              <a
                href={row.loom_url}
                target="_blank"
                rel="noreferrer"
                className="hover:underline"
                style={{ color: "var(--color-ws-info)" }}
              >
                Loom ↗
              </a>
            )}
          </div>
        )}
        {!hasRead && !row.summary && (
          <p className="text-xs mt-2" style={{ color: "var(--color-ws-text-dim)" }}>
            {row.baseline_value == null
              ? "No frozen baseline — set one in the work log."
              : "No data yet since the change date."}
          </p>
        )}
      </div>

      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          onClick={onToggleRecord}
          className="text-[11px] hover:underline"
          style={{ color: "var(--color-ws-info)" }}
        >
          {recording ? "Cancel" : "Record outcome"}
        </button>
      </div>
      {recording && (
        <BetOutcomeForm
          actionId={row.id}
          defaultOutcomeValue={row.current_value}
          metricUnit={row.metric_unit}
          onCancel={onToggleRecord}
          onSaved={onSaved}
        />
      )}
    </li>
  );
}

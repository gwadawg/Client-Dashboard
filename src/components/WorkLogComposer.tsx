"use client";

import { useEffect, useState } from "react";
import {
  metricValue,
  SUCCESS_METRIC_META,
  type ClientHealthSnapshot,
  type SuccessMetricKey,
} from "@/lib/client-health";
import { defaultReviewDateFromTimebox } from "@/lib/client-health-interventions";
import { normalizeReportingType } from "@/lib/kpi-layouts";
import { todayYmdInCallCenterTz } from "@/lib/time";
import {
  BET_CATEGORIES,
  WORK_TYPE_META,
  WORK_TYPES,
  betRequiresLoom,
  isValidLoomUrl,
  type BetCategoryId,
  type WorkType,
} from "@/lib/client-work-log";

const inputStyle = {
  background: "#050c18",
  border: "1px solid rgba(255,255,255,0.12)",
  color: "#e2e8f0",
  borderRadius: "0.5rem",
  padding: "0.5rem 0.75rem",
  fontSize: "0.8125rem",
  outline: "none",
  width: "100%",
} as React.CSSProperties;

const labelStyle = {
  fontSize: "0.625rem",
  fontWeight: 700,
  textTransform: "uppercase" as const,
  letterSpacing: "0.08em",
  color: "#475569",
  display: "block",
  marginBottom: "0.25rem",
};

/** Composer modes: work-log types + a dedicated Ads status category (not a DB work_type). */
type ComposerMode = WorkType | "ads";

const ADS_META = {
  label: "Ads",
  hint: "Account ads spend — on or paused. Separate from Finding / Cadence / Bet.",
  tooltip:
    "Use when you turned Meta/ads off or back on for this client.\n\n" +
    "Updates the client ads flag (Roster / Client File / Media Buyer).\n\n" +
    "Not for: killing individual creatives (Ad Library) or logging a KPI bet.",
  color: "#f59e0b",
} as const;

const COMPOSER_MODES: {
  key: ComposerMode;
  label: string;
  color: string;
  hint: string;
  tooltip: string;
}[] = [
  ...WORK_TYPES.map(type => ({
    key: type as ComposerMode,
    label: WORK_TYPE_META[type].label,
    color: WORK_TYPE_META[type].color,
    hint: WORK_TYPE_META[type].hint,
    tooltip: WORK_TYPE_META[type].tooltip,
  })),
  {
    key: "ads",
    label: ADS_META.label,
    color: ADS_META.color,
    hint: ADS_META.hint,
    tooltip: ADS_META.tooltip,
  },
];

function formatMetric(key: string | null, value: number | null): string {
  if (value == null) return "—";
  const meta = key ? SUCCESS_METRIC_META[key as SuccessMetricKey] : undefined;
  if (!meta) return String(Math.round(value * 100) / 100);
  if (meta.unit === "money") return `$${Math.round(value)}`;
  if (meta.unit === "pct") return `${value.toFixed(1)}%`;
  return value.toFixed(3);
}

function targetInputHint(metric: SuccessMetricKey): { placeholder: string; hint: string } {
  const meta = SUCCESS_METRIC_META[metric];
  if (meta.unit === "money") {
    return { placeholder: "e.g. 450", hint: "Enter dollars (no $ sign), e.g. 450 for $450" };
  }
  if (meta.unit === "pct") {
    return { placeholder: "e.g. 18", hint: "Enter percent as a number, e.g. 18 for 18%" };
  }
  return { placeholder: "e.g. 0.35", hint: "Enter the ratio as a decimal, e.g. 0.35" };
}

function defaultReviewDate(days?: number): string {
  if (days) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().split("T")[0];
  }
  return defaultReviewDateFromTimebox("14 days");
}

export type WorkLogComposerProps = {
  clientId: string;
  snapshot?: ClientHealthSnapshot | null;
  defaultLayer?: string | null;
  defaultConstraintLabel?: string | null;
  periodStart?: string;
  periodEnd?: string;
  reportingType?: string;
  defaultReviewDays?: number;
  onSaved?: () => void;
  onCancel?: () => void;
};

export default function WorkLogComposer({
  clientId,
  snapshot = null,
  defaultLayer = null,
  defaultConstraintLabel = null,
  periodStart,
  periodEnd,
  reportingType = "RM",
  defaultReviewDays = 7,
  onSaved,
  onCancel,
}: WorkLogComposerProps) {
  const today = todayYmdInCallCenterTz();
  const [mode, setMode] = useState<ComposerMode>("cadence");
  const [title, setTitle] = useState("");
  const [changeDescription, setChangeDescription] = useState("");
  const [hypothesis, setHypothesis] = useState("");
  const [betCategory, setBetCategory] = useState<BetCategoryId | "">("");
  const [loomUrl, setLoomUrl] = useState("");
  const [successMetric, setSuccessMetric] = useState<SuccessMetricKey>("cpconv");
  const [targetValue, setTargetValue] = useState("");
  const [changeDate, setChangeDate] = useState(today);
  const [plannedDate, setPlannedDate] = useState("");
  const [reviewDate, setReviewDate] = useState(() => defaultReviewDate(defaultReviewDays));
  const [adsPaused, setAdsPaused] = useState(false);
  const [adsNote, setAdsNote] = useState("");
  const [adsLoaded, setAdsLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const workType: WorkType | null = mode === "ads" ? null : mode;
  const modeMeta = COMPOSER_MODES.find(m => m.key === mode)!;

  useEffect(() => {
    if (mode !== "ads") return;
    let cancelled = false;
    setAdsLoaded(false);
    fetch("/api/clients")
      .then(async r => (r.ok ? r.json() : null))
      .then(d => {
        if (cancelled || !d?.clients) return;
        const match = (
          d.clients as Array<{
            id: string;
            ads_paused?: boolean;
            ads_paused_note?: string | null;
          }>
        ).find(c => c.id === clientId);
        if (match) {
          setAdsPaused(!!match.ads_paused);
          setAdsNote(match.ads_paused_note ?? "");
        }
        setAdsLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setAdsLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [mode, clientId]);

  const targetHint = targetInputHint(successMetric);
  const betLive = workType === "bet" ? changeDate || null : null;
  const loomOk = !betRequiresLoom(betLive) || isValidLoomUrl(loomUrl);
  const betReady = Boolean(
    hypothesis.trim() && successMetric && betCategory && loomOk,
  );
  const canSave =
    mode === "ads"
      ? adsLoaded
      : Boolean(title.trim()) && (workType !== "bet" || betReady);

  async function submitAds() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/clients/${clientId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          adsPaused
            ? {
                ads_paused: true,
                ads_paused_note: adsNote.trim() || null,
              }
            : { ads_paused: false },
        ),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Failed to update ads status");
      onSaved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update ads status");
    } finally {
      setSaving(false);
    }
  }

  async function submitWork() {
    if (!workType || !canSave) return;
    setSaving(true);
    setError(null);
    const liveDate = workType === "bet" ? changeDate || null : changeDate || today;
    const status =
      workType === "bet" ? (liveDate ? "in_progress" : "planned") : "in_progress";
    try {
      const res = await fetch("/api/client-actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: clientId,
          title: title.trim(),
          work_type: workType,
          layer: defaultLayer,
          constraint_label: defaultConstraintLabel,
          change_description: changeDescription || null,
          hypothesis: workType === "bet" ? hypothesis.trim() : null,
          ...(workType === "bet"
            ? {
                bet_category: betCategory,
                loom_url: loomUrl.trim() || null,
              }
            : {}),
          success_metric: workType === "bet" ? successMetric : null,
          target_value: workType === "bet" && targetValue ? Number(targetValue) : null,
          change_date: liveDate,
          planned_date: plannedDate || null,
          review_date: workType === "bet" ? reviewDate || null : null,
          status,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Failed to log work");

      setTitle("");
      setChangeDescription("");
      setHypothesis("");
      setBetCategory("");
      setLoomUrl("");
      setTargetValue("");
      setChangeDate(today);
      setPlannedDate("");
      setMode("cadence");
      onSaved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to log work");
    } finally {
      setSaving(false);
    }
  }

  async function submit() {
    if (mode === "ads") return submitAds();
    return submitWork();
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {COMPOSER_MODES.map(metaT => {
          const on = mode === metaT.key;
          return (
            <div key={metaT.key} className="relative group/type">
              <button
                type="button"
                aria-label={`${metaT.label}: ${metaT.hint}`}
                onClick={() => {
                  setMode(metaT.key);
                  setError(null);
                  if (metaT.key !== "ads") {
                    setChangeDate(metaT.key === "bet" ? "" : today);
                  }
                }}
                className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg"
                style={{
                  color: on ? metaT.color : "#64748b",
                  background: on ? `${metaT.color}18` : "transparent",
                  border: `1px solid ${on ? metaT.color : "rgba(255,255,255,0.1)"}`,
                }}
              >
                {metaT.label}
              </button>
              <div
                role="tooltip"
                className="pointer-events-none absolute left-0 top-full z-20 mt-1.5 w-72 max-w-[min(18rem,calc(100vw-2rem))] rounded-lg px-3 py-2.5 opacity-0 shadow-lg transition-opacity duration-150 group-hover/type:opacity-100 group-focus-within/type:opacity-100"
                style={{
                  background: "#0f1c2e",
                  border: `1px solid ${metaT.color}55`,
                  color: "#cbd5e1",
                }}
              >
                <p
                  className="text-[10px] font-bold uppercase tracking-wide mb-1.5"
                  style={{ color: metaT.color }}
                >
                  {metaT.label}
                </p>
                <p className="text-[11px] leading-relaxed whitespace-pre-line">{metaT.tooltip}</p>
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-[10px]" style={{ color: "#475569" }}>
        {modeMeta.hint}
      </p>

      {mode === "ads" ? (
        <>
          {!adsLoaded ? (
            <p className="text-xs" style={{ color: "#64748b" }}>
              Loading ads status…
            </p>
          ) : (
            <>
              <div>
                <label style={labelStyle}>Ads status *</label>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setAdsPaused(false)}
                    className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg"
                    style={{
                      color: !adsPaused ? "#34d399" : "#64748b",
                      background: !adsPaused ? "rgba(52,211,153,0.15)" : "transparent",
                      border: `1px solid ${!adsPaused ? "rgba(52,211,153,0.4)" : "rgba(255,255,255,0.1)"}`,
                    }}
                  >
                    Ads on
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdsPaused(true)}
                    className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg"
                    style={{
                      color: adsPaused ? "#f59e0b" : "#64748b",
                      background: adsPaused ? "rgba(245,158,11,0.15)" : "transparent",
                      border: `1px solid ${adsPaused ? "rgba(245,158,11,0.4)" : "rgba(255,255,255,0.1)"}`,
                    }}
                  >
                    Ads paused
                  </button>
                </div>
              </div>
              {adsPaused && (
                <div>
                  <label style={labelStyle}>Note (optional)</label>
                  <input
                    style={inputStyle}
                    value={adsNote}
                    onChange={e => setAdsNote(e.target.value)}
                    placeholder="e.g. Client request, CPL kill, budget hold"
                  />
                </div>
              )}
            </>
          )}
        </>
      ) : (
        <>
          <div>
            <label style={labelStyle}>
              {workType === "finding"
                ? "What did you find?"
                : workType === "cadence"
                  ? "What did you do?"
                  : "What is the bet?"}{" "}
              *
            </label>
            <input
              style={inputStyle}
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder={
                workType === "finding"
                  ? "e.g. Pixel firing twice on thank-you page"
                  : workType === "cadence"
                    ? "e.g. Killed underperforming ads"
                    : "e.g. New LTO offer on landing page"
              }
            />
          </div>
          <div>
            <label style={labelStyle}>Details</label>
            <textarea
              style={{ ...inputStyle, minHeight: 60, resize: "vertical" }}
              value={changeDescription}
              onChange={e => setChangeDescription(e.target.value)}
            />
          </div>
          {workType === "bet" && (
            <>
              <div>
                <label style={labelStyle}>Action category *</label>
                <select
                  style={inputStyle as React.CSSProperties}
                  value={betCategory}
                  onChange={e => setBetCategory(e.target.value as BetCategoryId | "")}
                >
                  <option value="">Select category…</option>
                  {BET_CATEGORIES.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.group} · {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Hypothesis (why it should help) *</label>
                <textarea
                  style={{ ...inputStyle, minHeight: 60, resize: "vertical" }}
                  value={hypothesis}
                  onChange={e => setHypothesis(e.target.value)}
                />
              </div>
              <div>
                <label style={labelStyle}>
                  Loom walkthrough {betRequiresLoom(changeDate || null) ? "*" : "(required when live)"}
                </label>
                <input
                  style={inputStyle}
                  type="url"
                  value={loomUrl}
                  onChange={e => setLoomUrl(e.target.value)}
                  placeholder="https://www.loom.com/share/…"
                />
                <p className="text-[10px] mt-1" style={{ color: "#475569" }}>
                  Record what changed and why. Required before marking the bet live.
                </p>
                {loomUrl.trim() && !isValidLoomUrl(loomUrl) && (
                  <p className="text-[10px] mt-1 text-rose-400">
                    Must be a loom.com link.
                  </p>
                )}
              </div>
            </>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label style={labelStyle}>
                {workType === "finding" ? "Observed date" : "Planned date"}
              </label>
              {workType === "finding" ? (
                <input
                  style={inputStyle}
                  type="date"
                  value={changeDate}
                  onChange={e => setChangeDate(e.target.value)}
                />
              ) : (
                <input
                  style={inputStyle}
                  type="date"
                  value={plannedDate}
                  onChange={e => setPlannedDate(e.target.value)}
                />
              )}
            </div>
            {workType !== "finding" && (
              <div>
                <label style={labelStyle}>
                  {workType === "bet" ? "Went live (leave blank if planned)" : "Done date"}
                </label>
                <input
                  style={inputStyle}
                  type="date"
                  value={changeDate}
                  onChange={e => setChangeDate(e.target.value)}
                />
              </div>
            )}
          </div>
          {workType === "bet" && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label style={labelStyle}>Success metric *</label>
                <select
                  style={inputStyle as React.CSSProperties}
                  value={successMetric}
                  onChange={e => setSuccessMetric(e.target.value as SuccessMetricKey)}
                >
                  {Object.entries(SUCCESS_METRIC_META).map(([key, meta]) => (
                    <option key={key} value={key}>
                      {meta.label}
                    </option>
                  ))}
                </select>
                {snapshot && periodStart && periodEnd && (
                  <p className="text-[10px] mt-1" style={{ color: "#475569" }}>
                    Current period ({periodStart} → {periodEnd}):{" "}
                    {formatMetric(
                      successMetric,
                      metricValue(snapshot, successMetric, normalizeReportingType(reportingType)),
                    )}
                  </p>
                )}
              </div>
              <div>
                <label style={labelStyle}>Target value</label>
                <input
                  style={inputStyle}
                  type="number"
                  value={targetValue}
                  onChange={e => setTargetValue(e.target.value)}
                  placeholder={targetHint.placeholder}
                />
                <p className="text-[10px] mt-1" style={{ color: "#475569" }}>
                  {targetHint.hint}
                </p>
              </div>
              <div>
                <label style={labelStyle}>Review date</label>
                <input
                  style={inputStyle}
                  type="date"
                  value={reviewDate}
                  onChange={e => setReviewDate(e.target.value)}
                />
              </div>
            </div>
          )}
        </>
      )}

      {error && <p className="text-xs text-rose-400">{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={saving || !canSave}
          className="px-4 py-2 rounded-lg text-sm font-semibold"
          style={{
            background: canSave
              ? mode === "ads"
                ? "rgba(245,158,11,0.2)"
                : "rgba(96,165,250,0.2)"
              : "rgba(100,116,139,0.15)",
            color: canSave
              ? mode === "ads"
                ? "#f59e0b"
                : "#60a5fa"
              : "#475569",
            border: `1px solid ${
              mode === "ads" ? "rgba(245,158,11,0.35)" : "rgba(96,165,250,0.3)"
            }`,
          }}
        >
          {saving
            ? "Saving…"
            : mode === "ads"
              ? adsPaused
                ? "Save ads paused"
                : "Save ads on"
              : workType === "bet" && !changeDate
                ? "Save planned bet"
                : "Save"}
        </button>
        {onCancel && (
          <button type="button" className="text-xs text-slate-500" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

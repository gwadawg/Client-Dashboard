"use client";

import { useState } from "react";
import {
  metricValue,
  SUCCESS_METRIC_META,
  type ClientHealthSnapshot,
  type SuccessMetricKey,
} from "@/lib/client-health";
import { defaultReviewDateFromTimebox } from "@/lib/client-health-interventions";
import { normalizeReportingType } from "@/lib/kpi-layouts";
import { todayYmdInCallCenterTz } from "@/lib/time";
import { WORK_TYPE_META, WORK_TYPES, type WorkType } from "@/lib/client-work-log";

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
  const [workType, setWorkType] = useState<WorkType>("cadence");
  const [title, setTitle] = useState("");
  const [changeDescription, setChangeDescription] = useState("");
  const [hypothesis, setHypothesis] = useState("");
  const [successMetric, setSuccessMetric] = useState<SuccessMetricKey>("cpconv");
  const [targetValue, setTargetValue] = useState("");
  const [changeDate, setChangeDate] = useState(today);
  const [plannedDate, setPlannedDate] = useState("");
  const [reviewDate, setReviewDate] = useState(() => defaultReviewDate(defaultReviewDays));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const targetHint = targetInputHint(successMetric);
  const betReady = Boolean(hypothesis.trim() && successMetric);
  const canSave = Boolean(title.trim()) && (workType !== "bet" || betReady);

  async function submit() {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    const betLive = workType === "bet" ? changeDate || null : changeDate || today;
    const status =
      workType === "bet" ? (betLive ? "in_progress" : "planned") : "in_progress";
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
          success_metric: workType === "bet" ? successMetric : null,
          target_value: workType === "bet" && targetValue ? Number(targetValue) : null,
          change_date: workType === "bet" ? betLive : betLive,
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
      setTargetValue("");
      setChangeDate(today);
      setPlannedDate("");
      setWorkType("cadence");
      onSaved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to log work");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {WORK_TYPES.map(type => {
          const on = workType === type;
          const metaT = WORK_TYPE_META[type];
          return (
            <button
              key={type}
              type="button"
              onClick={() => {
                setWorkType(type);
                setChangeDate(type === "bet" ? "" : today);
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
          );
        })}
      </div>
      <p className="text-[10px]" style={{ color: "#475569" }}>
        {WORK_TYPE_META[workType].hint}
      </p>
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
        <div>
          <label style={labelStyle}>Hypothesis (why it should help) *</label>
          <textarea
            style={{ ...inputStyle, minHeight: 60, resize: "vertical" }}
            value={hypothesis}
            onChange={e => setHypothesis(e.target.value)}
          />
        </div>
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
      {error && <p className="text-xs text-rose-400">{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={saving || !canSave}
          className="px-4 py-2 rounded-lg text-sm font-semibold"
          style={{
            background: canSave ? "rgba(96,165,250,0.2)" : "rgba(100,116,139,0.15)",
            color: canSave ? "#60a5fa" : "#475569",
            border: "1px solid rgba(96,165,250,0.3)",
          }}
        >
          {saving
            ? "Saving…"
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

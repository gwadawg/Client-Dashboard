"use client";

import { useCallback, useEffect, useState } from "react";
import {
  metricValue,
  SUCCESS_METRIC_META,
  type ClientHealthSnapshot,
  type SuccessMetricKey,
} from "@/lib/client-health";

export type ActionLog = {
  id: string;
  client_id: string;
  created_at: string;
  title: string;
  layer: string | null;
  constraint_label: string | null;
  change_description: string | null;
  hypothesis: string | null;
  success_metric: string | null;
  baseline_value: number | null;
  target_value: number | null;
  status: string;
  review_date: string | null;
  outcome_value: number | null;
  outcome_notes: string | null;
  outcome_recorded_at: string | null;
  ai_generated: boolean;
};

type Props = {
  clientId: string;
  snapshot: ClientHealthSnapshot;
  defaultLayer: string;
  defaultConstraintLabel: string;
  /** Bumps to force a reload (e.g. after an AI action item is saved). */
  reloadKey?: number;
};

const STATUS_OPTIONS = ["planned", "in_progress", "measuring", "succeeded", "failed", "abandoned"];

const STATUS_COLOR: Record<string, string> = {
  planned: "#94a3b8",
  in_progress: "#60a5fa",
  measuring: "#fbbf24",
  succeeded: "#34d399",
  failed: "#f87171",
  abandoned: "#64748b",
};

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
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: "#475569",
  display: "block",
  marginBottom: "0.25rem",
} as React.CSSProperties;

function formatMetric(key: string | null, value: number | null): string {
  if (value == null) return "—";
  const meta = key ? SUCCESS_METRIC_META[key as SuccessMetricKey] : undefined;
  if (!meta) return String(Math.round(value * 100) / 100);
  if (meta.unit === "money") return `$${Math.round(value)}`;
  if (meta.unit === "pct") return `${value.toFixed(1)}%`;
  return value.toFixed(3);
}

export default function ClientActionLog({
  clientId,
  snapshot,
  defaultLayer,
  defaultConstraintLabel,
  reloadKey = 0,
}: Props) {
  const [actions, setActions] = useState<ActionLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  // form state
  const [title, setTitle] = useState("");
  const [changeDescription, setChangeDescription] = useState("");
  const [hypothesis, setHypothesis] = useState("");
  const [successMetric, setSuccessMetric] = useState<SuccessMetricKey>("cpconv");
  const [targetValue, setTargetValue] = useState("");
  const [reviewDate, setReviewDate] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/client-actions?client_id=${clientId}`)
      .then(r => r.json())
      .then(d => {
        setActions(d.actions ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [clientId]);

  useEffect(() => {
    load();
  }, [load, reloadKey]);

  const resetForm = () => {
    setTitle("");
    setChangeDescription("");
    setHypothesis("");
    setSuccessMetric("cpconv");
    setTargetValue("");
    setReviewDate("");
  };

  const submit = async () => {
    if (!title.trim()) return;
    setSaving(true);
    const baseline = metricValue(snapshot, successMetric);
    const res = await fetch(`/api/client-actions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        title: title.trim(),
        layer: defaultLayer,
        constraint_label: defaultConstraintLabel,
        change_description: changeDescription || null,
        hypothesis: hypothesis || null,
        success_metric: successMetric,
        baseline_value: baseline,
        target_value: targetValue ? Number(targetValue) : null,
        review_date: reviewDate || null,
        status: "planned",
      }),
    });
    setSaving(false);
    if (res.ok) {
      resetForm();
      setShowForm(false);
      load();
    }
  };

  const recordOutcome = async (action: ActionLog) => {
    const raw = window.prompt(
      `Record current ${SUCCESS_METRIC_META[(action.success_metric as SuccessMetricKey) ?? "cpconv"]?.label ?? action.success_metric} value:`,
      action.success_metric ? String(Math.round(metricValue(snapshot, action.success_metric as SuccessMetricKey) * 100) / 100) : "",
    );
    if (raw == null) return;
    const outcomeValue = Number(raw);
    if (Number.isNaN(outcomeValue)) return;

    const meta = action.success_metric ? SUCCESS_METRIC_META[action.success_metric as SuccessMetricKey] : undefined;
    let status = "measuring";
    if (meta && action.baseline_value != null) {
      const improved = meta.lowerIsBetter
        ? outcomeValue < action.baseline_value
        : outcomeValue > action.baseline_value;
      status = improved ? "succeeded" : "failed";
    }
    const notes = window.prompt("Outcome notes (optional):", action.outcome_notes ?? "") ?? null;

    const res = await fetch(`/api/client-actions/${action.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ outcome_value: outcomeValue, outcome_notes: notes, status }),
    });
    if (res.ok) load();
  };

  const updateStatus = async (action: ActionLog, status: string) => {
    const res = await fetch(`/api/client-actions/${action.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) load();
  };

  const remove = async (action: ActionLog) => {
    if (!window.confirm("Delete this log entry?")) return;
    const res = await fetch(`/api/client-actions/${action.id}`, { method: "DELETE" });
    if (res.ok) load();
  };

  return (
    <div className="rounded-xl p-5" style={{ background: "#0a1628", border: "1px solid rgba(255,255,255,0.06)" }}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-base font-semibold" style={{ color: "#e2e8f0" }}>
            Change log & progress
          </h3>
          <p className="text-xs mt-0.5" style={{ color: "#475569" }}>
            Log what you changed, then record the outcome to see if it moved the metric.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm(v => !v)}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold"
          style={{ background: "rgba(52,211,153,0.15)", color: "#34d399", border: "1px solid rgba(52,211,153,0.3)" }}
        >
          {showForm ? "Cancel" : "+ Log a change"}
        </button>
      </div>

      {showForm && (
        <div
          className="rounded-lg p-4 mb-4 space-y-3"
          style={{ background: "#050c18", border: "1px solid rgba(255,255,255,0.05)" }}
        >
          <div>
            <label style={labelStyle}>What did you change? *</label>
            <input
              style={inputStyle}
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Rotated 4 new creatives, paused worst ad set"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label style={labelStyle}>Details</label>
              <textarea
                style={{ ...inputStyle, minHeight: 60, resize: "vertical" }}
                value={changeDescription}
                onChange={e => setChangeDescription(e.target.value)}
              />
            </div>
            <div>
              <label style={labelStyle}>Hypothesis (why it should help)</label>
              <textarea
                style={{ ...inputStyle, minHeight: 60, resize: "vertical" }}
                value={hypothesis}
                onChange={e => setHypothesis(e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label style={labelStyle}>Success metric</label>
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
              <p className="text-[10px] mt-1" style={{ color: "#475569" }}>
                Baseline now: {formatMetric(successMetric, metricValue(snapshot, successMetric))}
              </p>
            </div>
            <div>
              <label style={labelStyle}>Target value</label>
              <input
                style={inputStyle}
                type="number"
                value={targetValue}
                onChange={e => setTargetValue(e.target.value)}
                placeholder="optional"
              />
            </div>
            <div>
              <label style={labelStyle}>Review date</label>
              <input style={inputStyle} type="date" value={reviewDate} onChange={e => setReviewDate(e.target.value)} />
            </div>
          </div>
          <button
            type="button"
            onClick={submit}
            disabled={saving || !title.trim()}
            className="px-4 py-2 rounded-lg text-sm font-semibold"
            style={{
              background: title.trim() ? "rgba(96,165,250,0.2)" : "rgba(100,116,139,0.15)",
              color: title.trim() ? "#60a5fa" : "#475569",
              border: "1px solid rgba(96,165,250,0.3)",
            }}
          >
            {saving ? "Saving…" : "Save change"}
          </button>
        </div>
      )}

      {loading ? (
        <p className="text-sm py-4" style={{ color: "#334155" }}>
          Loading log…
        </p>
      ) : actions.length === 0 ? (
        <p className="text-sm py-4" style={{ color: "#334155" }}>
          No changes logged yet. Log the first intervention to start tracking progress.
        </p>
      ) : (
        <ol className="space-y-3">
          {actions.map(a => {
            const meta = a.success_metric ? SUCCESS_METRIC_META[a.success_metric as SuccessMetricKey] : undefined;
            let delta: { improved: boolean; text: string } | null = null;
            if (a.outcome_value != null && a.baseline_value != null && meta) {
              const improved = meta.lowerIsBetter
                ? a.outcome_value < a.baseline_value
                : a.outcome_value > a.baseline_value;
              delta = {
                improved,
                text: `${formatMetric(a.success_metric, a.baseline_value)} → ${formatMetric(a.success_metric, a.outcome_value)}`,
              };
            }
            return (
              <li
                key={a.id}
                className="rounded-lg px-4 py-3"
                style={{ background: "#050c18", border: "1px solid rgba(255,255,255,0.05)" }}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span
                        className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded"
                        style={{ background: `${STATUS_COLOR[a.status]}22`, color: STATUS_COLOR[a.status] }}
                      >
                        {a.status.replace("_", " ")}
                      </span>
                      {a.layer && a.layer !== "NONE" && (
                        <span className="text-[10px]" style={{ color: "#64748b" }}>
                          {a.layer}
                        </span>
                      )}
                      {a.ai_generated && (
                        <span className="text-[10px] px-1 rounded" style={{ background: "rgba(167,139,250,0.18)", color: "#a78bfa" }}>
                          AI
                        </span>
                      )}
                      <span className="text-[10px]" style={{ color: "#475569" }}>
                        {new Date(a.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-sm font-medium" style={{ color: "#e2e8f0" }}>
                      {a.title}
                    </p>
                    {a.change_description && (
                      <p className="text-xs mt-1" style={{ color: "#94a3b8" }}>
                        {a.change_description}
                      </p>
                    )}
                    {a.hypothesis && (
                      <p className="text-xs mt-1 italic" style={{ color: "#64748b" }}>
                        Hypothesis: {a.hypothesis}
                      </p>
                    )}
                    {a.success_metric && (
                      <p className="text-xs mt-1.5" style={{ color: "#475569" }}>
                        Tracking {meta?.label ?? a.success_metric}
                        {a.target_value != null ? ` · target ${formatMetric(a.success_metric, a.target_value)}` : ""}
                        {delta ? (
                          <span style={{ color: delta.improved ? "#34d399" : "#f87171" }}>
                            {" "}
                            · {delta.improved ? "improved" : "worse"} {delta.text}
                          </span>
                        ) : a.baseline_value != null ? (
                          <span> · baseline {formatMetric(a.success_metric, a.baseline_value)}</span>
                        ) : null}
                      </p>
                    )}
                    {a.outcome_notes && (
                      <p className="text-xs mt-1" style={{ color: "#94a3b8" }}>
                        Outcome: {a.outcome_notes}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <select
                      value={a.status}
                      onChange={e => updateStatus(a, e.target.value)}
                      className="text-[11px] rounded px-1.5 py-1"
                      style={{ background: "#0f2040", border: "1px solid rgba(255,255,255,0.12)", color: "#94a3b8" }}
                    >
                      {STATUS_OPTIONS.map(s => (
                        <option key={s} value={s}>
                          {s.replace("_", " ")}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => recordOutcome(a)}
                      className="text-[11px] px-2 py-1 rounded font-semibold"
                      style={{ background: "rgba(251,191,36,0.15)", color: "#fbbf24" }}
                    >
                      Record outcome
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(a)}
                      className="text-[11px] px-1.5 py-1 rounded"
                      style={{ color: "#64748b" }}
                      title="Delete"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

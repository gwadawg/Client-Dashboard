"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  SUCCESS_METRIC_META,
  type ClientHealthSnapshot,
  type SuccessMetricKey,
} from "@/lib/client-health";
import { defaultReviewDateFromTimebox, BASELINE_LOOKBACK_DAYS } from "@/lib/client-health-interventions";
import {
  BET_CATEGORIES,
  WORK_TYPE_META,
  WORK_TYPES,
  betCategoryLabel,
  isBetWorkType,
  isValidLoomUrl,
  parseWorkType,
  type BetCategoryId,
  type WorkType,
} from "@/lib/client-work-log";
import WorkLogComposer from "./WorkLogComposer";

export type ActionLog = {
  id: string;
  client_id: string;
  created_at: string;
  change_date: string | null;
  planned_date: string | null;
  work_type: WorkType | string | null;
  title: string;
  layer: string | null;
  constraint_label: string | null;
  change_description: string | null;
  hypothesis: string | null;
  bet_category?: string | null;
  loom_url?: string | null;
  success_metric: string | null;
  baseline_value: number | null;
  target_value: number | null;
  baseline_snapshot_id: string | null;
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
  periodStart: string;
  periodEnd: string;
  reportingType?: string;
  defaultReviewDays?: number;
  reloadKey?: number;
};

const STATUS_OPTIONS = ["planned", "in_progress", "measuring", "succeeded", "failed", "abandoned"];

const STATUS_HELP: Record<string, string> = {
  planned: "Change not started yet",
  in_progress: "Change is live — measuring from change date",
  measuring: "Review window active — waiting for enough data or final verdict",
  succeeded: "Target hit or metric improved vs baseline",
  failed: "Metric did not improve by review date",
  abandoned: "Stopped tracking this change",
};

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

function defaultReviewDate(days?: number): string {
  if (days) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().split("T")[0];
  }
  return defaultReviewDateFromTimebox("14 days");
}

function todayYmd(): string {
  return new Date().toISOString().split("T")[0];
}

export default function ClientActionLog({
  clientId,
  snapshot,
  defaultLayer,
  defaultConstraintLabel,
  periodStart,
  periodEnd,
  reportingType = "RM",
  defaultReviewDays = 14,
  reloadKey = 0,
}: Props) {
  const [actions, setActions] = useState<ActionLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [filter, setFilter] = useState<"all" | WorkType>("all");
  const [promoteId, setPromoteId] = useState<string | null>(null);

  const [promoteHypothesis, setPromoteHypothesis] = useState("");
  const [promoteCategory, setPromoteCategory] = useState<BetCategoryId | "">("");
  const [promoteLoom, setPromoteLoom] = useState("");
  const [promoteMetric, setPromoteMetric] = useState<SuccessMetricKey>("cpconv");
  const [promoteReview, setPromoteReview] = useState(() => defaultReviewDate(7));
  const [promoteLive, setPromoteLive] = useState(todayYmd);

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
    let cancelled = false;
    fetch(`/api/client-actions?client_id=${clientId}`)
      .then(r => r.json())
      .then(async d => {
        if (cancelled) return;
        const list = (d.actions ?? []) as ActionLog[];
        setActions(list);
        setLoading(false);
        const today = todayYmd();
        const due = list.filter(
          a =>
            isBetWorkType(a.work_type) &&
            a.review_date &&
            a.review_date <= today &&
            !a.outcome_recorded_at &&
            ["planned", "in_progress", "measuring"].includes(a.status),
        );
        if (due.length === 0) return;
        setEvaluating(true);
        await fetch("/api/client-actions", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action_ids: due.map(a => a.id) }),
        });
        if (!cancelled) {
          const refreshed = await fetch(`/api/client-actions?client_id=${clientId}`).then(r => r.json());
          setActions(refreshed.actions ?? []);
        }
        setEvaluating(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [clientId, reloadKey]);

  const runEval = async (actionId: string) => {
    setEvaluating(true);
    const res = await fetch("/api/client-actions", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action_ids: [actionId] }),
    });
    setEvaluating(false);
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

  const promote = async (action: ActionLog) => {
    if (!promoteCategory || !promoteHypothesis.trim()) return;
    if (promoteLive && !isValidLoomUrl(promoteLoom)) return;
    setSaving(true);
    const res = await fetch(`/api/client-actions/${action.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        promote: true,
        hypothesis: promoteHypothesis.trim(),
        bet_category: promoteCategory,
        loom_url: promoteLoom.trim() || null,
        success_metric: promoteMetric,
        review_date: promoteReview,
        change_date: promoteLive || null,
        status: promoteLive ? "in_progress" : "planned",
      }),
    });
    setSaving(false);
    if (res.ok) {
      setPromoteId(null);
      setPromoteCategory("");
      setPromoteLoom("");
      load();
    }
  };

  const visible = useMemo(
    () => (filter === "all" ? actions : actions.filter(a => parseWorkType(a.work_type, "bet") === filter)),
    [actions, filter],
  );

  return (
    <div className="rounded-xl p-5" style={{ background: "#0a1628", border: "1px solid rgba(255,255,255,0.06)" }}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-base font-semibold" style={{ color: "#e2e8f0" }}>
            Work log
          </h3>
          <p className="text-xs mt-0.5" style={{ color: "#475569" }}>
            Findings and cadence stay on the strip. Bets freeze a {BASELINE_LOOKBACK_DAYS}-day baseline when they go live.
            {evaluating ? " Evaluating due reviews…" : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm(v => !v)}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold"
          style={{ background: "rgba(52,211,153,0.15)", color: "#34d399", border: "1px solid rgba(52,211,153,0.3)" }}
        >
          {showForm ? "Cancel" : "+ Log work"}
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-3">
        {(["all", ...WORK_TYPES] as const).map(key => {
          const on = filter === key;
          const label = key === "all" ? "All" : WORK_TYPE_META[key].label;
          const color = key === "all" ? "#94a3b8" : WORK_TYPE_META[key].color;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className="text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-full"
              style={{
                color: on ? color : "#475569",
                background: on ? `${color}22` : "transparent",
                border: `1px solid ${on ? color : "rgba(255,255,255,0.1)"}`,
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {showForm && (
        <div
          className="rounded-lg p-4 mb-4"
          style={{ background: "#050c18", border: "1px solid rgba(255,255,255,0.05)" }}
        >
          <WorkLogComposer
            clientId={clientId}
            snapshot={snapshot}
            defaultLayer={defaultLayer}
            defaultConstraintLabel={defaultConstraintLabel}
            periodStart={periodStart}
            periodEnd={periodEnd}
            reportingType={reportingType}
            defaultReviewDays={defaultReviewDays}
            onSaved={() => {
              setShowForm(false);
              load();
            }}
            onCancel={() => setShowForm(false)}
          />
        </div>
      )}

      {loading ? (
        <p className="text-sm py-4" style={{ color: "#334155" }}>
          Loading log…
        </p>
      ) : visible.length === 0 ? (
        <p className="text-sm py-4" style={{ color: "#334155" }}>
          No work logged yet for this filter.
        </p>
      ) : (
        <ol className="space-y-3">
          {visible.map(a => {
            const type = parseWorkType(a.work_type, "bet");
            const typeMeta = WORK_TYPE_META[type];
            const meta = a.success_metric ? SUCCESS_METRIC_META[a.success_metric as SuccessMetricKey] : undefined;
            let delta: { improved: boolean; text: string } | null = null;
            if (a.outcome_value != null && a.baseline_value != null && meta) {
              const hitTarget =
                a.target_value != null
                  ? meta.lowerIsBetter
                    ? a.outcome_value <= a.target_value
                    : a.outcome_value >= a.target_value
                  : null;
              const improved = meta.lowerIsBetter
                ? a.outcome_value < a.baseline_value
                : a.outcome_value > a.baseline_value;
              delta = {
                improved: hitTarget ?? improved,
                text: `${formatMetric(a.success_metric, a.baseline_value)} → ${formatMetric(a.success_metric, a.outcome_value)}`,
              };
            }
            const reviewDue =
              type === "bet" &&
              a.review_date &&
              a.review_date <= todayYmd() &&
              !a.outcome_recorded_at;

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
                        style={{ background: `${typeMeta.color}22`, color: typeMeta.color }}
                      >
                        {typeMeta.label}
                      </span>
                      {type === "bet" && (
                        <span
                          className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded"
                          style={{ background: `${STATUS_COLOR[a.status]}22`, color: STATUS_COLOR[a.status] }}
                        >
                          {a.status.replace("_", " ")}
                        </span>
                      )}
                      {type === "bet" && a.bet_category && (
                        <span
                          className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                          style={{ background: "rgba(148,163,184,0.12)", color: "#94a3b8" }}
                        >
                          {betCategoryLabel(a.bet_category)}
                        </span>
                      )}
                      {reviewDue && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: "rgba(251,191,36,0.15)", color: "#fbbf24" }}>
                          Review due
                        </span>
                      )}
                      {a.planned_date && (
                        <span className="text-[10px]" style={{ color: "#475569" }}>
                          planned {a.planned_date}
                        </span>
                      )}
                      {a.change_date && (
                        <span className="text-[10px]" style={{ color: "#475569" }}>
                          {type === "finding" ? "observed" : type === "bet" ? "live" : "done"} {a.change_date}
                        </span>
                      )}
                      {a.review_date && type === "bet" && (
                        <span className="text-[10px]" style={{ color: "#475569" }}>
                          review {a.review_date}
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-medium" style={{ color: "#e2e8f0" }}>
                      {a.title}
                    </p>
                    {type === "bet" && a.loom_url && (
                      <a
                        href={a.loom_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs mt-1 inline-block"
                        style={{ color: "#60a5fa" }}
                      >
                        Watch Loom →
                      </a>
                    )}
                    {a.success_metric && type === "bet" && (
                      <p className="text-xs mt-1.5" style={{ color: "#475569" }}>
                        Tracking {meta?.label ?? a.success_metric}
                        {a.target_value != null ? ` · target ${formatMetric(a.success_metric, a.target_value)}` : ""}
                        {delta ? (
                          <span style={{ color: delta.improved ? "#34d399" : "#f87171" }}>
                            {" "}· {delta.improved ? "worked" : "did not work"} {delta.text}
                          </span>
                        ) : a.baseline_value != null ? (
                          <span> · baseline {formatMetric(a.success_metric, a.baseline_value)}</span>
                        ) : null}
                      </p>
                    )}
                    {a.outcome_notes && (
                      <p className="text-xs mt-1 italic" style={{ color: "#94a3b8" }}>
                        {a.outcome_notes}
                      </p>
                    )}
                    {type === "finding" && promoteId === a.id && (
                      <div className="mt-3 space-y-2 rounded-md p-3" style={{ border: "1px solid rgba(96,165,250,0.25)" }}>
                        <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: "#60a5fa" }}>
                          Promote to bet
                        </p>
                        <select
                          style={inputStyle}
                          value={promoteCategory}
                          onChange={e => setPromoteCategory(e.target.value as BetCategoryId | "")}
                        >
                          <option value="">Action category *</option>
                          {BET_CATEGORIES.map(c => (
                            <option key={c.id} value={c.id}>
                              {c.group} · {c.label}
                            </option>
                          ))}
                        </select>
                        <textarea
                          style={{ ...inputStyle, minHeight: 48 }}
                          placeholder="Hypothesis *"
                          value={promoteHypothesis}
                          onChange={e => setPromoteHypothesis(e.target.value)}
                        />
                        <input
                          style={inputStyle}
                          type="url"
                          placeholder="Loom URL (required if live)"
                          value={promoteLoom}
                          onChange={e => setPromoteLoom(e.target.value)}
                        />
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <select
                            style={inputStyle}
                            value={promoteMetric}
                            onChange={e => setPromoteMetric(e.target.value as SuccessMetricKey)}
                          >
                            {Object.entries(SUCCESS_METRIC_META).map(([key, m]) => (
                              <option key={key} value={key}>{m.label}</option>
                            ))}
                          </select>
                          <input style={inputStyle} type="date" value={promoteLive} onChange={e => setPromoteLive(e.target.value)} title="Went live (blank = planned)" />
                          <input style={inputStyle} type="date" value={promoteReview} onChange={e => setPromoteReview(e.target.value)} />
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={
                              saving ||
                              !promoteCategory ||
                              !promoteHypothesis.trim() ||
                              (Boolean(promoteLive) && !isValidLoomUrl(promoteLoom))
                            }
                            onClick={() => promote(a)}
                            className="text-[11px] px-2 py-1 rounded font-semibold"
                            style={{ background: "rgba(96,165,250,0.2)", color: "#60a5fa" }}
                          >
                            {saving ? "Saving…" : promoteLive ? "Promote & freeze baseline" : "Promote as planned bet"}
                          </button>
                          <button type="button" className="text-[11px] text-slate-500" onClick={() => setPromoteId(null)}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {type === "finding" && promoteId !== a.id && (
                      <button
                        type="button"
                        onClick={() => {
                          setPromoteId(a.id);
                          setPromoteHypothesis("");
                          setPromoteMetric("cpconv");
                          setPromoteLive(a.change_date || todayYmd());
                          setPromoteReview(defaultReviewDate(7));
                        }}
                        className="text-[11px] px-2 py-1 rounded font-semibold"
                        style={{ color: "#60a5fa" }}
                      >
                        Promote
                      </button>
                    )}
                    {type === "bet" && (
                      <select
                        value={a.status}
                        onChange={e => updateStatus(a, e.target.value)}
                        className="text-[11px] rounded px-1.5 py-1"
                        style={{ background: "#0f2040", border: "1px solid rgba(255,255,255,0.12)", color: "#94a3b8" }}
                        title={STATUS_HELP[a.status] ?? ""}
                      >
                        {STATUS_OPTIONS.map(s => (
                          <option key={s} value={s}>
                            {s.replace("_", " ")}
                          </option>
                        ))}
                      </select>
                    )}
                    {type === "bet" && (reviewDue || a.status === "measuring") && (
                      <button
                        type="button"
                        onClick={() => runEval(a.id)}
                        disabled={evaluating}
                        className="text-[11px] px-2 py-1 rounded font-semibold"
                        style={{ background: "rgba(251,191,36,0.15)", color: "#fbbf24" }}
                      >
                        Evaluate
                      </button>
                    )}
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

"use client";

import { useEffect, useState } from "react";
import {
  SUCCESS_METRIC_META,
  type SuccessMetricKey,
} from "@/lib/client-health";
import { actionChangeDate } from "@/lib/client-health-interventions";

type Intervention = {
  id: string;
  title: string;
  status: string;
  success_metric: string | null;
  change_date: string | null;
  created_at: string;
  review_date: string | null;
  baseline_value: number | null;
  target_value: number | null;
  outcome_value: number | null;
  outcome_notes: string | null;
  change_description: string | null;
  hypothesis: string | null;
  constraint_label: string | null;
};

const STATUS_COLOR: Record<string, string> = {
  planned: "#94a3b8",
  in_progress: "#60a5fa",
  measuring: "#fbbf24",
  succeeded: "#34d399",
  failed: "#f87171",
  abandoned: "#64748b",
};

function formatMetric(key: string | null, value: number | null): string {
  if (value == null) return "—";
  const meta = key ? SUCCESS_METRIC_META[key as SuccessMetricKey] : undefined;
  if (!meta) return String(Math.round(value * 100) / 100);
  if (meta.unit === "money") return `$${Math.round(value)}`;
  if (meta.unit === "pct") return `${value.toFixed(1)}%`;
  return value.toFixed(3);
}

type Props = {
  clientId: string;
  compact?: boolean;
};

export default function ClientInterventionHistory({ clientId, compact = false }: Props) {
  const [actions, setActions] = useState<Intervention[]>([]);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/client-actions?client_id=${clientId}`)
      .then(async r => {
        if (r.status === 403) {
          if (!cancelled) {
            setDenied(true);
            setLoading(false);
          }
          return null;
        }
        return r.json();
      })
      .then(d => {
        if (cancelled || !d) return;
        setActions(d.actions ?? []);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  if (denied) return null;

  if (loading) {
    return (
      <p className="text-sm py-4 text-center rounded-lg" style={{ color: "#334155", background: "#080f1e" }}>
        Loading interventions…
      </p>
    );
  }

  if (actions.length === 0) {
    return (
      <p className="text-sm py-4 text-center rounded-lg" style={{ color: "#334155", background: "#080f1e" }}>
        No success interventions logged yet. Log changes from Client Success when you adjust strategy.
      </p>
    );
  }

  const open = actions.filter(a => ["planned", "in_progress", "measuring"].includes(a.status));
  const closed = actions.filter(a => !["planned", "in_progress", "measuring"].includes(a.status));
  const list = compact ? actions.slice(0, 5) : actions;

  return (
    <div className="space-y-4">
      {!compact && open.length > 0 && (
        <p className="text-xs" style={{ color: "#fbbf24" }}>
          {open.length} open — {open.filter(a => a.review_date && a.review_date <= new Date().toISOString().split("T")[0]).length} due for review
        </p>
      )}
      <div className="space-y-2">
        {list.map(a => {
          const meta = a.success_metric ? SUCCESS_METRIC_META[a.success_metric as SuccessMetricKey] : undefined;
          const changeDate = a.change_date ?? actionChangeDate(a);
          const reviewDue =
            a.review_date &&
            a.review_date <= new Date().toISOString().split("T")[0] &&
            ["planned", "in_progress", "measuring"].includes(a.status);
          let delta: string | null = null;
          if (a.outcome_value != null && a.baseline_value != null && meta) {
            delta = `${formatMetric(a.success_metric, a.baseline_value)} → ${formatMetric(a.success_metric, a.outcome_value)}`;
          }

          return (
            <div
              key={a.id}
              className="rounded-lg px-4 py-3"
              style={{ background: "#080f1e", border: "1px solid rgba(255,255,255,0.06)" }}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span
                      className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded"
                      style={{
                        background: `${STATUS_COLOR[a.status] ?? "#64748b"}22`,
                        color: STATUS_COLOR[a.status] ?? "#64748b",
                      }}
                    >
                      {a.status.replace("_", " ")}
                    </span>
                    {reviewDue && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: "rgba(251,191,36,0.15)", color: "#fbbf24" }}>
                        Review due
                      </span>
                    )}
                    <span className="text-[10px]" style={{ color: "#475569" }}>
                      change {changeDate}
                      {a.review_date ? ` · review ${a.review_date}` : ""}
                    </span>
                  </div>
                  <p className="text-sm font-medium" style={{ color: "#e2e8f0" }}>
                    {a.title}
                  </p>
                  {a.constraint_label && (
                    <p className="text-[10px] mt-0.5" style={{ color: "#64748b" }}>
                      {a.constraint_label}
                    </p>
                  )}
                  {a.success_metric && (
                    <p className="text-xs mt-1.5" style={{ color: "#475569" }}>
                      {meta?.label ?? a.success_metric}
                      {a.baseline_value != null ? ` · baseline ${formatMetric(a.success_metric, a.baseline_value)}` : ""}
                      {a.target_value != null ? ` · target ${formatMetric(a.success_metric, a.target_value)}` : ""}
                      {delta ? (
                        <span style={{ color: a.status === "succeeded" ? "#34d399" : a.status === "failed" ? "#f87171" : "#94a3b8" }}>
                          {" "}· {delta}
                        </span>
                      ) : null}
                    </p>
                  )}
                  {a.change_description && !compact && (
                    <p className="text-xs mt-1" style={{ color: "#94a3b8" }}>
                      {a.change_description}
                    </p>
                  )}
                  {a.outcome_notes && (
                    <p className="text-xs mt-1 italic" style={{ color: "#94a3b8" }}>
                      {a.outcome_notes}
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {!compact && closed.length > 0 && (
        <p className="text-[10px]" style={{ color: "#475569" }}>
          {closed.length} completed or abandoned intervention{closed.length === 1 ? "" : "s"} in history above.
        </p>
      )}
    </div>
  );
}

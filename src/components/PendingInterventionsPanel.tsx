"use client";

import {
  SUCCESS_METRIC_META,
  type PendingIntervention,
  type SuccessMetricKey,
} from "@/lib/client-health";
import { usesCallCenterKpiLayout } from "@/lib/kpi-layouts";

type Props = {
  interventions: PendingIntervention[];
  segment: "RM" | "CALL_CENTER";
  onOpenClient: (clientId: string, clientName: string) => void;
};

const STATUS_COLOR: Record<string, string> = {
  planned: "#94a3b8",
  in_progress: "#60a5fa",
  measuring: "#fbbf24",
};

function formatMetric(key: string | null, value: number | null): string {
  if (value == null) return "—";
  const meta = key ? SUCCESS_METRIC_META[key as SuccessMetricKey] : undefined;
  if (!meta) return String(Math.round(value * 100) / 100);
  if (meta.unit === "money") return `$${Math.round(value)}`;
  if (meta.unit === "pct") return `${value.toFixed(1)}%`;
  return value.toFixed(3);
}

export default function PendingInterventionsPanel({ interventions, segment, onOpenClient }: Props) {
  const filtered = interventions.filter(i =>
    segment === "CALL_CENTER"
      ? usesCallCenterKpiLayout(i.reporting_type)
      : !usesCallCenterKpiLayout(i.reporting_type),
  );

  if (filtered.length === 0) return null;

  const reviewDue = filtered.filter(i => i.review_due);
  const tracking = filtered.filter(i => !i.review_due);

  return (
    <div
      className="rounded-xl p-5 space-y-4"
      style={{ background: "#0a1628", border: "1px solid rgba(251,191,36,0.22)" }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold" style={{ color: "#fbbf24" }}>
            Pending review & tracked changes
          </h3>
          <p className="text-xs mt-0.5 max-w-2xl" style={{ color: "#64748b" }}>
            Clients where you logged an intervention and are measuring impact. Review due items need an outcome check.
          </p>
        </div>
        <div className="flex gap-2 text-xs">
          <span className="px-2 py-1 rounded-md font-semibold" style={{ background: "rgba(251,191,36,0.12)", color: "#fbbf24" }}>
            {reviewDue.length} review due
          </span>
          <span className="px-2 py-1 rounded-md font-semibold" style={{ background: "rgba(96,165,250,0.12)", color: "#60a5fa" }}>
            {tracking.length} tracking
          </span>
        </div>
      </div>

      {reviewDue.length > 0 && (
        <InterventionGroup
          label="Review due"
          labelColor="#fbbf24"
          items={reviewDue}
          onOpenClient={onOpenClient}
        />
      )}
      {tracking.length > 0 && (
        <InterventionGroup
          label="In progress"
          labelColor="#60a5fa"
          items={tracking}
          onOpenClient={onOpenClient}
        />
      )}
    </div>
  );
}

function InterventionGroup({
  label,
  labelColor,
  items,
  onOpenClient,
}: {
  label: string;
  labelColor: string;
  items: PendingIntervention[];
  onOpenClient: (clientId: string, clientName: string) => void;
}) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: labelColor }}>
        {label} ({items.length})
      </p>
      <div className="space-y-2">
        {items.map(item => {
          const meta = item.success_metric
            ? SUCCESS_METRIC_META[item.success_metric as SuccessMetricKey]
            : undefined;
          return (
            <div
              key={item.id}
              className="rounded-lg px-4 py-3 flex flex-wrap items-center justify-between gap-3"
              style={{ background: "#050c18", border: "1px solid rgba(255,255,255,0.05)" }}
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span className="text-sm font-semibold" style={{ color: "#e2e8f0" }}>
                    {item.client_name}
                  </span>
                  <span
                    className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded"
                    style={{
                      background: `${STATUS_COLOR[item.status] ?? "#64748b"}22`,
                      color: STATUS_COLOR[item.status] ?? "#64748b",
                    }}
                  >
                    {item.status.replace("_", " ")}
                  </span>
                  {item.overdue && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: "rgba(248,113,113,0.15)", color: "#f87171" }}>
                      Overdue
                    </span>
                  )}
                </div>
                <p className="text-sm" style={{ color: "#cbd5e1" }}>
                  {item.title}
                </p>
                <p className="text-xs mt-1" style={{ color: "#475569" }}>
                  {meta?.label ?? item.success_metric ?? "No metric"}
                  {item.baseline_value != null ? ` · baseline ${formatMetric(item.success_metric, item.baseline_value)}` : ""}
                  {item.outcome_value != null ? ` · now ${formatMetric(item.success_metric, item.outcome_value)}` : ""}
                  {item.change_date ? ` · change ${item.change_date}` : ""}
                  {item.review_date ? ` · review ${item.review_date}` : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onOpenClient(item.client_id, item.client_name)}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg shrink-0"
                style={{ background: "rgba(96,165,250,0.15)", color: "#60a5fa", border: "1px solid rgba(96,165,250,0.3)" }}
              >
                Open client →
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

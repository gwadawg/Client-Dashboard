"use client";

import { useMemo, useState } from "react";
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

type DueBucket = "overdue" | "today" | "this_week" | "upcoming" | "no_date";

const BUCKET_META: Record<
  DueBucket,
  { label: string; color: string; hint: string }
> = {
  overdue: {
    label: "Overdue",
    color: "#f87171",
    hint: "Review date has passed — check outcome",
  },
  today: {
    label: "Due today",
    color: "#fbbf24",
    hint: "Scheduled for review today",
  },
  this_week: {
    label: "Due this week",
    color: "#fb923c",
    hint: "Review within the next 7 days",
  },
  upcoming: {
    label: "Upcoming",
    color: "#60a5fa",
    hint: "Review further out",
  },
  no_date: {
    label: "No review date",
    color: "#94a3b8",
    hint: "Tracking without a scheduled check-in",
  },
};

const BUCKET_ORDER: DueBucket[] = [
  "overdue",
  "today",
  "this_week",
  "upcoming",
  "no_date",
];

const STATUS_COLOR: Record<string, string> = {
  planned: "#94a3b8",
  in_progress: "#60a5fa",
  measuring: "#fbbf24",
};

function todayYmd(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function dueBucket(item: PendingIntervention, today: string): DueBucket {
  if (!item.review_date) return "no_date";
  if (item.review_date < today || item.overdue) return "overdue";
  if (item.review_date === today) return "today";
  const weekEnd = addDaysYmd(today, 7);
  if (item.review_date <= weekEnd) return "this_week";
  return "upcoming";
}

function formatMetric(key: string | null, value: number | null): string {
  if (value == null) return "—";
  const meta = key ? SUCCESS_METRIC_META[key as SuccessMetricKey] : undefined;
  if (!meta) return String(Math.round(value * 100) / 100);
  if (meta.unit === "money") return `$${Math.round(value)}`;
  if (meta.unit === "pct") return `${value.toFixed(1)}%`;
  return value.toFixed(3);
}

function formatShortDate(ymd: string | null): string {
  if (!ymd) return "—";
  const [y, m, d] = ymd.split("-");
  if (!y || !m || !d) return ymd;
  return `${m}/${d}`;
}

export default function PendingInterventionsPanel({
  interventions,
  segment,
  onOpenClient,
}: Props) {
  const today = todayYmd();

  const filtered = useMemo(
    () =>
      interventions.filter(i =>
        segment === "CALL_CENTER"
          ? usesCallCenterKpiLayout(i.reporting_type)
          : !usesCallCenterKpiLayout(i.reporting_type),
      ),
    [interventions, segment],
  );

  const grouped = useMemo(() => {
    const map: Record<DueBucket, PendingIntervention[]> = {
      overdue: [],
      today: [],
      this_week: [],
      upcoming: [],
      no_date: [],
    };
    for (const item of filtered) {
      map[dueBucket(item, today)].push(item);
    }
    for (const key of BUCKET_ORDER) {
      map[key].sort((a, b) => {
        const da = a.review_date ?? "9999-99-99";
        const db = b.review_date ?? "9999-99-99";
        if (da !== db) return da.localeCompare(db);
        return a.client_name.localeCompare(b.client_name);
      });
    }
    return map;
  }, [filtered, today]);

  // Collapsed by default so the client table stays primary; header chips still show due counts.
  const [expanded, setExpanded] = useState(false);

  if (filtered.length === 0) return null;

  return (
    <section
      className="rounded-xl overflow-hidden"
      style={{
        background: "#0a1628",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="w-full flex flex-wrap items-center justify-between gap-3 px-5 py-4 text-left"
        style={{ background: "transparent" }}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold" style={{ color: "#e2e8f0" }}>
              Scheduled adjustments
            </h3>
            <span className="text-xs tabular-nums" style={{ color: "#64748b" }}>
              {filtered.length}
            </span>
          </div>
          <p className="text-xs mt-0.5" style={{ color: "#64748b" }}>
            Account changes logged to improve KPIs — grouped by when review is due
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {BUCKET_ORDER.map(key => {
            const count = grouped[key].length;
            if (count === 0) return null;
            const meta = BUCKET_META[key];
            return (
              <span
                key={key}
                className="text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-md tabular-nums"
                style={{
                  background: `${meta.color}18`,
                  color: meta.color,
                  border: `1px solid ${meta.color}33`,
                }}
              >
                {meta.label} {count}
              </span>
            );
          })}
          <span className="text-xs ml-1" style={{ color: "#475569" }}>
            {expanded ? "Hide ▲" : "Show ▼"}
          </span>
        </div>
      </button>

      {expanded && (
        <div
          className="px-5 pb-5 space-y-5"
          style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
        >
          {BUCKET_ORDER.map(key => {
            const items = grouped[key];
            if (items.length === 0) return null;
            const meta = BUCKET_META[key];
            return (
              <div key={key} className="pt-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
                  <p
                    className="text-[10px] font-bold uppercase tracking-widest"
                    style={{ color: meta.color }}
                  >
                    {meta.label} · {items.length}
                  </p>
                  <p className="text-[10px]" style={{ color: "#475569" }}>
                    {meta.hint}
                  </p>
                </div>

                <div
                  className="rounded-lg overflow-hidden"
                  style={{ border: "1px solid rgba(255,255,255,0.05)" }}
                >
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr
                        className="text-[10px] font-bold uppercase tracking-widest"
                        style={{
                          color: "#475569",
                          background: "#050c18",
                        }}
                      >
                        <th className="px-3 py-2 font-bold">Client</th>
                        <th className="px-3 py-2 font-bold">Adjustment</th>
                        <th className="px-3 py-2 font-bold whitespace-nowrap">
                          Changed
                        </th>
                        <th className="px-3 py-2 font-bold whitespace-nowrap">
                          Review due
                        </th>
                        <th className="px-3 py-2 font-bold">Metric</th>
                        <th className="px-3 py-2 font-bold w-24" />
                      </tr>
                    </thead>
                    <tbody>
                      {items.map(item => {
                        const metricMeta = item.success_metric
                          ? SUCCESS_METRIC_META[
                              item.success_metric as SuccessMetricKey
                            ]
                          : undefined;
                        return (
                          <tr
                            key={item.id}
                            style={{
                              borderTop: "1px solid rgba(255,255,255,0.04)",
                            }}
                          >
                            <td className="px-3 py-2.5 align-top">
                              <div
                                className="font-medium"
                                style={{ color: "#e2e8f0" }}
                              >
                                {item.client_name}
                              </div>
                              <span
                                className="text-[10px] font-bold uppercase"
                                style={{
                                  color:
                                    STATUS_COLOR[item.status] ?? "#64748b",
                                }}
                              >
                                {item.status.replace("_", " ")}
                              </span>
                            </td>
                            <td
                              className="px-3 py-2.5 align-top"
                              style={{ color: "#cbd5e1" }}
                            >
                              {item.title}
                            </td>
                            <td
                              className="px-3 py-2.5 align-top tabular-nums whitespace-nowrap"
                              style={{ color: "#94a3b8" }}
                            >
                              {formatShortDate(item.change_date)}
                            </td>
                            <td
                              className="px-3 py-2.5 align-top tabular-nums whitespace-nowrap font-medium"
                              style={{ color: meta.color }}
                            >
                              {formatShortDate(item.review_date)}
                            </td>
                            <td
                              className="px-3 py-2.5 align-top text-xs"
                              style={{ color: "#64748b" }}
                            >
                              <div>
                                {metricMeta?.label ??
                                  item.success_metric ??
                                  "—"}
                              </div>
                              {(item.baseline_value != null ||
                                item.outcome_value != null) && (
                                <div className="mt-0.5 tabular-nums">
                                  {item.baseline_value != null
                                    ? formatMetric(
                                        item.success_metric,
                                        item.baseline_value,
                                      )
                                    : "—"}
                                  {" → "}
                                  {item.outcome_value != null
                                    ? formatMetric(
                                        item.success_metric,
                                        item.outcome_value,
                                      )
                                    : "…"}
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-2.5 align-top text-right">
                              <button
                                type="button"
                                onClick={() =>
                                  onOpenClient(item.client_id, item.client_name)
                                }
                                className="text-xs font-semibold px-2.5 py-1 rounded-md"
                                style={{
                                  background: "rgba(96,165,250,0.12)",
                                  color: "#60a5fa",
                                  border: "1px solid rgba(96,165,250,0.25)",
                                }}
                              >
                                Open →
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

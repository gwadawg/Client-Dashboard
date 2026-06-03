"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { KpiTimelineBucket } from "@/lib/metrics";
import { weekStartKey } from "@/lib/metrics";

type Props = {
  clientId: string;
  endDate: string;
};

type MetricKey = "cpconv" | "cpql" | "cpl" | "net_show_rate" | "booking_rate" | "lead_to_qual";

const METRICS: { key: MetricKey; label: string; unit: "money" | "pct"; lowerIsBetter: boolean }[] = [
  { key: "cpconv", label: "CPConv (cost / conv)", unit: "money", lowerIsBetter: true },
  { key: "cpql", label: "CPQL", unit: "money", lowerIsBetter: true },
  { key: "cpl", label: "CPL", unit: "money", lowerIsBetter: true },
  { key: "net_show_rate", label: "Show rate (true)", unit: "pct", lowerIsBetter: false },
  { key: "booking_rate", label: "Booking rate", unit: "pct", lowerIsBetter: false },
  { key: "lead_to_qual", label: "Lead-to-qualified", unit: "pct", lowerIsBetter: false },
];

const WINDOWS = [
  { weeks: 8, label: "8 weeks" },
  { weeks: 12, label: "12 weeks" },
  { weeks: 26, label: "26 weeks" },
];

function fmt(unit: "money" | "pct", v: number | null): string {
  if (v == null) return "—";
  return unit === "money" ? `$${Math.round(v)}` : `${v.toFixed(1)}%`;
}

function shiftDate(anchor: string, days: number): string {
  const d = new Date(`${anchor}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().split("T")[0];
}

export default function ClientTimelineChart({ clientId, endDate }: Props) {
  const [timeline, setTimeline] = useState<KpiTimelineBucket[]>([]);
  const [actionMarks, setActionMarks] = useState<{ date: string; title: string }[]>([]);
  const [metric, setMetric] = useState<MetricKey>("cpconv");
  const [weeks, setWeeks] = useState(12);
  const [loading, setLoading] = useState(true);

  const anchor = endDate || new Date().toISOString().split("T")[0];
  const start = useMemo(() => shiftDate(anchor, weeks * 7), [anchor, weeks]);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ start_date: start, end_date: anchor, granularity: "week" });
    Promise.all([
      fetch(`/api/client-health/${clientId}/timeline?${params}`).then(r => r.json()),
      fetch(`/api/client-actions?client_id=${clientId}`).then(r => r.json()),
    ])
      .then(([t, a]) => {
        setTimeline(t.timeline ?? []);
        setActionMarks(
          (a.actions ?? []).map((x: { created_at: string; title: string }) => ({
            date: weekStartKey(x.created_at.split("T")[0]),
            title: x.title,
          })),
        );
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [clientId, start, anchor]);

  const meta = METRICS.find(m => m.key === metric)!;

  const chartData = useMemo(
    () => timeline.map(b => ({ date: b.date, value: b[metric] })),
    [timeline, metric],
  );

  // Largest week-over-week move in the "bad" direction.
  const worstDrop = useMemo(() => {
    let worst: { date: string; from: number; to: number; delta: number } | null = null;
    for (let i = 1; i < timeline.length; i++) {
      const prev = timeline[i - 1][metric];
      const cur = timeline[i][metric];
      if (prev == null || cur == null) continue;
      const change = cur - prev;
      const isBad = meta.lowerIsBetter ? change > 0 : change < 0;
      if (!isBad) continue;
      const magnitude = Math.abs(change);
      if (!worst || magnitude > Math.abs(worst.delta)) {
        worst = { date: timeline[i].date, from: prev, to: cur, delta: change };
      }
    }
    return worst;
  }, [timeline, metric, meta.lowerIsBetter]);

  return (
    <div className="rounded-xl p-5" style={{ background: "#0a1628", border: "1px solid rgba(255,255,255,0.06)" }}>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div>
          <h3 className="text-base font-semibold" style={{ color: "#e2e8f0" }}>
            Timeline & drop-off detection
          </h3>
          <p className="text-xs mt-0.5" style={{ color: "#475569" }}>
            Week-by-week trend. Vertical lines mark logged changes so you can see what moved the metric.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={metric}
            onChange={e => setMetric(e.target.value as MetricKey)}
            className="text-xs rounded-lg px-2 py-1.5"
            style={{ background: "#0f2040", border: "1px solid rgba(255,255,255,0.12)", color: "#e2e8f0" }}
          >
            {METRICS.map(m => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </select>
          <select
            value={weeks}
            onChange={e => setWeeks(Number(e.target.value))}
            className="text-xs rounded-lg px-2 py-1.5"
            style={{ background: "#0f2040", border: "1px solid rgba(255,255,255,0.12)", color: "#e2e8f0" }}
          >
            {WINDOWS.map(w => (
              <option key={w.weeks} value={w.weeks}>
                {w.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {worstDrop && (
        <div
          className="rounded-lg px-3 py-2 mb-3 text-xs"
          style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", color: "#f87171" }}
        >
          Biggest drop-off: week of {worstDrop.date} — {meta.label} went {fmt(meta.unit, worstDrop.from)} →{" "}
          {fmt(meta.unit, worstDrop.to)}.
        </div>
      )}

      {loading ? (
        <p className="text-sm py-8 text-center" style={{ color: "#334155" }}>
          Loading timeline…
        </p>
      ) : chartData.length === 0 ? (
        <p className="text-sm py-8 text-center" style={{ color: "#334155" }}>
          No data in this window.
        </p>
      ) : (
        <div style={{ height: 280 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ left: 4, right: 16, top: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis dataKey="date" tick={{ fill: "#475569", fontSize: 10 }} />
              <YAxis tick={{ fill: "#475569", fontSize: 11 }} />
              <Tooltip
                contentStyle={{
                  background: "#0f2040",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(v) => [fmt(meta.unit, v == null ? null : Number(v)), meta.label]}
              />
              {actionMarks.map((mk, i) => (
                <ReferenceLine
                  key={i}
                  x={mk.date}
                  stroke="#34d399"
                  strokeDasharray="4 3"
                  strokeOpacity={0.7}
                  label={{ value: "change", fill: "#34d399", fontSize: 9, position: "top" }}
                />
              ))}
              <Line
                type="monotone"
                dataKey="value"
                stroke={meta.lowerIsBetter ? "#60a5fa" : "#34d399"}
                strokeWidth={2}
                dot={{ r: 2 }}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

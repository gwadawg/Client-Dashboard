"use client";

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
import type { CostTrendPoint } from "@/lib/metrics";
import { weekStartKey } from "@/lib/metrics";

export type CostTrendMarker = {
  date: string;
  label: string;
  tone?: "accent" | "positive" | "negative" | "muted";
};

type Props = {
  series: CostTrendPoint[];
  granularity: "day" | "week";
  loading?: boolean;
  error?: string;
  hasDateRange: boolean;
  markers?: CostTrendMarker[];
};

type ChartKey = "cpl" | "cp_qualified" | "cp_conversation";

const CHARTS: {
  key: ChartKey;
  title: string;
  subtitle: string;
  denominatorLabel: string;
}[] = [
  {
    key: "cpl",
    title: "Cost per lead",
    subtitle: "Ad spend ÷ total leads",
    denominatorLabel: "Leads",
  },
  {
    key: "cp_qualified",
    title: "Cost per qualified lead",
    subtitle: "Ad spend ÷ qualified leads",
    denominatorLabel: "Qualified",
  },
  {
    key: "cp_conversation",
    title: "Cost per conversation",
    subtitle: "Ad spend ÷ unique conversation leads (show ∪ claimed ∪ LT)",
    denominatorLabel: "Unique conversation leads",
  },
];

const TONE_STROKE: Record<NonNullable<CostTrendMarker["tone"]>, string> = {
  accent: "#f59e0b",
  positive: "#34d399",
  negative: "#f87171",
  muted: "#64748b",
};

function formatDateLabel(date: string, granularity: "day" | "week"): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  return (
    d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) +
    (granularity === "week" ? " (wk)" : "")
  );
}

function formatMoney(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

/** Snap a marker ISO date onto the chart's x-axis label. */
function markerXLabel(
  markerDate: string,
  series: CostTrendPoint[],
  granularity: "day" | "week",
): string | null {
  if (series.length === 0) return null;
  const target =
    granularity === "week" ? weekStartKey(markerDate.slice(0, 10)) : markerDate.slice(0, 10);
  let best = series[0]!;
  let bestDist = Math.abs(
    Date.parse(`${best.date}T00:00:00.000Z`) - Date.parse(`${target}T00:00:00.000Z`),
  );
  for (const p of series) {
    const dist = Math.abs(
      Date.parse(`${p.date}T00:00:00.000Z`) - Date.parse(`${target}T00:00:00.000Z`),
    );
    if (dist < bestDist) {
      best = p;
      bestDist = dist;
    }
  }
  if (bestDist > 10 * 86400000) return null;
  return formatDateLabel(best.date, granularity);
}

function ChartPanel({
  title,
  subtitle,
  dataKey,
  data,
  granularity,
  denominatorLabel,
  markers,
}: {
  title: string;
  subtitle: string;
  dataKey: ChartKey;
  data: CostTrendPoint[];
  granularity: "day" | "week";
  denominatorLabel: string;
  markers?: CostTrendMarker[];
}) {
  const chartData = data.map(p => ({
    ...p,
    label: formatDateLabel(p.date, granularity),
    value: p[dataKey],
  }));

  const hasAnyValue = chartData.some(d => d.value != null);
  const resolvedMarkers = (markers ?? [])
    .map(m => {
      const x = markerXLabel(m.date, data, granularity);
      return x ? { ...m, x } : null;
    })
    .filter((m): m is CostTrendMarker & { x: string } => m != null);

  return (
    <div
      className="rounded-xl p-5"
      style={{
        background: "linear-gradient(135deg, #0f2040 0%, #0c1a30 100%)",
        border: "1px solid rgba(255,255,255,0.07)",
      }}
    >
      <div className="mb-4">
        <h3 className="text-sm font-semibold" style={{ color: "#e2e8f0" }}>
          {title}
        </h3>
        <p className="text-[10px] mt-0.5" style={{ color: "#475569" }}>
          {subtitle}
        </p>
      </div>
      {!hasAnyValue ? (
        <p className="text-xs py-12 text-center" style={{ color: "#475569" }}>
          No data in this range (need spend and {denominatorLabel.toLowerCase()} on the same{" "}
          {granularity === "week" ? "week" : "day"}).
        </p>
      ) : (
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
              <XAxis
                dataKey="label"
                tick={{ fill: "#64748b", fontSize: 10 }}
                interval="preserveStartEnd"
                minTickGap={24}
              />
              <YAxis
                tick={{ fill: "#64748b", fontSize: 10 }}
                tickFormatter={v => `$${v}`}
                width={48}
              />
              <Tooltip
                contentStyle={{
                  background: "#0a1628",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 8,
                  fontSize: 11,
                }}
                labelStyle={{ color: "#94a3b8" }}
                formatter={(value) => [
                  typeof value === "number" ? formatMoney(value) : String(value ?? ""),
                  title,
                ]}
              />
              {resolvedMarkers.map((m, i) => (
                <ReferenceLine
                  key={`${m.x}-${i}`}
                  x={m.x}
                  stroke={TONE_STROKE[m.tone ?? "accent"]}
                  strokeDasharray="4 3"
                  strokeOpacity={0.85}
                  label={{
                    value: m.label.length > 18 ? `${m.label.slice(0, 16)}…` : m.label,
                    fill: TONE_STROKE[m.tone ?? "accent"],
                    fontSize: 9,
                    position: "insideTopRight",
                  }}
                />
              ))}
              <Line
                type="monotone"
                dataKey="value"
                stroke="#f59e0b"
                strokeWidth={2}
                dot={chartData.length <= 31 ? { r: 3, fill: "#f59e0b" } : false}
                connectNulls={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

export default function CostTrendCharts({
  series,
  granularity,
  loading = false,
  error = "",
  hasDateRange,
  markers,
}: Props) {
  if (!hasDateRange) {
    return (
      <p className="text-xs" style={{ color: "#475569" }}>
        Select a date range to view cost trends.
      </p>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 gap-3" style={{ color: "#334155" }}>
        <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <span className="text-sm font-medium">Loading cost trends…</span>
      </div>
    );
  }

  if (error) {
    return <p className="text-xs text-red-400">{error}</p>;
  }

  const hasActivity = series.some(p => p.spend > 0 || p.leads > 0);

  if (!hasActivity) {
    return (
      <p className="text-xs py-8 text-center rounded-xl" style={{ color: "#475569", background: "#0a1628" }}>
        No spend or leads in this range.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {granularity === "week" && (
        <p className="text-[10px]" style={{ color: "#475569" }}>
          Weekly buckets (range over 90 days). All platforms included in spend.
        </p>
      )}
      {markers && markers.length > 0 && (
        <p className="text-[10px]" style={{ color: "#64748b" }}>
          Vertical lines mark account changes (bets) in this range.
        </p>
      )}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {CHARTS.map(chart => (
          <ChartPanel
            key={chart.key}
            title={chart.title}
            subtitle={chart.subtitle}
            dataKey={chart.key}
            data={series}
            granularity={granularity}
            denominatorLabel={chart.denominatorLabel}
            markers={markers}
          />
        ))}
      </div>
    </div>
  );
}

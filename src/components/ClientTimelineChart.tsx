"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { KpiTimelineBucket } from "@/lib/metrics";
import { weekStartKey } from "@/lib/metrics";
import {
  LAYER_TOGGLE_STORAGE_KEY,
  WORK_TYPE_META,
  WORK_TYPES,
  isGhostMark,
  parseLayerToggles,
  parseWorkType,
  workLogPlotDate,
  type WorkType,
} from "@/lib/client-work-log";

type Props = {
  clientId: string;
  /** @deprecated Timeline always runs through calendar today so drop-offs stay current. */
  endDate?: string;
};

type MetricKey = "cpconv" | "cpql" | "cpl" | "booked_to_conversation_rate" | "show_rate" | "booking_rate" | "lead_to_qual";

type WorkLogMark = {
  id: string;
  title: string;
  workType: WorkType;
  status: string;
  plotDate: string;
  week: string;
  reviewWeek: string | null;
  ghost: boolean;
};

const METRICS: { key: MetricKey; label: string; unit: "money" | "pct"; lowerIsBetter: boolean }[] = [
  { key: "cpconv", label: "CPConv (cost / conv)", unit: "money", lowerIsBetter: true },
  { key: "cpql", label: "CPQL", unit: "money", lowerIsBetter: true },
  { key: "cpl", label: "CPL", unit: "money", lowerIsBetter: true },
  { key: "booked_to_conversation_rate", label: "Show rate", unit: "pct", lowerIsBetter: false },
  { key: "show_rate", label: "True Show", unit: "pct", lowerIsBetter: false },
  { key: "booking_rate", label: "Booking rate", unit: "pct", lowerIsBetter: false },
  { key: "lead_to_qual", label: "Lead-to-qualified", unit: "pct", lowerIsBetter: false },
];

const WINDOWS = [
  { weeks: 8, label: "8 weeks" },
  { weeks: 12, label: "12 weeks" },
  { weeks: 26, label: "26 weeks" },
];

const STATUS_COLOR: Record<string, string> = {
  planned: "#94a3b8",
  in_progress: "#60a5fa",
  measuring: "#fbbf24",
  succeeded: "#34d399",
  failed: "#f87171",
  abandoned: "#64748b",
};

function fmt(unit: "money" | "pct", v: number | null): string {
  if (v == null) return "—";
  return unit === "money" ? `$${Math.round(v)}` : `${v.toFixed(1)}%`;
}

function utcToday(): string {
  return new Date().toISOString().split("T")[0];
}

function shiftDate(anchor: string, days: number): string {
  const d = new Date(`${anchor}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().split("T")[0];
}

function markColor(mk: WorkLogMark): string {
  if (mk.workType === "bet") return STATUS_COLOR[mk.status] ?? WORK_TYPE_META.bet.color;
  return WORK_TYPE_META[mk.workType].color;
}

function clampWeek(week: string, weeks: string[]): string {
  if (weeks.includes(week)) return week;
  if (!weeks.length) return week;
  if (week < weeks[0]) return weeks[0];
  if (week > weeks[weeks.length - 1]) return weeks[weeks.length - 1];
  return weeks.reduce((best, w) => (Math.abs(Date.parse(w) - Date.parse(week)) < Math.abs(Date.parse(best) - Date.parse(week)) ? w : best));
}

export default function ClientTimelineChart({ clientId }: Props) {
  const [timeline, setTimeline] = useState<KpiTimelineBucket[]>([]);
  const [marks, setMarks] = useState<WorkLogMark[]>([]);
  const [metric, setMetric] = useState<MetricKey>("cpconv");
  const [weeks, setWeeks] = useState(12);
  const [loading, setLoading] = useState(true);
  const [layers, setLayers] = useState<Record<WorkType, boolean>>(() => {
    if (typeof window === "undefined") return parseLayerToggles(null);
    return parseLayerToggles(window.localStorage.getItem(LAYER_TOGGLE_STORAGE_KEY));
  });

  const anchor = utcToday();
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
        setMarks(
          (a.actions ?? []).flatMap((x: {
            id: string;
            title: string;
            work_type?: string | null;
            status: string;
            change_date?: string | null;
            planned_date?: string | null;
            review_date?: string | null;
          }) => {
            const plotDate = workLogPlotDate(x);
            if (!plotDate) return [];
            const workType = parseWorkType(x.work_type, "bet");
            return [{
              id: x.id,
              title: x.title,
              workType,
              status: x.status,
              plotDate,
              week: weekStartKey(plotDate),
              reviewWeek: x.review_date ? weekStartKey(x.review_date) : null,
              ghost: isGhostMark(x),
            } satisfies WorkLogMark];
          }),
        );
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [clientId, start, anchor]);

  function toggleLayer(type: WorkType) {
    setLayers(prev => {
      const next = { ...prev, [type]: !prev[type] };
      try {
        window.localStorage.setItem(LAYER_TOGGLE_STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignore quota */
      }
      return next;
    });
  }

  const meta = METRICS.find(m => m.key === metric)!;

  const chartData = useMemo(
    () => timeline.map(b => ({ date: b.date, value: b[metric] })),
    [timeline, metric],
  );

  const weekKeys = useMemo(() => chartData.map(d => d.date), [chartData]);

  const overlayByWeek = useMemo(() => {
    const map = new Map<string, WorkLogMark[]>();
    for (const mk of marks) {
      if (!layers[mk.workType]) continue;
      if (!weekKeys.includes(mk.week) && (mk.week < (weekKeys[0] ?? "") || mk.week > (weekKeys[weekKeys.length - 1] ?? "z"))) {
        continue;
      }
      const week = weekKeys.includes(mk.week) ? mk.week : clampWeek(mk.week, weekKeys);
      const list = map.get(week) ?? [];
      list.push(mk);
      map.set(week, list);
    }
    return map;
  }, [marks, layers, weekKeys]);

  const overlayWeeks = useMemo(() => [...overlayByWeek.entries()], [overlayByWeek]);

  const betBands = useMemo(() => {
    if (!layers.bet || weekKeys.length < 2) return [];
    const seen = new Set<string>();
    const bands: { key: string; x1: string; x2: string; color: string }[] = [];
    for (const mk of marks) {
      if (mk.workType !== "bet" || mk.ghost || !mk.reviewWeek) continue;
      const x1 = clampWeek(mk.week, weekKeys);
      const x2 = clampWeek(mk.reviewWeek, weekKeys);
      if (x1 >= x2) continue;
      const key = `${x1}|${x2}|${mk.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      bands.push({ key, x1, x2, color: markColor(mk) });
    }
    return bands;
  }, [marks, layers.bet, weekKeys]);

  const stripMarks = useMemo(() => {
    if (!weekKeys.length) return [];
    const first = weekKeys[0];
    const last = weekKeys[weekKeys.length - 1];
    return marks.filter(mk => mk.week >= first && mk.week <= last);
  }, [marks, weekKeys]);

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
            Week-by-week through today. Overlay marks live dates — cadence stays off until you turn it on.
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

      <div className="flex flex-wrap gap-2 mb-3">
        {WORK_TYPES.map(type => {
          const on = layers[type];
          const metaT = WORK_TYPE_META[type];
          return (
            <button
              key={type}
              type="button"
              onClick={() => toggleLayer(type)}
              className="text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-full"
              style={{
                color: on ? metaT.color : "#475569",
                background: on ? `${metaT.color}22` : "transparent",
                border: `1px solid ${on ? metaT.color : "rgba(255,255,255,0.12)"}`,
              }}
            >
              {metaT.label}
            </button>
          );
        })}
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
        <>
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
                  labelFormatter={(label) => {
                    const list = overlayByWeek.get(String(label)) ?? [];
                    if (!list.length) return String(label);
                    return `${label} · ${list.map(m => m.title).join(" · ")}`;
                  }}
                />
                {betBands.map(band => (
                  <ReferenceArea
                    key={band.key}
                    x1={band.x1}
                    x2={band.x2}
                    fill={band.color}
                    fillOpacity={0.08}
                    strokeOpacity={0}
                  />
                ))}
                {overlayWeeks.map(([week, list]) => {
                  const primary = list.find(m => m.workType === "bet") ?? list[0];
                  const color = markColor(primary);
                  return (
                    <ReferenceLine
                      key={week}
                      x={week}
                      stroke={color}
                      strokeDasharray={primary.ghost ? "2 4" : "4 3"}
                      strokeOpacity={primary.workType === "cadence" ? 0.35 : 0.75}
                      label={{
                        value: list.length > 1 ? `${list.length}` : WORK_TYPE_META[primary.workType].label,
                        fill: color,
                        fontSize: 9,
                        position: "top",
                      }}
                    />
                  );
                })}
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

          <WorkStrip marks={stripMarks} weekKeys={weekKeys} />
        </>
      )}
    </div>
  );
}

function WorkStrip({ marks, weekKeys }: { marks: WorkLogMark[]; weekKeys: string[] }) {
  if (!weekKeys.length) return null;
  const lastIdx = Math.max(weekKeys.length - 1, 1);

  function leftPct(week: string): number {
    const idx = weekKeys.indexOf(week);
    const i = idx >= 0 ? idx : weekKeys.findIndex(w => w >= week);
    const clamped = i < 0 ? lastIdx : i;
    return (clamped / lastIdx) * 100;
  }

  return (
    <div className="mt-3">
      <p className="text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: "#475569" }}>
        Work strip
      </p>
      <div
        className="relative h-10 rounded-lg"
        style={{ background: "#050c18", border: "1px solid rgba(255,255,255,0.06)" }}
      >
        {marks.map(mk => {
          const left = leftPct(mk.week);
          const color = markColor(mk);
          if (mk.workType === "bet" && mk.reviewWeek && !mk.ghost) {
            const right = leftPct(mk.reviewWeek);
            const width = Math.max(right - left, 1.5);
            return (
              <span
                key={mk.id}
                title={`${WORK_TYPE_META.bet.label}: ${mk.title}`}
                className="absolute top-1/2 -translate-y-1/2 h-2 rounded-full"
                style={{
                  left: `${left}%`,
                  width: `${width}%`,
                  background: color,
                  opacity: 0.7,
                }}
              />
            );
          }
          if (mk.workType === "finding") {
            return (
              <span
                key={mk.id}
                title={`${WORK_TYPE_META.finding.label}: ${mk.title}`}
                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 rotate-45"
                style={{
                  left: `${left}%`,
                  width: 8,
                  height: 8,
                  background: mk.ghost ? "transparent" : color,
                  border: `1.5px solid ${color}`,
                }}
              />
            );
          }
          return (
            <span
              key={mk.id}
              title={`${WORK_TYPE_META[mk.workType].label}: ${mk.title}`}
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2"
              style={{
                left: `${left}%`,
                width: 2,
                height: mk.ghost ? 8 : 14,
                background: color,
                opacity: mk.ghost ? 0.4 : 0.85,
              }}
            />
          );
        })}
      </div>
      <div className="flex gap-3 mt-1.5">
        {WORK_TYPES.map(type => (
          <span key={type} className="text-[10px]" style={{ color: WORK_TYPE_META[type].color }}>
            {type === "finding" ? "◆" : type === "cadence" ? "|" : "━"} {WORK_TYPE_META[type].label}
          </span>
        ))}
      </div>
    </div>
  );
}
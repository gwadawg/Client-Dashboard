"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Fragment } from "react";
import {
  computePriorityScore,
  KPI_META,
  TIER_LABEL,
  type ClientHealthRow,
  type HealthTier,
  type KpiKey,
} from "@/lib/client-health";
import ClientHealthDetail from "./ClientHealthDetail";

type Props = {
  startDate: string;
  endDate: string;
};

type SortKey = "priority" | "show_rate" | "cps" | "leads" | "name";

const TIER_STYLES: Record<HealthTier, { bg: string; text: string; border: string }> = {
  critical: { bg: "rgba(239,68,68,0.18)", text: "#f87171", border: "rgba(239,68,68,0.4)" },
  below: { bg: "rgba(245,158,11,0.15)", text: "#fbbf24", border: "rgba(245,158,11,0.35)" },
  at: { bg: "rgba(52,211,153,0.12)", text: "#34d399", border: "rgba(52,211,153,0.3)" },
  above: { bg: "rgba(59,130,246,0.15)", text: "#60a5fa", border: "rgba(59,130,246,0.35)" },
  insufficient: { bg: "rgba(100,116,139,0.12)", text: "#64748b", border: "rgba(100,116,139,0.25)" },
};

const CONSTRAINT_COLORS: Record<string, string> = {
  lead_quality: "#a78bfa",
  lead_cost: "#f472b6",
  call_center: "#f59e0b",
  show_rate: "#38bdf8",
  data_issue: "#fb7185",
  healthy: "#34d399",
  insufficient_data: "#64748b",
};

const TREND_ICONS: Record<ClientHealthRow["trend"], { symbol: string; color: string; label: string }> = {
  improved: { symbol: "↑", color: "#34d399", label: "Improving" },
  worsened: { symbol: "↓", color: "#f87171", label: "Slipping" },
  stable: { symbol: "→", color: "#94a3b8", label: "Stable" },
  new: { symbol: "•", color: "#64748b", label: "New / no prior" },
  insufficient: { symbol: "—", color: "#475569", label: "Low volume" },
};

const CHART_METRICS: { key: SortKey; label: string }[] = [
  { key: "priority", label: "Attention score" },
  { key: "show_rate", label: "Show rate % (true)" },
  { key: "cps", label: "Cost per conversation" },
  { key: "leads", label: "Total leads" },
];

function TierBadge({ tier }: { tier: HealthTier }) {
  const s = TIER_STYLES[tier];
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide"
      style={{ background: s.bg, color: s.text, border: `1px solid ${s.border}` }}
    >
      {TIER_LABEL[tier]}
    </span>
  );
}

function KpiDot({ tier }: { tier: HealthTier }) {
  const s = TIER_STYLES[tier];
  return (
    <span
      className="inline-block w-2 h-2 rounded-full flex-shrink-0"
      style={{ background: s.text }}
      title={TIER_LABEL[tier]}
    />
  );
}

export default function ClientHealthDashboard({ startDate, endDate }: Props) {
  const [rows, setRows] = useState<ClientHealthRow[]>([]);
  const [priorLabel, setPriorLabel] = useState<string>("");
  const [maturity, setMaturity] = useState<{
    days: number;
    matured_through: string;
    clamped: boolean;
    empty: boolean;
    recent_window_days: number;
    recent_start: string;
    recent_end: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [liveOnly, setLiveOnly] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("priority");
  const [sortAsc, setSortAsc] = useState(false);
  const [chartMetric, setChartMetric] = useState<SortKey>("priority");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [hideInactive, setHideInactive] = useState(true);
  const [detail, setDetail] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    if (!startDate || !endDate) return;
    setLoading(true);
    const params = new URLSearchParams({ start_date: startDate, end_date: endDate });
    if (liveOnly) params.set("live_only", "true");
    fetch(`/api/client-health?${params}`)
      .then(r => r.json())
      .then(d => {
        setRows(d.clients ?? []);
        setMaturity(d.maturity ?? null);
        if (d.prior_period) {
          setPriorLabel(`${d.prior_period.start} → ${d.prior_period.end}`);
        } else {
          setPriorLabel("");
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [startDate, endDate, liveOnly]);

  const filtered = useMemo(
    () => (hideInactive ? rows.filter(r => r.has_activity) : rows),
    [rows, hideInactive],
  );

  const sorted = useMemo(() => {
    const list = [...filtered];
    const dir = sortAsc ? 1 : -1;
    list.sort((a, b) => {
      if (sortKey === "name") {
        return dir * a.client_name.localeCompare(b.client_name);
      }
      if (sortKey === "priority") {
        return dir * (computePriorityScore(a) - computePriorityScore(b));
      }
      if (sortKey === "show_rate") {
        return dir * (a.current.metrics.net_show_pct - b.current.metrics.net_show_pct);
      }
      if (sortKey === "cps") {
        return dir * (a.current.metrics.cp_conversation - b.current.metrics.cp_conversation);
      }
      if (sortKey === "leads") {
        return dir * (a.current.metrics.new_leads - b.current.metrics.new_leads);
      }
      return 0;
    });
    return list;
  }, [filtered, sortKey, sortAsc]);

  const summary = useMemo(() => {
    const active = filtered.filter(r => r.has_activity);
    const critical = active.filter(r => r.current.worst_tier === "critical").length;
    const below = active.filter(r => r.current.worst_tier === "below").length;
    const improving = active.filter(r => r.trend === "improved").length;
    const slipping = active.filter(r => r.trend === "worsened").length;
    return { active: active.length, critical, below, improving, slipping };
  }, [filtered]);

  const chartData = useMemo(() => {
    return sorted.slice(0, 20).map(r => {
      let value = 0;
      if (chartMetric === "priority") value = computePriorityScore(r);
      else if (chartMetric === "show_rate") value = r.current.metrics.net_show_pct;
      else if (chartMetric === "cps") value = r.current.metrics.cp_conversation;
      else if (chartMetric === "leads") value = r.current.metrics.new_leads;
      return {
        name: r.client_name.length > 18 ? `${r.client_name.slice(0, 16)}…` : r.client_name,
        fullName: r.client_name,
        value: Math.round(value * 10) / 10,
        tier: r.current.worst_tier,
      };
    });
  }, [sorted, chartMetric]);

  const selectStyle = {
    background: "#0f2040",
    border: "1px solid rgba(255,255,255,0.12)",
    color: "#e2e8f0",
    borderRadius: "0.5rem",
    padding: "0.5rem 1rem",
    fontSize: "0.875rem",
    outline: "none",
  } as React.CSSProperties;

  if (detail) {
    return (
      <ClientHealthDetail
        clientId={detail.id}
        clientName={detail.name}
        startDate={startDate}
        endDate={endDate}
        onBack={() => setDetail(null)}
      />
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24" style={{ color: "#334155" }}>
        <svg className="w-5 h-5 animate-spin mr-2" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <span className="text-sm font-medium">Loading client health…</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-[1400px]">
      <div>
        <h2 className="text-xl font-semibold" style={{ color: "#e2e8f0" }}>
          Client Success Overview
        </h2>
        <p className="text-sm mt-1 max-w-3xl" style={{ color: "#475569" }}>
          All clients side-by-side, graded against Waiz KPI standards. Sorted by who needs attention first.
          {priorLabel ? (
            <span style={{ color: "#64748b" }}> Progress vs prior period ({priorLabel}).</span>
          ) : null}
        </p>
      </div>

      {/* Maturity / two-instrument explainer */}
      {maturity ? (
        <div
          className="rounded-xl px-4 py-3 text-xs leading-relaxed"
          style={{ background: "#0a1628", border: "1px solid rgba(56,189,248,0.18)", color: "#94a3b8" }}
        >
          {maturity.empty ? (
            <>
              <span style={{ color: "#38bdf8", fontWeight: 600 }}>Still maturing — no verdict yet.</span>{" "}
              The selected range is more recent than the {maturity.days}-day maturity window, so lag-sensitive KPIs
              (CPConv, show rate, close rate) can&apos;t be graded reliably. Use the <strong>Recent ({maturity.recent_window_days}d)</strong>{" "}
              leading indicators below for early signal, or widen the date range for a verdict.
            </>
          ) : (
            <>
              <span style={{ color: "#38bdf8", fontWeight: 600 }}>Verdict = matured data through {maturity.matured_through}.</span>{" "}
              The last {maturity.days} days are still resolving (bookings → appointments → outcomes), so they&apos;re
              excluded from the graded verdict to keep CPConv / show / close honest. The{" "}
              <strong>Recent ({maturity.recent_window_days}d)</strong> leading indicators (expand a client) are your
              early-warning instrument.
            </>
          )}
        </div>
      ) : null}

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: "Active clients", value: summary.active, color: "#e2e8f0" },
          { label: "911 critical", value: summary.critical, color: "#f87171" },
          { label: "Below KPI", value: summary.below, color: "#fbbf24" },
          { label: "Improving", value: summary.improving, color: "#34d399" },
          { label: "Slipping", value: summary.slipping, color: "#fb7185" },
        ].map(s => (
          <div
            key={s.label}
            className="rounded-xl px-4 py-3"
            style={{ background: "#0a1628", border: "1px solid rgba(255,255,255,0.06)" }}
          >
            <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "#475569" }}>
              {s.label}
            </p>
            <p className="text-2xl font-bold mt-1" style={{ color: s.color }}>
              {s.value}
            </p>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <select style={selectStyle} value={sortKey} onChange={e => setSortKey(e.target.value as SortKey)}>
          <option value="priority">Sort: Attention (worst first)</option>
          <option value="show_rate">Sort: Show rate</option>
          <option value="cps">Sort: Cost per conversation</option>
          <option value="leads">Sort: Lead volume</option>
          <option value="name">Sort: Name</option>
        </select>
        <button
          type="button"
          onClick={() => setSortAsc(v => !v)}
          className="px-3 py-2 rounded-lg text-sm font-medium"
          style={{ background: "#0f2040", border: "1px solid rgba(255,255,255,0.12)", color: "#94a3b8" }}
        >
          {sortAsc ? "↑ Ascending" : "↓ Descending"}
        </button>
        <select style={selectStyle} value={chartMetric} onChange={e => setChartMetric(e.target.value as SortKey)}>
          {CHART_METRICS.map(m => (
            <option key={m.key} value={m.key}>
              Chart: {m.label}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: "#64748b" }}>
          <input
            type="checkbox"
            checked={liveOnly}
            onChange={e => setLiveOnly(e.target.checked)}
            className="rounded"
          />
          Live clients only
        </label>
        <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: "#64748b" }}>
          <input
            type="checkbox"
            checked={hideInactive}
            onChange={e => setHideInactive(e.target.checked)}
            className="rounded"
          />
          Hide inactive
        </label>
      </div>

      {/* Chart */}
      {chartData.length > 0 && (
        <div
          className="rounded-xl p-4 pt-6"
          style={{ background: "#0a1628", border: "1px solid rgba(255,255,255,0.06)", height: Math.max(280, chartData.length * 36) }}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 24, top: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" horizontal={false} />
              <XAxis type="number" tick={{ fill: "#475569", fontSize: 11 }} />
              <YAxis
                type="category"
                dataKey="name"
                width={120}
                tick={{ fill: "#94a3b8", fontSize: 11 }}
              />
              <Tooltip
                contentStyle={{
                  background: "#0f2040",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(v) => [
                  typeof v === "number" ? v : Number(v ?? 0),
                  CHART_METRICS.find(m => m.key === chartMetric)?.label ?? "",
                ]}
                labelFormatter={(_, payload) =>
                  payload?.[0]?.payload?.fullName ? String(payload[0].payload.fullName) : ""
                }
              />
              <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={22}>
                {chartData.map((entry, i) => (
                  <Cell key={i} fill={TIER_STYLES[entry.tier].text} fillOpacity={0.85} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Table */}
      <div
        className="rounded-xl overflow-hidden"
        style={{ background: "#0a1628", border: "1px solid rgba(255,255,255,0.06)" }}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                {["Client", "Status", "Constraint", "Trend", "Leads", "Qual %", "Book %", "Show %", "CPConv", ""].map(h => (
                  <th
                    key={h}
                    className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-widest"
                    style={{ color: "#475569" }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center" style={{ color: "#334155" }}>
                    No clients match this filter for the selected period.
                  </td>
                </tr>
              ) : (
                sorted.map(row => {
                  const trend = TREND_ICONS[row.trend];
                  const expanded = expandedId === row.client_id;
                  const m = row.current.metrics;
                  const grade = (key: KpiKey) =>
                    row.current.grades.find(g => g.key === key);

                  return (
                    <Fragment key={row.client_id}>
                      <tr
                        className="cursor-pointer transition-colors"
                        style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
                        onClick={() => setExpandedId(expanded ? null : row.client_id)}
                        onMouseEnter={e => {
                          (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.02)";
                        }}
                        onMouseLeave={e => {
                          (e.currentTarget as HTMLElement).style.background = "";
                        }}
                      >
                        <td className="px-4 py-3 font-medium" style={{ color: "#e2e8f0" }}>
                          {row.client_name}
                          {!row.is_live && (
                            <span className="ml-2 text-[10px]" style={{ color: "#475569" }}>
                              offline
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <TierBadge tier={row.current.worst_tier} />
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className="text-xs font-medium"
                            style={{ color: CONSTRAINT_COLORS[row.current.constraint] ?? "#94a3b8" }}
                          >
                            {row.current.constraint_label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-bold" style={{ color: trend.color }} title={trend.label}>
                            {trend.symbol}
                          </span>
                          <span className="text-[10px] ml-1" style={{ color: "#475569" }}>
                            {trend.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 tabular-nums" style={{ color: "#94a3b8" }}>
                          {m.new_leads}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2 tabular-nums" style={{ color: "#94a3b8" }}>
                            <KpiDot tier={grade("lead_to_qualified")?.tier ?? "insufficient"} />
                            {row.current.lead_to_qualified_pct.toFixed(0)}%
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2 tabular-nums" style={{ color: "#94a3b8" }}>
                            <KpiDot tier={grade("booking_rate")?.tier ?? "insufficient"} />
                            {m.appt_booking_rate.toFixed(0)}%
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2 tabular-nums" style={{ color: "#94a3b8" }}>
                            <KpiDot tier={grade("show_rate")?.tier ?? "insufficient"} />
                            {m.net_show_pct.toFixed(0)}%
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2 tabular-nums" style={{ color: "#94a3b8" }}>
                            <KpiDot tier={grade("cps")?.tier ?? "insufficient"} />
                            ${Math.round(m.cp_conversation)}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs" style={{ color: "#334155" }}>
                          {expanded ? "▲" : "▼"}
                        </td>
                      </tr>
                      {expanded && (
                        <tr key={`${row.client_id}-detail`}>
                          <td colSpan={10} className="px-4 pb-4 pt-0">
                            <div
                              className="rounded-lg p-4 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3"
                              style={{ background: "#050c18", border: "1px solid rgba(255,255,255,0.05)" }}
                            >
                              {row.current.grades.map(g => (
                                <div key={g.key}>
                                  <p className="text-[10px] uppercase tracking-wide mb-1" style={{ color: "#475569" }}>
                                    {KPI_META[g.key].short}
                                  </p>
                                  <p className="text-sm font-semibold tabular-nums" style={{ color: "#e2e8f0" }}>
                                    {g.display}
                                  </p>
                                  <TierBadge tier={g.tier} />
                                </div>
                              ))}
                            </div>
                            {row.prior && row.prior.metrics.new_leads + row.prior.metrics.booked_appointments > 0 && (
                              <p className="text-xs mt-2" style={{ color: "#475569" }}>
                                Prior period: {row.prior.metrics.new_leads} leads · {row.prior.metrics.net_show_pct.toFixed(0)}% show · $
                                {Math.round(row.prior.metrics.cp_conversation)} CPConv · attention score {row.prior.attention_score} →{" "}
                                {row.current.attention_score}
                              </p>
                            )}
                            {row.recent && (
                              <div className="mt-3">
                                <p className="text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: "#38bdf8" }}>
                                  Recent {row.recent.window_days}d (leading · early warning)
                                </p>
                                <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs tabular-nums" style={{ color: "#94a3b8" }}>
                                  <span>{row.recent.leads} leads</span>
                                  <span>{row.recent.dials} dials</span>
                                  <span>{row.recent.pickup_pct.toFixed(0)}% pickup</span>
                                  <span>{row.recent.lead_to_qualified_pct.toFixed(0)}% lead→qual</span>
                                  <span>{row.recent.booking_rate.toFixed(0)}% booking</span>
                                  <span>{row.recent.conversations} conversations</span>
                                </div>
                              </div>
                            )}
                            <button
                              type="button"
                              onClick={() => setDetail({ id: row.client_id, name: row.client_name })}
                              className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
                              style={{ background: "rgba(96,165,250,0.15)", color: "#60a5fa", border: "1px solid rgba(96,165,250,0.3)" }}
                            >
                              Open diagnosis & action log →
                            </button>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-[10px]" style={{ color: "#334155" }}>
        Grades follow Waiz Constraint Diagnosis tiers (911 / Below / At / Above). Booking rate uses appointments ÷ qualified
        leads. Low-volume clients may show “—” until minimum thresholds are met.
      </p>
    </div>
  );
}

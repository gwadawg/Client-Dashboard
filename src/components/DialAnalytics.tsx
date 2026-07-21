"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import KpiCard from "./kpi/KpiCard";
import HeatMap from "./HeatMap";
import { cachedJsonFetch, peekCachedJson } from "@/lib/client-fetch-cache";
import type {
  DialAnalyticsAgentRow,
  DialAnalyticsClientRow,
  DialAnalyticsResult,
  DialSourceRow,
} from "@/lib/dial-analytics";
import type { SpeedToLeadResult } from "@/lib/speed-to-lead";

type Props = {
  startDate: string;
  endDate: string;
  clientId?: string;
  liveOnly?: boolean;
};

const FLAG_STYLES = {
  low_pickup: { bg: "rgba(248,113,113,0.12)", text: "#f87171" },
  high_effort: { bg: "rgba(245,158,11,0.12)", text: "#fbbf24" },
  low_conversion: { bg: "rgba(167,139,250,0.12)", text: "#a78bfa" },
} as const;

function rateColor(rate: number): string {
  if (rate >= 50) return "#34d399";
  if (rate >= 25) return "#fbbf24";
  return "#f87171";
}

function SortHeader({
  label,
  active,
  asc,
  onClick,
  align = "right",
}: {
  label: string;
  active: boolean;
  asc: boolean;
  onClick: () => void;
  align?: "left" | "right";
}) {
  return (
    <th
      className={`px-4 py-3 text-xs font-semibold uppercase tracking-wider whitespace-nowrap cursor-pointer select-none ${
        align === "left" ? "text-left" : "text-right"
      }`}
      style={{ color: active ? "#f59e0b" : "#475569", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      onClick={onClick}
    >
      {label}
      {active ? (asc ? " ↑" : " ↓") : ""}
    </th>
  );
}

function AgentTable({ agents }: { agents: DialAnalyticsAgentRow[] }) {
  const [sortKey, setSortKey] = useState<keyof DialAnalyticsAgentRow>("dials");
  const [sortAsc, setSortAsc] = useState(false);

  const sorted = useMemo(() => {
    const copy = [...agents];
    copy.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === "number" && typeof bv === "number") {
        return sortAsc ? av - bv : bv - av;
      }
      return sortAsc
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });
    return copy;
  }, [agents, sortKey, sortAsc]);

  function toggle(key: keyof DialAnalyticsAgentRow) {
    if (sortKey === key) setSortAsc(v => !v);
    else {
      setSortKey(key);
      setSortAsc(false);
    }
  }

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: "#050c18" }}>
              <SortHeader label="Agent" active={sortKey === "agent_name"} asc={sortAsc} onClick={() => toggle("agent_name")} align="left" />
              <th
                className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider whitespace-nowrap"
                style={{ color: "#475569", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
              >
                Today
              </th>
              <SortHeader label="Dials" active={sortKey === "dials"} asc={sortAsc} onClick={() => toggle("dials")} />
              <SortHeader label="Dials/day" active={sortKey === "dials_per_day"} asc={sortAsc} onClick={() => toggle("dials_per_day")} />
              <SortHeader label="Pickups" active={sortKey === "pickups"} asc={sortAsc} onClick={() => toggle("pickups")} />
              <SortHeader label="Pickup %" active={sortKey === "pickup_rate"} asc={sortAsc} onClick={() => toggle("pickup_rate")} />
              <SortHeader label="Convos" active={sortKey === "conversations"} asc={sortAsc} onClick={() => toggle("conversations")} />
              <SortHeader label="Appts" active={sortKey === "appointments"} asc={sortAsc} onClick={() => toggle("appointments")} />
              <SortHeader label="Speed (med min)" active={sortKey === "avg_speed_to_lead_min"} asc={sortAsc} onClick={() => toggle("avg_speed_to_lead_min")} />
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center text-sm" style={{ color: "#1e3a5f" }}>
                  No dial activity in this period
                </td>
              </tr>
            ) : (
              sorted.map((a, i) => (
                <tr
                  key={a.agent_name}
                  style={{
                    borderTop: "1px solid rgba(255,255,255,0.03)",
                    background: i % 2 === 0 ? "rgba(255,255,255,0.015)" : "transparent",
                  }}
                >
                  <td className="px-4 py-3 font-medium whitespace-nowrap" style={{ color: "#e2e8f0" }}>
                    {a.agent_name}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-xs whitespace-nowrap" style={{ color: "#64748b" }}>
                    <span style={{ color: "#94a3b8" }}>{a.today.dials}</span> d /{" "}
                    <span style={{ color: "#94a3b8" }}>{a.today.pickups}</span> p
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums" style={{ color: "#94a3b8" }}>
                    {a.dials.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums" style={{ color: "#64748b" }}>
                    {a.dials_per_day}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums" style={{ color: "#94a3b8" }}>
                    {a.pickups.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium" style={{ color: rateColor(a.pickup_rate) }}>
                    {a.pickup_rate}%
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums" style={{ color: "#94a3b8" }}>
                    {a.conversations.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums" style={{ color: "#f59e0b" }}>
                    {a.appointments}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums" style={{ color: "#64748b" }}>
                    {a.avg_speed_to_lead_min != null ? a.avg_speed_to_lead_min : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ClientTable({ clients }: { clients: DialAnalyticsClientRow[] }) {
  const [hideHealthy, setHideHealthy] = useState(false);
  const flagged = clients.filter(c => c.flag);
  const rows = hideHealthy ? flagged : clients;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: "#64748b" }}>
          <input
            type="checkbox"
            checked={hideHealthy}
            onChange={e => setHideHealthy(e.target.checked)}
            className="rounded"
          />
          Show flagged clients only ({flagged.length})
        </label>
      </div>
      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: "#050c18" }}>
                {["Client", "Dials", "Pickup %", "Leads", "Dials/lead", "Convos", "Appts", "Book %", "Signal"].map((h, i) => (
                  <th
                    key={h}
                    className={`px-4 py-3 text-xs font-semibold uppercase tracking-wider whitespace-nowrap ${
                      i === 0 ? "text-left" : "text-right"
                    }`}
                    style={{ color: "#475569", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-sm" style={{ color: "#1e3a5f" }}>
                    {hideHealthy ? "No flagged clients" : "No client dial data"}
                  </td>
                </tr>
              ) : (
                rows.map((c, i) => {
                  const flagStyle = c.flag ? FLAG_STYLES[c.flag] : null;
                  return (
                    <tr
                      key={c.client_id}
                      style={{
                        borderTop: "1px solid rgba(255,255,255,0.03)",
                        background: i % 2 === 0 ? "rgba(255,255,255,0.015)" : "transparent",
                      }}
                    >
                      <td className="px-4 py-3 whitespace-nowrap" style={{ color: "#e2e8f0" }}>
                        <span className="font-medium">{c.client_name}</span>
                        {!c.is_live && (
                          <span className="ml-2 text-[10px] uppercase" style={{ color: "#475569" }}>
                            offline
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums" style={{ color: "#94a3b8" }}>
                        {c.dials.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium" style={{ color: rateColor(c.pickup_rate) }}>
                        {c.pickup_rate}%
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums" style={{ color: "#94a3b8" }}>
                        {c.leads}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums" style={{ color: "#64748b" }}>
                        {c.dials_per_lead}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums" style={{ color: "#94a3b8" }}>
                        {c.conversations}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums" style={{ color: "#f59e0b" }}>
                        {c.appointments}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums" style={{ color: "#94a3b8" }}>
                        {c.booking_rate}%
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {flagStyle && c.flag_label ? (
                          <span
                            className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold"
                            style={{ background: flagStyle.bg, color: flagStyle.text }}
                          >
                            {c.flag_label}
                          </span>
                        ) : (
                          <span style={{ color: "#334155" }}>—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function fmtHourLabel(hour: number): string {
  if (hour === 0) return "12 am";
  if (hour < 12) return `${hour} am`;
  if (hour === 12) return "12 pm";
  return `${hour - 12} pm`;
}

function SpeedToLeadSection({
  stl,
  useSetterSchedule,
  setUseSetterSchedule,
  leadAfter,
  setLeadAfter,
  leadBefore,
  setLeadBefore,
}: {
  stl: SpeedToLeadResult;
  useSetterSchedule: boolean;
  setUseSetterSchedule: (v: boolean) => void;
  leadAfter: string;
  setLeadAfter: (v: string) => void;
  leadBefore: string;
  setLeadBefore: (v: string) => void;
}) {
  const hourChart = useMemo(
    () =>
      Array.from({ length: 24 }, (_, hour) => ({
        hour,
        label: fmtHourLabel(hour),
        median_min: stl.by_hour[hour]?.median_min ?? null,
        sample_size: stl.by_hour[hour]?.sample_size ?? 0,
      })),
    [stl.by_hour],
  );

  const hasHourData = hourChart.some(h => h.sample_size > 0);

  return (
    <section>
      <h3 className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "#334155" }}>
        Speed to Lead
      </h3>
      <p className="text-[11px] mb-4 max-w-3xl" style={{ color: "#475569" }}>
        Median minutes from lead arrival to first dial. Leads are bucketed by arrival hour in{" "}
        <span className="font-medium" style={{ color: "#64748b" }}>{stl.time_zone}</span>.
        {stl.live_window_count === 0 ? (
          <span style={{ color: "#fbbf24" }}> No setter schedule configured — all precise leads count.</span>
        ) : null}
      </p>

      <div
        className="rounded-xl p-4 mb-4 flex flex-wrap items-end gap-4"
        style={{ background: "#0a1628", border: "1px solid rgba(255,255,255,0.06)" }}
      >
        <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: "#94a3b8" }}>
          <input
            type="checkbox"
            checked={useSetterSchedule}
            onChange={e => setUseSetterSchedule(e.target.checked)}
            className="rounded"
          />
          Use setter schedule ({stl.live_window_count} live window{stl.live_window_count === 1 ? "" : "s"})
        </label>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] uppercase tracking-wide" style={{ color: "#475569" }}>
            Lead arrived after
          </label>
          <input
            type="time"
            value={leadAfter}
            onChange={e => setLeadAfter(e.target.value)}
            className="px-2 py-1.5 rounded-lg text-sm outline-none"
            style={{ background: "#0f2040", border: "1px solid rgba(255,255,255,0.12)", color: "#e2e8f0" }}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] uppercase tracking-wide" style={{ color: "#475569" }}>
            Lead arrived before
          </label>
          <input
            type="time"
            value={leadBefore}
            onChange={e => setLeadBefore(e.target.value)}
            className="px-2 py-1.5 rounded-lg text-sm outline-none"
            style={{ background: "#0f2040", border: "1px solid rgba(255,255,255,0.12)", color: "#e2e8f0" }}
          />
        </div>
        {(leadAfter || leadBefore) && (
          <button
            type="button"
            onClick={() => {
              setLeadAfter("");
              setLeadBefore("");
            }}
            className="text-xs px-2 py-1.5 rounded-lg"
            style={{ color: "#64748b", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            Clear time filters
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {[
          { label: `${stl.sample_size} counted`, color: "#34d399" },
          { label: `${stl.excluded_out_of_window} off-hours`, color: "#64748b" },
          { label: `${stl.excluded_no_time} missing timestamp`, color: "#64748b" },
          ...(stl.excluded_before_cutoff > 0
            ? [{ label: `${stl.excluded_before_cutoff} before cutoff`, color: "#fbbf24" }]
            : []),
          ...(stl.excluded_after_cutoff > 0
            ? [{ label: `${stl.excluded_after_cutoff} after cutoff`, color: "#fbbf24" }]
            : []),
        ].map(chip => (
          <span
            key={chip.label}
            className="text-[10px] font-semibold px-2.5 py-1 rounded-full"
            style={{ background: "rgba(255,255,255,0.04)", color: chip.color, border: "1px solid rgba(255,255,255,0.06)" }}
          >
            {chip.label}
          </span>
        ))}
      </div>

      {hasHourData ? (
        <div
          className="rounded-xl p-4"
          style={{ background: "#0a1628", border: "1px solid rgba(255,255,255,0.06)" }}
        >
          <p className="text-[10px] mb-3" style={{ color: "#475569" }}>
            Median response time by lead-arrival hour ({stl.time_zone})
          </p>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={hourChart} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: "#475569", fontSize: 10 }} axisLine={false} tickLine={false} interval={1} />
              <YAxis tick={{ fill: "#475569", fontSize: 11 }} axisLine={false} tickLine={false} unit="m" />
              <Tooltip
                contentStyle={{
                  background: "#0f2040",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                labelStyle={{ color: "#94a3b8" }}
                formatter={(value, _name, item) => {
                  const num = typeof value === "number" ? value : null;
                  const payload = item?.payload as { sample_size?: number } | undefined;
                  if (num == null) return ["No data", "Median"];
                  return [`${num} min (${payload?.sample_size ?? 0} leads)`, "Median"];
                }}
              />
              <Bar dataKey="median_min" name="Median min" fill="#f59e0b" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="text-xs py-8 text-center rounded-xl" style={{ color: "#475569", background: "#0a1628" }}>
          No in-window speed-to-lead readings in this period with the current filters.
        </p>
      )}
    </section>
  );
}

function DialSourceTable({ sources }: { sources: DialSourceRow[] }) {
  if (sources.length === 0) return null;
  return (
    <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
      <table className="w-full text-sm">
        <thead>
          <tr style={{ background: "#050c18" }}>
            {["Software", "Dials", "Pickup %"].map((h, i) => (
              <th
                key={h}
                className={`px-4 py-3 text-xs font-semibold uppercase tracking-wider ${i === 0 ? "text-left" : "text-right"}`}
                style={{ color: "#475569", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sources.slice(0, 8).map((s, i) => (
            <tr
              key={s.source}
              style={{
                borderTop: "1px solid rgba(255,255,255,0.03)",
                background: i % 2 === 0 ? "rgba(255,255,255,0.015)" : "transparent",
              }}
            >
              <td className="px-4 py-3 font-medium" style={{ color: "#e2e8f0" }}>
                {s.source}
              </td>
              <td className="px-4 py-3 text-right tabular-nums" style={{ color: "#94a3b8" }}>
                {s.dials.toLocaleString()}
              </td>
              <td className="px-4 py-3 text-right tabular-nums font-medium" style={{ color: rateColor(s.pickup_rate) }}>
                {s.pickup_rate}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type RecentDialRow = {
  occurred_at: string;
  lead_name: string | null;
  lead_phone: string | null;
  agent_name: string | null;
  duration_seconds: number | null;
  recording_url: string | null;
  clients: { name: string } | null;
};

function fmtDialWhen(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function RecentDialsPanel({ startDate, endDate, clientId, liveOnly }: Props) {
  const [rows, setRows] = useState<RecentDialRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!startDate || !endDate) return;
    setLoading(true);
    const params = new URLSearchParams({ type: "dials", page: "1" });
    params.set("start_date", startDate);
    params.set("end_date", endDate);
    if (clientId) params.set("client_id", clientId);
    else if (liveOnly) params.set("live_only", "true");

    fetch(`/api/raw?${params}`)
      .then(r => r.json())
      .then(d => {
        setRows((d.rows ?? []).slice(0, 30));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [startDate, endDate, clientId, liveOnly]);

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: "#050c18" }}>
              {["When", "Client", "Lead", "Agent", "Duration", "Recording"].map((h, i) => (
                <th
                  key={h}
                  className={`px-4 py-3 text-xs font-semibold uppercase tracking-wider whitespace-nowrap ${i >= 4 ? "text-right" : "text-left"}`}
                  style={{ color: "#475569", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm" style={{ color: "#1e3a5f" }}>
                  Loading recent dials…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm" style={{ color: "#1e3a5f" }}>
                  No dials in this period
                </td>
              </tr>
            ) : (
              rows.map((row, i) => (
                <tr
                  key={`${row.occurred_at}-${i}`}
                  style={{
                    borderTop: "1px solid rgba(255,255,255,0.03)",
                    background: i % 2 === 0 ? "rgba(255,255,255,0.015)" : "transparent",
                  }}
                >
                  <td className="px-4 py-2.5 whitespace-nowrap text-xs" style={{ color: "#64748b" }}>
                    {fmtDialWhen(row.occurred_at)}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap" style={{ color: "#94a3b8" }}>
                    {row.clients?.name ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap" style={{ color: "#e2e8f0" }}>
                    {row.lead_name ?? row.lead_phone ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap" style={{ color: "#94a3b8" }}>
                    {row.agent_name ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums whitespace-nowrap" style={{ color: "#94a3b8" }}>
                    {row.duration_seconds != null ? `${row.duration_seconds}s` : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    {row.recording_url ? (
                      <a
                        href={row.recording_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-semibold"
                        style={{ color: "#f59e0b" }}
                      >
                        ▶ Listen
                      </a>
                    ) : (
                      <span className="text-xs" style={{ color: "#334155" }}>—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function DialAnalytics({ startDate, endDate, clientId, liveOnly }: Props) {
  const [data, setData] = useState<DialAnalyticsResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [useSetterSchedule, setUseSetterSchedule] = useState(true);
  const [leadAfter, setLeadAfter] = useState("");
  const [leadBefore, setLeadBefore] = useState("");

  useEffect(() => {
    if (!startDate || !endDate) return;
    const params = new URLSearchParams({ startDate, endDate });
    if (clientId) params.set("client_id", clientId);
    else if (liveOnly) params.set("live_only", "true");
    params.set("use_setter_schedule", useSetterSchedule ? "true" : "false");
    if (leadAfter) params.set("lead_after", leadAfter);
    if (leadBefore) params.set("lead_before", leadBefore);

    const cacheKey = `dial-analytics|${params.toString()}`;
    type Payload = { summary?: unknown } | null;
    const peek = peekCachedJson<Payload>(cacheKey);
    if (peek?.summary) {
      setData(peek as NonNullable<typeof data>);
      setLoading(false);
    } else {
      setLoading(true);
    }

    const ac = new AbortController();
    cachedJsonFetch<Payload>(cacheKey, `/api/dial-analytics?${params}`, {
      signal: ac.signal,
      preferCache: false,
    })
      .then(d => {
        if (!ac.signal.aborted) setData(d?.summary ? (d as NonNullable<typeof data>) : null);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false);
      });
    return () => ac.abort();
  }, [startDate, endDate, clientId, liveOnly, useSetterSchedule, leadAfter, leadBefore]);

  const trendChart = useMemo(() => {
    if (!data?.trend?.length) return [];
    return data.trend.map(p => ({
      ...p,
      label: new Date(`${p.date}T12:00:00.000Z`).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      }),
    }));
  }, [data?.trend]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24" style={{ color: "#334155" }}>
        <span className="text-sm font-medium">Loading dial analytics…</span>
      </div>
    );
  }

  if (!data) {
    return (
      <p className="text-sm py-12 text-center" style={{ color: "#1e3a5f" }}>
        No dial data for this period
      </p>
    );
  }

  const s = data.summary;

  return (
    <div className="space-y-10 max-w-7xl">
      <div>
        <h2 className="text-xl font-semibold" style={{ color: "#e2e8f0" }}>
          Dial Analytics
        </h2>
        <p className="text-sm mt-1 max-w-2xl" style={{ color: "#475569" }}>
          Team dialing volume, pickup rates, and client-level effort signals. Use flagged clients to spot list quality or
          conversion issues; compare agents on today vs period totals.
        </p>
      </div>

      <section>
        <h3 className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: "#334155" }}>
          Period summary
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
          <KpiCard label="Outbound Dials" value={s.dials.toLocaleString()} accent />
          <KpiCard label="Pickups (40s+)" value={s.pickups.toLocaleString()} />
          <KpiCard label="Pick Up Rate" value={`${s.pickup_rate}%`} accent />
          <KpiCard label="Conversations (2m+)" value={s.conversations.toLocaleString()} />
          <KpiCard label="Avg Dials / Day" value={String(s.avg_dials_per_day)} />
          <KpiCard label="Today (dials / pickups)" value={`${s.today_dials} / ${s.today_pickups}`} />
          <KpiCard label="Dials per Lead" value={String(s.dials_per_lead)} />
          <KpiCard
            label="Speed to Lead (median min)"
            value={s.avg_speed_to_lead_min != null ? String(s.avg_speed_to_lead_min) : "—"}
            hint={
              `Median minutes from lead to first dial across ${s.speed_to_lead.sample_size} in-window lead${s.speed_to_lead.sample_size === 1 ? "" : "s"}. ` +
              `Excluded: ${s.speed_to_lead.excluded_out_of_window} off-hours, ${s.speed_to_lead.excluded_no_time} missing timestamp` +
              (s.speed_to_lead.excluded_before_cutoff > 0 ? `, ${s.speed_to_lead.excluded_before_cutoff} before cutoff` : "") +
              (s.speed_to_lead.excluded_after_cutoff > 0 ? `, ${s.speed_to_lead.excluded_after_cutoff} after cutoff` : "") +
              "."
            }
          />
          <KpiCard label="Appointments" value={s.appointments.toLocaleString()} />
          <KpiCard label="Booking Rate" value={`${s.booking_rate}%`} />
        </div>
      </section>

      <SpeedToLeadSection
        stl={data.speed_to_lead}
        useSetterSchedule={useSetterSchedule}
        setUseSetterSchedule={setUseSetterSchedule}
        leadAfter={leadAfter}
        setLeadAfter={setLeadAfter}
        leadBefore={leadBefore}
        setLeadBefore={setLeadBefore}
      />

      {trendChart.length > 1 && (
        <section>
          <h3 className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: "#334155" }}>
            Daily activity
          </h3>
          <div
            className="rounded-xl p-4"
            style={{ background: "#0a1628", border: "1px solid rgba(255,255,255,0.06)" }}
          >
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={trendChart} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: "#475569", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="left" tick={{ fill: "#475569", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  domain={[0, 100]}
                  tick={{ fill: "#475569", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={v => `${v}%`}
                />
                <Tooltip
                  contentStyle={{
                    background: "#0f2040",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  labelStyle={{ color: "#94a3b8" }}
                />
                <Legend wrapperStyle={{ fontSize: 12, color: "#64748b" }} />
                <Line yAxisId="left" type="monotone" dataKey="dials" name="Dials" stroke="#f59e0b" strokeWidth={2} dot={false} />
                <Line yAxisId="left" type="monotone" dataKey="pickups" name="Pickups" stroke="#34d399" strokeWidth={2} dot={false} />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="pickup_rate"
                  name="Pickup %"
                  stroke="#60a5fa"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      <section>
        <h3 className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: "#334155" }}>
          Agent activity
        </h3>
        <AgentTable agents={data.agents} />
      </section>

      {!clientId && (
        <section>
          <h3 className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "#334155" }}>
            Client dial performance
          </h3>
          <p className="text-[11px] mb-4" style={{ color: "#475569" }}>
            Signals compare each client to team averages: low pickup (list/script), high dials per lead (extra effort),
            low booking (conversion).
          </p>
          <ClientTable clients={data.clients} />
        </section>
      )}

      {data.dial_sources.length > 1 && (
        <section>
          <h3 className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: "#334155" }}>
            Dialing software
          </h3>
          <DialSourceTable sources={data.dial_sources} />
        </section>
      )}

      <section>
        <h3 className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "#334155" }}>
          Recent dials
        </h3>
        <p className="text-[11px] mb-4" style={{ color: "#475569" }}>
          Latest outbound dials in this period. Recording links appear when GHL sends them through Make.
        </p>
        <RecentDialsPanel startDate={startDate} endDate={endDate} clientId={clientId} liveOnly={liveOnly} />
      </section>

      <section>
        <h3 className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: "#334155" }}>
          Pickup rate by hour (UTC)
        </h3>
        <HeatMap
          type="pickup_rate"
          startDate={startDate}
          endDate={endDate}
          clientId={clientId}
          liveOnly={liveOnly && !clientId}
        />
      </section>
    </div>
  );
}

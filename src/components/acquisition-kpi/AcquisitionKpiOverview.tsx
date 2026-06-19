"use client";

import { useEffect, useState } from "react";
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";
import type { AcquisitionMetricsResult } from "@/lib/acquisition-metrics";
import type { AcquisitionTimeseriesBucket } from "@/lib/acquisition-metrics-timeseries";
import type { CallQualityResult } from "@/lib/acquisition-call-quality";
import { rateColor, thresholdStyle } from "@/lib/acquisition-kpi-thresholds";
import type { KpiFilters } from "./AcquisitionKpiFilterBar";
import { fmtPct, fmtNum } from "./kpi-fmt";

// ── Shared card primitives ──────────────────────────────────────────────────

function HeroCard({
  label, value, sub, color = "#e2e8f0", accent,
}: { label: string; value: string; sub?: string; color?: string; accent?: string }) {
  return (
    <div
      className="flex flex-col gap-2 p-6"
      style={{ background: "#0f1115", borderRight: "1px solid rgba(255,255,255,0.06)", position: "relative", overflow: "hidden" }}
    >
      {accent && <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: accent }} />}
      <div style={{ fontFamily: "monospace", fontSize: 9, color: "#475569", textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</div>
      <div style={{ fontSize: 36, fontWeight: 700, letterSpacing: "-1.5px", color, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontFamily: "monospace", fontSize: 10, color: "#334155" }}>{sub}</div>}
    </div>
  );
}

function RateCard({
  label, value, metricKey, sub,
}: { label: string; value: number | null | undefined; metricKey: string; sub?: string }) {
  const color = rateColor(metricKey, value ?? null);
  const style = thresholdStyle(color);
  return (
    <div className="flex flex-col gap-2 p-5" style={{ background: "#0f1115", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8 }}>
      <div style={{ fontFamily: "monospace", fontSize: 9, color: "#475569", textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-1px", lineHeight: 1, ...style }}>{fmtPct(value)}</div>
      {sub && <div style={{ fontFamily: "monospace", fontSize: 9, color: "#334155" }}>{sub}</div>}
    </div>
  );
}

function SectionHead({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <span style={{ fontFamily: "monospace", fontSize: 9, color: "#334155", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 600 }}>
        {title}
      </span>
      <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.04)" }} />
    </div>
  );
}

// ── Funnel flow visualization ───────────────────────────────────────────────

type FunnelStage = { label: string; count: number; conv?: number | null };

function FunnelViz({ stages }: { stages: FunnelStage[] }) {
  const max = Math.max(...stages.map(s => s.count), 1);
  const colors = ["#4f8ef5", "#2dd4bf", "#2dd4bf", "#f0a832", "#f0a832", "#3ecf8e", "#3ecf8e"];
  return (
    <div className="flex flex-col gap-2">
      {stages.map((s, i) => {
        const pct = (s.count / max) * 100;
        return (
          <div key={s.label} className="flex items-center gap-3">
            <div style={{ width: 160, textAlign: "right", fontFamily: "monospace", fontSize: 10, color: "#64748b", flexShrink: 0 }}>
              {s.label}
            </div>
            <div style={{ flex: 1, background: "rgba(255,255,255,0.04)", borderRadius: 3, height: 24, overflow: "hidden" }}>
              <div
                style={{
                  width: `${pct}%`, height: "100%", background: colors[i % colors.length],
                  borderRadius: 3, display: "flex", alignItems: "center", padding: "0 10px",
                  minWidth: 32, transition: "width 0.8s cubic-bezier(.22,1,.36,1)",
                }}
              />
            </div>
            <div style={{ width: 48, textAlign: "right", fontFamily: "monospace", fontSize: 11, color: "#94a3b8", flexShrink: 0 }}>
              {fmtNum(s.count)}
            </div>
            <div style={{ width: 44, textAlign: "right", fontFamily: "monospace", fontSize: 9, color: "#334155", flexShrink: 0 }}>
              {s.conv != null ? fmtPct(s.conv) : ""}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Appointment activity chart (no cost data) ───────────────────────────────

function formatDay(d: string) {
  const dt = new Date(`${d}T00:00:00Z`);
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function AppointmentActivityChart({ data }: { data: AcquisitionTimeseriesBucket[] }) {
  const chartData = data.map(d => ({
    label: formatDay(d.date),
    leads: d.leads,
    intros: d.intros_showed,
    demos: d.demos_showed,
  }));
  return (
    <ResponsiveContainer width="100%" height={200}>
      <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
        <XAxis dataKey="label" tick={{ fontSize: 9, fill: "#334155" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
        <YAxis tick={{ fontSize: 9, fill: "#334155" }} tickLine={false} axisLine={false} width={28} />
        <Tooltip
          contentStyle={{ background: "#0f1115", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, fontSize: 11 }}
          labelStyle={{ color: "#94a3b8" }}
        />
        <Bar dataKey="leads" fill="rgba(79,142,245,0.25)" name="Leads" />
        <Line type="monotone" dataKey="intros" stroke="#2dd4bf" strokeWidth={2} dot={false} name="Intros showed" />
        <Line type="monotone" dataKey="demos" stroke="#f0a832" strokeWidth={2} dot={false} name="Demos showed" />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "#0f1115", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, padding: "20px 22px" }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: "#94a3b8", marginBottom: 16 }}>{title}</div>
      {children}
    </div>
  );
}

// ── No-show breakdown ───────────────────────────────────────────────────────

function NoShowCard({ label, value, color = "#94a3b8", sub }: { label: string; value: string | number; color?: string; sub?: string }) {
  return (
    <div style={{ background: "#0f1115", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, padding: "16px 18px" }}>
      <div style={{ fontFamily: "monospace", fontSize: 9, color: "#475569", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color, letterSpacing: "-0.5px" }}>{value}</div>
      {sub && <div style={{ fontFamily: "monospace", fontSize: 9, color: "#334155", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

// ── Call quality snapshot ───────────────────────────────────────────────────

function QualitySnapshot({ quality }: { quality: CallQualityResult }) {
  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
      <div style={{ background: "#0f1115", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, padding: "18px 20px" }}>
        <div style={{ fontFamily: "monospace", fontSize: 9, color: "#475569", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
          Avg call rating
        </div>
        <div style={{ fontSize: 28, fontWeight: 700, color: "#3ecf8e", letterSpacing: "-1px" }}>
          {quality.avg_call_rating != null ? quality.avg_call_rating.toFixed(1) + "/10" : "—"}
        </div>
        <div style={{ fontFamily: "monospace", fontSize: 9, color: "#334155", marginTop: 4 }}>
          {quality.total_documented} documented calls
        </div>
      </div>

      <div style={{ background: "#0f1115", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, padding: "18px 20px" }}>
        <div style={{ fontFamily: "monospace", fontSize: 9, color: "#475569", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
          Top surface objections
        </div>
        {quality.top_surface_objections.length === 0 ? (
          <p style={{ fontSize: 11, color: "#334155" }}>No data</p>
        ) : (
          <div className="flex flex-col gap-2">
            {quality.top_surface_objections.slice(0, 3).map(o => (
              <div key={o.objection} className="flex items-center justify-between gap-2">
                <span style={{ fontSize: 11, color: "#94a3b8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.objection}</span>
                <span style={{ fontFamily: "monospace", fontSize: 10, color: "#64748b", flexShrink: 0 }}>{o.count}×</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ background: "#0f1115", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, padding: "18px 20px" }}>
        <div style={{ fontFamily: "monospace", fontSize: 9, color: "#475569", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
          Lead quality distribution
        </div>
        {Object.keys(quality.lead_quality_distribution).length === 0 ? (
          <p style={{ fontSize: 11, color: "#334155" }}>No data</p>
        ) : (
          <div className="flex flex-col gap-2">
            {Object.entries(quality.lead_quality_distribution)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 4)
              .map(([k, v]) => (
                <div key={k} className="flex items-center justify-between gap-2">
                  <span style={{ fontSize: 11, color: "#94a3b8" }}>{k}</span>
                  <span style={{ fontFamily: "monospace", fontSize: 10, color: "#64748b" }}>{v}</span>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Overview component ─────────────────────────────────────────────────

type Props = {
  startDate: string;
  endDate: string;
  filters: KpiFilters;
};

export default function AcquisitionKpiOverview({ startDate, endDate, filters }: Props) {
  const [metrics, setMetrics] = useState<AcquisitionMetricsResult | null>(null);
  const [series, setSeries] = useState<AcquisitionTimeseriesBucket[]>([]);
  const [quality, setQuality] = useState<CallQualityResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const q = new URLSearchParams({ from: startDate, to: endDate, offer_scope: filters.offerScope });
    Promise.all([
      fetch(`/api/acquisition/metrics?${q}`).then(r => r.json()),
      fetch(`/api/acquisition/metrics/timeseries?${q}`).then(r => r.json()),
      fetch(`/api/acquisition/call-quality?${new URLSearchParams({ from: startDate, to: endDate })}`).then(r => r.json()),
    ]).then(([m, ts, cq]) => {
      setMetrics(m.metrics ?? null);
      setSeries(ts.series ?? []);
      setQuality(cq.quality ?? null);
    }).finally(() => setLoading(false));
  }, [startDate, endDate, filters.offerScope]);

  if (loading) return <div className="py-16 text-center" style={{ color: "#334155", fontFamily: "monospace", fontSize: 12 }}>Loading…</div>;
  if (!metrics) return <div className="py-16 text-center" style={{ color: "#334155", fontFamily: "monospace", fontSize: 12 }}>No data in range.</div>;

  const m = metrics;

  const funnelStages: FunnelStage[] = [
    { label: "Total leads", count: m.leads },
    { label: "Intros booked", count: m.intros_booked, conv: m.intro_booking_rate },
    { label: "Intros showed", count: m.intros_showed, conv: m.intro_show_rate },
    { label: "Demos booked", count: m.demos_booked, conv: m.demo_booking_rate },
    { label: "Demos showed", count: m.demos_showed, conv: m.demo_show_rate },
    { label: "Offers made", count: m.offers_made, conv: m.offer_rate },
    { label: "Closes", count: m.closes, conv: m.close_rate },
  ];

  const ns = m.no_show_breakdown;

  return (
    <div className="flex flex-col gap-8 pb-12">

      {/* Hero row — activity & conversions only, no cost data */}
      <div>
        <SectionHead title="Performance snapshot" />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 1, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, overflow: "hidden" }}>
          <HeroCard label="Total leads" value={fmtNum(m.leads)} sub={`${fmtNum(m.meta_leads)} from Meta`} color="#e2e8f0" accent="#4f8ef5" />
          <HeroCard label="Intros booked" value={fmtNum(m.intros_booked)} sub={`${fmtNum(m.intros_showed)} showed`} accent="#2dd4bf" />
          <HeroCard label="Demos booked" value={fmtNum(m.demos_booked)} sub={`${fmtNum(m.demos_showed)} showed`} accent="#f0a832" />
          <HeroCard label="Closes" value={fmtNum(m.closes)} sub={`${fmtNum(m.offers_made)} offers made`} color="#3ecf8e" accent="#3ecf8e" />
        </div>

        {/* Funnel volume row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, overflow: "hidden", marginTop: 1 }}>
          <div className="p-5" style={{ background: "#0f1115" }}>
            <div style={{ fontFamily: "monospace", fontSize: 9, color: "#475569", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Intros booked</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: "#e2e8f0", letterSpacing: "-1px" }}>{fmtNum(m.intros_booked)}</div>
            <div className="flex gap-4 mt-3">
              <div><div style={{ fontSize: 8, color: "#334155" }}>Took place</div><div style={{ fontSize: 13, fontWeight: 600, color: "#94a3b8" }}>{fmtNum(m.intros_taken_place)}</div></div>
              <div><div style={{ fontSize: 8, color: "#334155" }}>Show %</div><div style={{ fontSize: 13, fontWeight: 600, color: "#2dd4bf" }}>{fmtPct(m.intro_show_rate)}</div></div>
            </div>
          </div>
          <div className="p-5" style={{ background: "#0f1115" }}>
            <div style={{ fontFamily: "monospace", fontSize: 9, color: "#475569", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Demos booked</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: "#e2e8f0", letterSpacing: "-1px" }}>{fmtNum(m.demos_booked)}</div>
            <div className="flex gap-4 mt-3">
              <div><div style={{ fontSize: 8, color: "#334155" }}>Took place</div><div style={{ fontSize: 13, fontWeight: 600, color: "#94a3b8" }}>{fmtNum(m.demos_taken_place)}</div></div>
              <div><div style={{ fontSize: 8, color: "#334155" }}>Show %</div><div style={{ fontSize: 13, fontWeight: 600, color: "#f0a832" }}>{fmtPct(m.demo_show_rate)}</div></div>
            </div>
          </div>
          <div className="p-5" style={{ background: "#0f1115" }}>
            <div style={{ fontFamily: "monospace", fontSize: 9, color: "#475569", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Closes &amp; offers</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: "#3ecf8e", letterSpacing: "-1px" }}>{fmtNum(m.closes)}</div>
            <div className="flex gap-4 mt-3">
              <div><div style={{ fontSize: 8, color: "#334155" }}>Offers made</div><div style={{ fontSize: 13, fontWeight: 600, color: "#94a3b8" }}>{fmtNum(m.offers_made)}</div></div>
              <div><div style={{ fontSize: 8, color: "#334155" }}>Close %</div><div style={{ fontSize: 13, fontWeight: 600, color: "#3ecf8e" }}>{fmtPct(m.close_rate)}</div></div>
            </div>
          </div>
        </div>
      </div>

      {/* Conversion rates */}
      <div>
        <SectionHead title="Conversion rates" />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
          <RateCard label="Intro booking rate" value={m.intro_booking_rate} metricKey="intro_booking_rate" sub="unique leads → intro booked" />
          <RateCard label="Intro show rate" value={m.intro_show_rate} metricKey="intro_show_rate" sub="of intros that took place" />
          <RateCard label="Demo booking rate" value={m.demo_booking_rate} metricKey="demo_booking_rate" sub="intros showed → demo booked" />
          <RateCard label="Demo show rate" value={m.demo_show_rate} metricKey="demo_show_rate" sub="of demos that took place" />
          <RateCard label="Offer → close" value={m.close_rate} metricKey="close_rate" sub="offers to paid clients" />
          <RateCard label="Demo → close" value={m.demo_to_close_rate} metricKey="demo_to_close_rate" sub="demos showed to close" />
        </div>
      </div>

      {/* Funnel flow */}
      <div>
        <SectionHead title="Funnel flow" />
        <div style={{ background: "#0f1115", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, padding: "20px 24px" }}>
          <FunnelViz stages={funnelStages} />
        </div>
      </div>

      {/* Appointment activity chart — leads, intros showed, demos showed */}
      <div>
        <SectionHead title="Activity trends" />
        <ChartCard title="Daily leads · intros showed · demos showed">
          <AppointmentActivityChart data={series} />
        </ChartCard>
      </div>

      {/* No-show breakdown — appointment counts only, no cost cards */}
      <div>
        <SectionHead title="Appointment status breakdown" />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
          <NoShowCard label="Showed" value={fmtNum(ns.showed)} color="#3ecf8e" />
          <NoShowCard label="Lead no-show" value={fmtNum(ns.lead_no_show)} color="#e84040" />
          <NoShowCard label="Cancelled" value={fmtNum(ns.cancelled)} color="#f0a832" />
          <NoShowCard label="Team no-show" value={fmtNum(ns.team_no_show)} color="#94a3b8" />
          <NoShowCard label="Overall show rate" value={fmtPct(ns.show_rate)} color="#3ecf8e" sub="excl. cancelled" />
        </div>
      </div>

      {/* Call quality snapshot */}
      {quality && quality.total_documented > 0 && (
        <div>
          <SectionHead title="Call quality snapshot" />
          <QualitySnapshot quality={quality} />
        </div>
      )}
    </div>
  );
}

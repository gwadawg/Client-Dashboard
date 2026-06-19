"use client";

import { useEffect, useState } from "react";
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, LineChart,
} from "recharts";
import type { AcquisitionMetricsResult } from "@/lib/acquisition-metrics";
import type { AcquisitionTimeseriesBucket } from "@/lib/acquisition-metrics-timeseries";
import type { KpiFilters } from "./AcquisitionKpiFilterBar";
import { fmtMoney, fmtNum, fmtPct } from "./kpi-fmt";

function SectionHead({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <span style={{ fontFamily: "monospace", fontSize: 9, color: "#334155", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 600 }}>{title}</span>
      <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.04)" }} />
    </div>
  );
}

function CostCard({
  label, value, sub, color = "#e2e8f0", highlight = false,
}: { label: string; value: string; sub?: string; color?: string; highlight?: boolean }) {
  return (
    <div
      style={{
        background: "#0f1115",
        border: `1px solid ${highlight ? "rgba(79,142,245,0.3)" : "rgba(255,255,255,0.06)"}`,
        borderRadius: 8, padding: "18px 18px 14px",
      }}
    >
      <div style={{ fontFamily: "monospace", fontSize: 9, color: "#475569", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8, lineHeight: 1.4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.8px", color }}>{value}</div>
      {sub && <div style={{ fontFamily: "monospace", fontSize: 9, color: "#334155", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function NoShowCard({ label, value, color = "#94a3b8", sub }: { label: string; value: string; color?: string; sub?: string }) {
  return (
    <div style={{ background: "#0f1115", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, padding: "16px 18px" }}>
      <div style={{ fontFamily: "monospace", fontSize: 9, color: "#475569", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color, letterSpacing: "-0.5px" }}>{value}</div>
      {sub && <div style={{ fontFamily: "monospace", fontSize: 9, color: "#334155", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function formatDay(d: string) {
  const dt = new Date(`${d}T00:00:00Z`);
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "#0f1115", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, padding: "20px 22px" }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: "#94a3b8", marginBottom: 16 }}>{title}</div>
      {children}
    </div>
  );
}

type Props = {
  startDate: string;
  endDate: string;
  filters: KpiFilters;
};

export default function AcquisitionKpiCosts({ startDate, endDate, filters }: Props) {
  const [metrics, setMetrics] = useState<AcquisitionMetricsResult | null>(null);
  const [series, setSeries] = useState<AcquisitionTimeseriesBucket[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const q = new URLSearchParams({ from: startDate, to: endDate, offer_scope: filters.offerScope });
    Promise.all([
      fetch(`/api/acquisition/metrics?${q}`).then(r => r.json()),
      fetch(`/api/acquisition/metrics/timeseries?${q}`).then(r => r.json()),
    ]).then(([m, ts]) => {
      setMetrics(m.metrics ?? null);
      setSeries(ts.series ?? []);
    }).finally(() => setLoading(false));
  }, [startDate, endDate, filters.offerScope]);

  if (loading) return <div className="py-16 text-center" style={{ color: "#334155", fontFamily: "monospace", fontSize: 12 }}>Loading…</div>;
  if (!metrics) return <div className="py-16 text-center" style={{ color: "#334155", fontFamily: "monospace", fontSize: 12 }}>No data in range.</div>;

  const m = metrics;
  const ns = m.no_show_breakdown;

  const spendData = series.map(d => ({ label: formatDay(d.date), spend: d.ad_spend, leads: d.meta_leads }));
  const cplData = series.filter(d => d.cpl != null).map(d => ({ label: formatDay(d.date), cpl: d.cpl }));

  return (
    <div className="flex flex-col gap-8 pb-12">

      {/* Cost per stage grid */}
      <div>
        <SectionHead title="Cost per funnel stage" />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
          <CostCard label="Cost per lead (CPL)" value={fmtMoney(m.cpl)} sub="Meta spend ÷ Meta leads" color="#4f8ef5" highlight />
          <CostCard label="Cost / intro booked" value={fmtMoney(m.cost_per_intro)} />
          <CostCard label="Cost / intro showed" value={fmtMoney(m.cost_per_intro_showed)} />
          <CostCard label="Cost / demo booked" value={fmtMoney(m.cost_per_demo_booked)} />
          <CostCard label="Cost / demo showed" value={fmtMoney(m.cost_per_demo_showed)} />
          <CostCard label="Cost / offer" value={fmtMoney(m.cost_per_offer)} />
          <CostCard label="CAC — cost per close" value={fmtMoney(m.cac)} sub="customer acquisition cost" color="#4f8ef5" highlight />
          <CostCard label="Ad spend total" value={fmtMoney(m.ad_spend)} sub="Meta campaigns" color="#94a3b8" />
        </div>
      </div>

      {/* Cost trend charts */}
      <div>
        <SectionHead title="Cost trends" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <ChartCard title="Daily ad spend">
            <ResponsiveContainer width="100%" height={200}>
              <ComposedChart data={spendData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="label" tick={{ fontSize: 9, fill: "#334155" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 9, fill: "#334155" }} tickLine={false} axisLine={false} tickFormatter={v => `$${Math.round(v)}`} width={48} />
                <Tooltip
                  contentStyle={{ background: "#0f1115", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, fontSize: 11 }}
                  formatter={(v: unknown) => [`$${Math.round(Number(v))}`, "Spend"]}
                  labelStyle={{ color: "#94a3b8" }}
                />
                <Bar dataKey="spend" fill="rgba(79,142,245,0.4)" name="Ad Spend" />
              </ComposedChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="CPL trend — Meta leads">
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={cplData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="label" tick={{ fontSize: 9, fill: "#334155" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 9, fill: "#334155" }} tickLine={false} axisLine={false} tickFormatter={v => `$${Math.round(v)}`} width={44} />
                <Tooltip
                  contentStyle={{ background: "#0f1115", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, fontSize: 11 }}
                  formatter={(v: unknown) => [`$${Number(v).toFixed(2)}`, "CPL"]}
                  labelStyle={{ color: "#94a3b8" }}
                />
                <Line type="monotone" dataKey="cpl" stroke="#f0a832" strokeWidth={2} dot={false} name="CPL" />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      </div>

      {/* No-show breakdown */}
      <div>
        <SectionHead title="Appointment status & wasted spend" />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
          <NoShowCard label="Total scheduled" value={fmtNum(ns.showed + ns.lead_no_show + ns.cancelled + ns.team_no_show)} sub="intro + demo" />
          <NoShowCard label="Showed" value={fmtNum(ns.showed)} color="#3ecf8e" />
          <NoShowCard label="Lead no-show" value={fmtNum(ns.lead_no_show)} color="#e84040" />
          <NoShowCard label="Cancelled" value={fmtNum(ns.cancelled)} color="#f0a832" />
          <NoShowCard label="Team no-show" value={fmtNum(ns.team_no_show)} />
          <NoShowCard label="Overall show rate" value={fmtPct(ns.show_rate)} color="#3ecf8e" sub="excl. cancelled" />
          <NoShowCard label="Cost per no-show" value={fmtMoney(m.cost_per_no_show)} color="#e84040" sub="wasted ad spend" />
        </div>
      </div>
    </div>
  );
}

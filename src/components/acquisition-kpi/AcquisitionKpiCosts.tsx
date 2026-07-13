"use client";

import { useEffect, useState } from "react";
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, LineChart,
} from "recharts";
import type { AcquisitionMetricsResult } from "@/lib/acquisition-metrics";
import type { AcquisitionTimeseriesBucket } from "@/lib/acquisition-metrics-timeseries";
import type { KpiFilters } from "./AcquisitionKpiFilterBar";
import { fmtMoney, fmtNum, fmtPct } from "./kpi-fmt";
import {
  CHART,
  KPI,
  KpiChartCard,
  KpiEmpty,
  KpiLoading,
  KpiPage,
  KpiSection,
  KpiStatCard,
} from "./kpi-ui";

function formatDay(d: string) {
  const dt = new Date(`${d}T00:00:00Z`);
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
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

  if (loading) return <KpiLoading />;
  if (!metrics) return <KpiEmpty message="No cost data in this date range." />;

  const m = metrics;
  const ns = m.no_show_breakdown;
  const spendData = series.map(d => ({ label: formatDay(d.date), spend: d.ad_spend }));
  const cplData = series.filter(d => d.cpl != null).map(d => ({ label: formatDay(d.date), cpl: d.cpl }));

  const costCards = [
    { label: "Cost per lead (CPL)", value: fmtMoney(m.cpl), sub: "Meta spend ÷ Meta leads", color: KPI.accent.blue },
    { label: "Cost / intro booked", value: fmtMoney(m.cost_per_intro) },
    { label: "Cost / intro showed", value: fmtMoney(m.cost_per_intro_showed) },
    { label: "Cost / demo booked", value: fmtMoney(m.cost_per_demo_booked) },
    { label: "Cost / demo showed", value: fmtMoney(m.cost_per_demo_showed) },
    { label: "Cost / offer", value: fmtMoney(m.cost_per_offer) },
    { label: "Blended CAC", value: fmtMoney(m.cac), sub: "Meta spend ÷ all closes", color: KPI.accent.blue },
    { label: "Meta CAC", value: fmtMoney(m.meta_cac), sub: `Meta spend ÷ Meta closes (${fmtNum(m.meta_closes)})`, color: KPI.accent.blue },
    { label: "Ad spend total", value: fmtMoney(m.ad_spend), sub: "Meta campaigns", color: KPI.textMuted },
  ];

  return (
    <KpiPage>
      <KpiSection title="Cost per funnel stage" eyebrow="Spend">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {costCards.map(card => (
            <KpiStatCard
              key={card.label}
              label={card.label}
              value={card.value}
              sub={card.sub}
              color={card.color ?? KPI.text}
            />
          ))}
        </div>
      </KpiSection>

      <KpiSection title="Cost trends" eyebrow="Daily">
        <div className="grid gap-4 lg:grid-cols-2">
          <KpiChartCard title="Daily ad spend">
            <ResponsiveContainer width="100%" height={240}>
              <ComposedChart data={spendData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
                <XAxis dataKey="label" tick={CHART.tick} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis tick={CHART.tick} tickLine={false} axisLine={false} tickFormatter={v => `$${Math.round(v)}`} width={52} />
                <Tooltip contentStyle={CHART.tooltip} labelStyle={CHART.tooltipLabel} formatter={(v: unknown) => [`$${Math.round(Number(v))}`, "Spend"]} />
                <Bar dataKey="spend" fill="rgba(96,165,250,0.45)" name="Ad Spend" radius={[4, 4, 0, 0]} />
              </ComposedChart>
            </ResponsiveContainer>
          </KpiChartCard>

          <KpiChartCard title="CPL trend — Meta leads">
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={cplData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
                <XAxis dataKey="label" tick={CHART.tick} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis tick={CHART.tick} tickLine={false} axisLine={false} tickFormatter={v => `$${Math.round(v)}`} width={48} />
                <Tooltip contentStyle={CHART.tooltip} labelStyle={CHART.tooltipLabel} formatter={(v: unknown) => [`$${Number(v).toFixed(2)}`, "CPL"]} />
                <Line type="monotone" dataKey="cpl" stroke={KPI.accent.amber} strokeWidth={2.5} dot={false} name="CPL" />
              </LineChart>
            </ResponsiveContainer>
          </KpiChartCard>
        </div>
      </KpiSection>

      <KpiSection title="Appointment status & wasted spend" eyebrow="Efficiency">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiStatCard label="Total scheduled" value={fmtNum(ns.showed + ns.lead_no_show + ns.cancelled + ns.team_no_show)} sub="Intro + demo" />
          <KpiStatCard label="Showed" value={fmtNum(ns.showed)} color={KPI.accent.green} />
          <KpiStatCard label="Lead no-show" value={fmtNum(ns.lead_no_show)} color={KPI.accent.red} />
          <KpiStatCard label="Cancelled" value={fmtNum(ns.cancelled)} color={KPI.accent.amber} />
          <KpiStatCard label="Team no-show" value={fmtNum(ns.team_no_show)} />
          <KpiStatCard label="Overall show rate" value={fmtPct(ns.show_rate)} sub="Excl. cancelled" color={KPI.accent.green} />
          <KpiStatCard label="Cost per no-show" value={fmtMoney(m.cost_per_no_show)} sub="Wasted ad spend" color={KPI.accent.red} />
        </div>
      </KpiSection>
    </KpiPage>
  );
}

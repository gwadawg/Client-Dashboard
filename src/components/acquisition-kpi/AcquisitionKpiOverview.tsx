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
import {
  CHART,
  KPI,
  KpiChartCard,
  KpiDetailCard,
  KpiEmpty,
  KpiHeroCard,
  KpiLoading,
  KpiPage,
  KpiRateCard,
  KpiSection,
  KpiStatCard,
  KpiBezel,
} from "./kpi-ui";

type FunnelStage = { label: string; count: number; conv?: number | null };

function FunnelViz({ stages }: { stages: FunnelStage[] }) {
  const max = Math.max(...stages.map(s => s.count), 1);
  const colors = [KPI.accent.blue, KPI.accent.teal, KPI.accent.teal, KPI.accent.amber, KPI.accent.amber, KPI.accent.green, KPI.accent.green];

  return (
    <div className="flex flex-col gap-3">
      {stages.map((s, i) => {
        const pct = (s.count / max) * 100;
        return (
          <div key={s.label} className="flex items-center gap-4">
            <div className="w-36 shrink-0 text-right text-sm font-medium" style={{ color: KPI.textMuted }}>
              {s.label}
            </div>
            <div className="h-7 flex-1 overflow-hidden rounded-lg" style={{ background: "rgba(255,255,255,0.05)" }}>
              <div
                className="flex h-full items-center rounded-lg px-3 transition-all duration-700"
                style={{
                  width: `${Math.max(pct, s.count > 0 ? 8 : 0)}%`,
                  background: `linear-gradient(90deg, ${colors[i % colors.length]}cc, ${colors[i % colors.length]}55)`,
                  transitionTimingFunction: KPI.ease,
                }}
              />
            </div>
            <div className="w-12 shrink-0 text-right text-sm font-semibold tabular-nums" style={{ color: KPI.textSecondary }}>
              {fmtNum(s.count)}
            </div>
            <div className="w-14 shrink-0 text-right text-xs font-medium tabular-nums" style={{ color: KPI.textDim }}>
              {s.conv != null ? fmtPct(s.conv) : ""}
            </div>
          </div>
        );
      })}
    </div>
  );
}

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
    <ResponsiveContainer width="100%" height={240}>
      <ComposedChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
        <XAxis dataKey="label" tick={CHART.tick} tickLine={false} axisLine={false} interval="preserveStartEnd" />
        <YAxis tick={CHART.tick} tickLine={false} axisLine={false} width={36} />
        <Tooltip
          contentStyle={CHART.tooltip}
          labelStyle={CHART.tooltipLabel}
        />
        <Bar dataKey="leads" fill="rgba(96,165,250,0.35)" name="Leads" radius={[4, 4, 0, 0]} />
        <Line type="monotone" dataKey="intros" stroke={KPI.accent.teal} strokeWidth={2.5} dot={false} name="Intros showed" />
        <Line type="monotone" dataKey="demos" stroke={KPI.accent.amber} strokeWidth={2.5} dot={false} name="Demos showed" />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

function QualityListCard({
  label,
  items,
  empty = "No data",
}: {
  label: string;
  items: { key: string; text: string; count?: number }[];
  empty?: string;
}) {
  return (
    <KpiBezel>
      <div className="flex flex-col gap-4 p-5 sm:p-6">
        <span className="text-xs font-semibold uppercase tracking-[0.12em]" style={{ color: KPI.textMuted }}>
          {label}
        </span>
        {items.length === 0 ? (
          <p className="text-sm" style={{ color: KPI.textDim }}>{empty}</p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {items.map(item => (
              <li key={item.key} className="flex items-center justify-between gap-3 text-sm">
                <span style={{ color: KPI.textSecondary }}>{item.text}</span>
                {item.count != null && (
                  <span className="shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums" style={{ background: "rgba(255,255,255,0.06)", color: KPI.textMuted }}>
                    {item.count}×
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </KpiBezel>
  );
}

function QualitySnapshot({ quality }: { quality: CallQualityResult }) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <KpiStatCard
        label="Avg call rating"
        value={quality.avg_call_rating != null ? `${quality.avg_call_rating.toFixed(1)}/10` : "—"}
        sub={`${quality.total_documented} documented calls`}
        color={KPI.accent.green}
      />
      <QualityListCard
        label="Top surface objections"
        items={quality.top_surface_objections.slice(0, 4).map(o => ({
          key: o.objection,
          text: o.objection,
          count: o.count,
        }))}
      />
      <QualityListCard
        label="Lead quality mix"
        items={Object.entries(quality.lead_quality_distribution)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 4)
          .map(([k, v]) => ({ key: k, text: k, count: v }))}
      />
    </div>
  );
}

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

  if (loading) return <KpiLoading />;
  if (!metrics) return <KpiEmpty message="No acquisition data in this date range." />;

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

  const rateCards = [
    { label: "Intro booking rate", value: m.intro_booking_rate, key: "intro_booking_rate", sub: "Unique leads → intro booked" },
    { label: "Intro show rate", value: m.intro_show_rate, key: "intro_show_rate", sub: "Of intros that took place" },
    { label: "Demo booking rate", value: m.demo_booking_rate, key: "demo_booking_rate", sub: "Intros showed → demo booked" },
    { label: "Demo show rate", value: m.demo_show_rate, key: "demo_show_rate", sub: "Of demos that took place" },
    { label: "Offer → close", value: m.close_rate, key: "close_rate", sub: "Offers to paid clients" },
    { label: "Demo → close", value: m.demo_to_close_rate, key: "demo_to_close_rate", sub: "Demos showed to close" },
  ] as const;

  return (
    <KpiPage>
      <KpiSection title="Performance snapshot" eyebrow="Volume">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiHeroCard label="Total leads" value={fmtNum(m.leads)} sub={`${fmtNum(m.meta_leads)} from Meta`} accent={KPI.accent.blue} />
          <KpiHeroCard label="Intros booked" value={fmtNum(m.intros_booked)} sub={`${fmtNum(m.intros_showed)} showed`} accent={KPI.accent.teal} />
          <KpiHeroCard label="Demos booked" value={fmtNum(m.demos_booked)} sub={`${fmtNum(m.demos_showed)} showed`} accent={KPI.accent.amber} />
          <KpiHeroCard label="Closes" value={fmtNum(m.closes)} sub={`${fmtNum(m.offers_made)} offers made`} color={KPI.accent.green} accent={KPI.accent.green} />
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <KpiDetailCard
            label="Intros booked"
            value={fmtNum(m.intros_booked)}
            metrics={[
              { label: "Took place", value: fmtNum(m.intros_taken_place) },
              { label: "Show %", value: fmtPct(m.intro_show_rate), color: KPI.accent.teal },
            ]}
          />
          <KpiDetailCard
            label="Demos booked"
            value={fmtNum(m.demos_booked)}
            metrics={[
              { label: "Took place", value: fmtNum(m.demos_taken_place) },
              { label: "Show %", value: fmtPct(m.demo_show_rate), color: KPI.accent.amber },
            ]}
          />
          <KpiDetailCard
            label="Closes & offers"
            value={fmtNum(m.closes)}
            valueColor={KPI.accent.green}
            metrics={[
              { label: "Offers made", value: fmtNum(m.offers_made) },
              { label: "Close %", value: fmtPct(m.close_rate), color: KPI.accent.green },
            ]}
          />
        </div>
      </KpiSection>

      <KpiSection title="Conversion rates" eyebrow="Efficiency">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rateCards.map(card => {
            const color = rateColor(card.key, card.value ?? null);
            return (
              <KpiRateCard
                key={card.key}
                label={card.label}
                value={fmtPct(card.value)}
                metricKey={card.key}
                sub={card.sub}
                valueStyle={thresholdStyle(color)}
              />
            );
          })}
        </div>
      </KpiSection>

      <KpiSection title="Funnel flow" eyebrow="Journey">
        <KpiChartCard title="Stage volume & step conversion">
          <FunnelViz stages={funnelStages} />
        </KpiChartCard>
      </KpiSection>

      <KpiSection title="Activity trends" eyebrow="Daily">
        <KpiChartCard title="Leads · intros showed · demos showed">
          <AppointmentActivityChart data={series} />
        </KpiChartCard>
      </KpiSection>

      <KpiSection title="Appointment status" eyebrow="Show / no-show">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <KpiStatCard label="Showed" value={fmtNum(ns.showed)} color={KPI.accent.green} />
          <KpiStatCard label="Lead no-show" value={fmtNum(ns.lead_no_show)} color={KPI.accent.red} />
          <KpiStatCard label="Cancelled" value={fmtNum(ns.cancelled)} color={KPI.accent.amber} />
          <KpiStatCard label="Team no-show" value={fmtNum(ns.team_no_show)} />
          <KpiStatCard label="Overall show rate" value={fmtPct(ns.show_rate)} sub="Excl. cancelled" color={KPI.accent.green} />
        </div>
      </KpiSection>

      {quality && quality.total_documented > 0 && (
        <KpiSection title="Call quality" eyebrow="Documented calls">
          <QualitySnapshot quality={quality} />
        </KpiSection>
      )}
    </KpiPage>
  );
}

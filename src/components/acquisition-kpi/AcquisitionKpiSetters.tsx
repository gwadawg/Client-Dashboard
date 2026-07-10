"use client";

import { useEffect, useState } from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";
import type { SetterRow } from "@/lib/acquisition-team-metrics";
import { rateColor, thresholdStyle } from "@/lib/acquisition-kpi-thresholds";
import type { KpiFilters } from "./AcquisitionKpiFilterBar";
import { fmtPct } from "./kpi-fmt";
import {
  CHART,
  KPI,
  KPI_TD,
  KPI_TH,
  KpiChartCard,
  KpiEmpty,
  KpiLoading,
  KpiPage,
  KpiRateCard,
  KpiRatePill,
  KpiSection,
  KpiTableShell,
} from "./kpi-ui";

type SummaryRates = {
  intro_show_rate: number | null;
  demo_booking_rate: number | null;
  demo_show_rate: number | null;
};

type Props = {
  startDate: string;
  endDate: string;
  filters: KpiFilters;
  onSetterNamesLoaded?: (names: string[]) => void;
};

export default function AcquisitionKpiSetters({ startDate, endDate, filters, onSetterNamesLoaded }: Props) {
  const [rows, setRows] = useState<SetterRow[]>([]);
  const [summary, setSummary] = useState<SummaryRates | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const q = new URLSearchParams({
      from: startDate, to: endDate,
      offer_scope: filters.offerScope,
      ...(filters.repFilter ? { setter: filters.repFilter } : {}),
    });
    fetch(`/api/acquisition/team-stats?${q}`)
      .then(r => r.json())
      .then(d => {
        const data: SetterRow[] = d.setters ?? [];
        setRows(data);
        onSetterNamesLoaded?.(d.setter_names ?? []);

        const totIS = data.reduce((s, r) => s + r.intros_showed, 0);
        const totITP = data.reduce((s, r) => s + r.intros_taken_place, 0);
        const totDB = data.reduce((s, r) => s + r.demos_booked, 0);
        const totDS = data.reduce((s, r) => s + r.demos_showed, 0);
        const totDTP = data.reduce((s, r) => s + r.demos_taken_place, 0);

        setSummary({
          intro_show_rate: totITP > 0 ? (totIS / totITP) * 100 : null,
          demo_booking_rate: totIS > 0 ? (totDB / totIS) * 100 : null,
          demo_show_rate: totDTP > 0 ? (totDS / totDTP) * 100 : null,
        });
      })
      .finally(() => setLoading(false));
  }, [startDate, endDate, filters.offerScope, filters.repFilter, onSetterNamesLoaded]);

  if (loading) return <KpiLoading />;
  if (!rows.length && !summary) return <KpiEmpty message="No setter-attributed appointments in this range." />;

  const chartData = rows
    .filter(r => r.intros_taken_place > 0 || r.intros_booked > 0)
    .map(r => ({ name: r.setter.split(" ")[0], intro_show_rate: r.intro_show_rate ?? 0, demo_show_rate: r.demo_show_rate ?? 0 }));

  const summaryCards = summary
    ? [
        { label: "Intro show rate", value: summary.intro_show_rate, key: "intro_show_rate" },
        { label: "Demo booking rate", value: summary.demo_booking_rate, key: "demo_booking_rate" },
        { label: "Demo show rate", value: summary.demo_show_rate, key: "demo_show_rate" },
      ]
    : [];

  return (
    <KpiPage>
      {summary && (
        <KpiSection title="Team conversion rates" eyebrow="Setters">
          <div className="grid gap-4 md:grid-cols-3">
            {summaryCards.map(card => (
              <KpiRateCard
                key={card.key}
                label={card.label}
                value={fmtPct(card.value)}
                metricKey={card.key}
                valueStyle={thresholdStyle(rateColor(card.key, card.value ?? null))}
              />
            ))}
          </div>
        </KpiSection>
      )}

      <KpiSection title="Setter performance" eyebrow="Table">
        <KpiTableShell>
          {rows.length === 0 ? (
            <KpiEmpty message="No setter-attributed appointments in range." />
          ) : (
            <table className="w-full" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                  {["Setter", "Intros Booked", "Intros Showed", "Intro Show %", "Demos Booked", "Demos Showed", "Demo Show %", "IS→DB %", "Offers", "Closes"].map(h => (
                    <th key={h} className={KPI_TH} style={{ color: KPI.textDim }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.setter} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                    <td className={KPI_TD} style={{ color: KPI.text, fontWeight: 600 }}>{r.setter}</td>
                    <td className={KPI_TD} style={{ color: KPI.textSecondary, fontVariantNumeric: "tabular-nums" }}>{r.intros_booked}</td>
                    <td className={KPI_TD} style={{ color: KPI.textSecondary, fontVariantNumeric: "tabular-nums" }}>{r.intros_showed}</td>
                    <td className={KPI_TD}><KpiRatePill value={r.intro_show_rate} metricKey="intro_show_rate" formatted={fmtPct(r.intro_show_rate)} /></td>
                    <td className={KPI_TD} style={{ color: KPI.textSecondary, fontVariantNumeric: "tabular-nums" }}>{r.demos_booked}</td>
                    <td className={KPI_TD} style={{ color: KPI.textSecondary, fontVariantNumeric: "tabular-nums" }}>{r.demos_showed}</td>
                    <td className={KPI_TD}><KpiRatePill value={r.demo_show_rate} metricKey="demo_show_rate" formatted={fmtPct(r.demo_show_rate)} /></td>
                    <td className={KPI_TD}><KpiRatePill value={r.is_to_db_rate} metricKey="demo_booking_rate" formatted={fmtPct(r.is_to_db_rate)} /></td>
                    <td className={KPI_TD} style={{ color: KPI.textSecondary, fontVariantNumeric: "tabular-nums" }}>{r.offers}</td>
                    <td className={KPI_TD} style={{ color: KPI.textSecondary, fontVariantNumeric: "tabular-nums" }}>{r.closes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </KpiTableShell>
      </KpiSection>

      {chartData.length > 0 && (
        <KpiSection title="Show rates by setter" eyebrow="Chart">
          <KpiChartCard title="Intro vs demo show rate">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
                <XAxis dataKey="name" tick={CHART.tick} tickLine={false} axisLine={false} />
                <YAxis tickFormatter={v => `${v}%`} tick={CHART.tick} tickLine={false} axisLine={false} domain={[0, 100]} width={40} />
                <Tooltip contentStyle={CHART.tooltip} labelStyle={CHART.tooltipLabel} formatter={(v: unknown, name: unknown) => [`${Math.round(Number(v))}%`, name === "intro_show_rate" ? "Intro show" : "Demo show"]} />
                <Bar dataKey="intro_show_rate" name="Intro show rate" fill={KPI.accent.teal} radius={[4, 4, 0, 0]} />
                <Bar dataKey="demo_show_rate" name="Demo show rate" fill={KPI.accent.amber} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </KpiChartCard>
        </KpiSection>
      )}
    </KpiPage>
  );
}

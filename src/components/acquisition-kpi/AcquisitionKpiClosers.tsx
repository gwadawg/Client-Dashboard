"use client";

import { useEffect, useState } from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";
import type { CloserRow } from "@/lib/acquisition-closer-metrics";
import type { CallQualityResult } from "@/lib/acquisition-call-quality";
import { rateColor, thresholdStyle } from "@/lib/acquisition-kpi-thresholds";
import type { KpiFilters } from "./AcquisitionKpiFilterBar";
import { fmtPct, fmtMoney, fmtDecimal } from "./kpi-fmt";
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
  KpiStatCard,
  KpiTableShell,
} from "./kpi-ui";

type Props = {
  startDate: string;
  endDate: string;
  filters: KpiFilters;
  onCloserNamesLoaded?: (names: string[]) => void;
};

export default function AcquisitionKpiClosers({ startDate, endDate, filters, onCloserNamesLoaded }: Props) {
  const [rows, setRows] = useState<CloserRow[]>([]);
  const [quality, setQuality] = useState<CallQualityResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const q = new URLSearchParams({
      from: startDate, to: endDate,
      offer_scope: filters.offerScope,
      ...(filters.repFilter ? { closer: filters.repFilter } : {}),
    });
    const qCq = new URLSearchParams({
      from: startDate, to: endDate,
      ...(filters.repFilter ? { closer: filters.repFilter } : {}),
    });
    Promise.all([
      fetch(`/api/acquisition/closer-stats?${q}`).then(r => r.json()),
      fetch(`/api/acquisition/call-quality?${qCq}`).then(r => r.json()),
    ]).then(([cs, cq]) => {
      const data: CloserRow[] = cs.closers ?? [];
      setRows(data);
      onCloserNamesLoaded?.(cs.closer_names ?? []);
      setQuality(cq.quality ?? null);
    }).finally(() => setLoading(false));
  }, [startDate, endDate, filters.offerScope, filters.repFilter, onCloserNamesLoaded]);

  if (loading) return <KpiLoading />;

  const totDR = rows.reduce((s, r) => s + r.demos_ran, 0);
  const totDS = rows.reduce((s, r) => s + r.demos_showed, 0);
  const totOf = rows.reduce((s, r) => s + r.offers, 0);
  const totCl = rows.reduce((s, r) => s + r.closes, 0);
  const teamDemoShow = totDR > 0 ? (totDS / totDR) * 100 : null;
  const teamOfferRate = totDS > 0 ? (totOf / totDS) * 100 : null;
  const teamCloseRate = totOf > 0 ? (totCl / totOf) * 100 : null;

  const chartData = rows.map(r => ({
    name: r.closer.split(" ")[0],
    offer_rate: r.offer_rate ?? 0,
    close_rate: r.close_rate ?? 0,
  }));

  const summaryCards = [
    { label: "Demo show rate", value: teamDemoShow, key: "demo_show_rate" },
    { label: "Offer rate", value: teamOfferRate, key: "offer_rate" },
    { label: "Close rate", value: teamCloseRate, key: "close_rate" },
  ];

  return (
    <KpiPage>
      <KpiSection title="Team conversion rates" eyebrow="Closers">
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

      <KpiSection title="Closer performance" eyebrow="Table">
        <KpiTableShell>
          {rows.length === 0 ? (
            <KpiEmpty message="No closer-documented calls in this range." />
          ) : (
            <table className="w-full" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                  {["Closer", "Demos Ran", "Demos Showed", "Show %", "Offers", "Offer %", "Closes", "Close %", "Cash", "Avg Rating"].map(h => (
                    <th key={h} className={KPI_TH} style={{ color: KPI.textDim }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.closer} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                    <td className={KPI_TD} style={{ color: KPI.text, fontWeight: 600 }}>{r.closer}</td>
                    <td className={KPI_TD} style={{ color: KPI.textSecondary, fontVariantNumeric: "tabular-nums" }}>{r.demos_ran}</td>
                    <td className={KPI_TD} style={{ color: KPI.textSecondary, fontVariantNumeric: "tabular-nums" }}>{r.demos_showed}</td>
                    <td className={KPI_TD}><KpiRatePill value={r.demo_show_rate} metricKey="demo_show_rate" formatted={fmtPct(r.demo_show_rate)} /></td>
                    <td className={KPI_TD} style={{ color: KPI.textSecondary, fontVariantNumeric: "tabular-nums" }}>{r.offers}</td>
                    <td className={KPI_TD}><KpiRatePill value={r.offer_rate} metricKey="offer_rate" formatted={fmtPct(r.offer_rate)} /></td>
                    <td className={KPI_TD} style={{ color: KPI.textSecondary, fontVariantNumeric: "tabular-nums" }}>{r.closes}</td>
                    <td className={KPI_TD}><KpiRatePill value={r.close_rate} metricKey="close_rate" formatted={fmtPct(r.close_rate)} /></td>
                    <td className={KPI_TD} style={{ color: KPI.accent.green, fontVariantNumeric: "tabular-nums" }}>{fmtMoney(r.cash_collected)}</td>
                    <td className={KPI_TD} style={{ color: KPI.accent.amber, fontVariantNumeric: "tabular-nums" }}>
                      {r.avg_call_rating != null ? `${fmtDecimal(r.avg_call_rating)}/10` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </KpiTableShell>
      </KpiSection>

      {chartData.length > 0 && (
        <KpiSection title="Offer vs close rate" eyebrow="Chart">
          <KpiChartCard title="By closer">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
                <XAxis dataKey="name" tick={CHART.tick} tickLine={false} axisLine={false} />
                <YAxis tickFormatter={v => `${v}%`} tick={CHART.tick} tickLine={false} axisLine={false} domain={[0, 100]} width={40} />
                <Tooltip contentStyle={CHART.tooltip} labelStyle={CHART.tooltipLabel} formatter={(v: unknown, name: unknown) => [`${Math.round(Number(v))}%`, name === "offer_rate" ? "Offer rate" : "Close rate"]} />
                <Bar dataKey="offer_rate" name="Offer rate" fill="rgba(96,165,250,0.75)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="close_rate" name="Close rate" fill={KPI.accent.green} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </KpiChartCard>
        </KpiSection>
      )}

      {quality && quality.total_documented > 0 && (
        <KpiSection title="Call quality" eyebrow="Insights">
          <div className="grid gap-4 md:grid-cols-3">
            <KpiStatCard
              label="Avg call rating"
              value={quality.avg_call_rating != null ? `${quality.avg_call_rating.toFixed(1)}/10` : "—"}
              sub={`${quality.total_documented} documented calls`}
              color={KPI.accent.green}
            />
            <KpiStatCard
              label="Top surface objections"
              value={quality.top_surface_objections.slice(0, 3).map(o => `${o.objection} (${o.count})`).join(" · ") || "—"}
            />
            <KpiStatCard
              label="Root cause objections"
              value={quality.top_root_objections.slice(0, 3).map(o => `${o.objection} (${o.count})`).join(" · ") || "—"}
            />
          </div>
        </KpiSection>
      )}
    </KpiPage>
  );
}

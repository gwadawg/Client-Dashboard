"use client";

import { useEffect, useState } from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";
import type { CloserRow } from "@/lib/acquisition-closer-metrics";
import type { CallQualityResult } from "@/lib/acquisition-call-quality";
import { rateColor, thresholdStyle } from "@/lib/acquisition-kpi-thresholds";
import type { KpiFilters } from "./AcquisitionKpiFilterBar";
import { fmtPct, fmtNum, fmtMoney, fmtDecimal } from "./kpi-fmt";

function SectionHead({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <span style={{ fontFamily: "monospace", fontSize: 9, color: "#334155", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 600 }}>{title}</span>
      <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.04)" }} />
    </div>
  );
}

function SummaryCard({ label, value, metricKey }: { label: string; value: number | null | undefined; metricKey: string }) {
  const color = rateColor(metricKey, value ?? null);
  return (
    <div style={{ background: "#0f1115", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, padding: "20px 22px" }}>
      <div style={{ fontFamily: "monospace", fontSize: 9, color: "#475569", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-1px", ...thresholdStyle(color) }}>{fmtPct(value)}</div>
    </div>
  );
}

function RatePill({ value, metricKey }: { value: number | null | undefined; metricKey: string }) {
  const color = rateColor(metricKey, value ?? null);
  return <span style={{ fontFamily: "monospace", fontSize: 11, fontWeight: 600, ...thresholdStyle(color) }}>{fmtPct(value)}</span>;
}

const TH = "text-left px-3 py-3";
const TD = "px-3 py-3 text-sm";

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

  if (loading) return <div className="py-16 text-center" style={{ color: "#334155", fontFamily: "monospace", fontSize: 12 }}>Loading…</div>;

  // Aggregate summary rates
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

  return (
    <div className="flex flex-col gap-8 pb-12">

      {/* Summary cards */}
      <div>
        <SectionHead title="Team conversion rates" />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
          <SummaryCard label="Demo show rate" value={teamDemoShow} metricKey="demo_show_rate" />
          <SummaryCard label="Offer rate" value={teamOfferRate} metricKey="offer_rate" />
          <SummaryCard label="Close rate" value={teamCloseRate} metricKey="close_rate" />
        </div>
      </div>

      {/* Closer table */}
      <div>
        <SectionHead title="Closer performance" />
        <div style={{ background: "#0f1115", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, overflowX: "auto" }}>
          {rows.length === 0 ? (
            <div className="py-12 text-center" style={{ color: "#334155", fontFamily: "monospace", fontSize: 11 }}>No closer-documented calls in range.</div>
          ) : (
            <table className="w-full" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  {["Closer", "Demos Ran", "Demos Showed", "Show %", "Offers", "Offer %", "Closes", "Close %", "Cash", "Avg Rating"].map(h => (
                    <th key={h} className={TH} style={{ color: "#475569", fontFamily: "monospace", fontWeight: 400, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.06em" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.closer} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                    <td className={TD} style={{ color: "#e2e8f0", fontWeight: 600 }}>{r.closer}</td>
                    <td className={TD} style={{ color: "#94a3b8", fontFamily: "monospace" }}>{r.demos_ran}</td>
                    <td className={TD} style={{ color: "#94a3b8", fontFamily: "monospace" }}>{r.demos_showed}</td>
                    <td className={TD}><RatePill value={r.demo_show_rate} metricKey="demo_show_rate" /></td>
                    <td className={TD} style={{ color: "#94a3b8", fontFamily: "monospace" }}>{r.offers}</td>
                    <td className={TD}><RatePill value={r.offer_rate} metricKey="offer_rate" /></td>
                    <td className={TD} style={{ color: "#94a3b8", fontFamily: "monospace" }}>{r.closes}</td>
                    <td className={TD}><RatePill value={r.close_rate} metricKey="close_rate" /></td>
                    <td className={TD} style={{ color: "#3ecf8e", fontFamily: "monospace" }}>{fmtMoney(r.cash_collected)}</td>
                    <td className={TD} style={{ color: "#f0a832", fontFamily: "monospace" }}>
                      {r.avg_call_rating != null ? fmtDecimal(r.avg_call_rating) + "/10" : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Offer vs close bar chart */}
      {chartData.length > 0 && (
        <div>
          <SectionHead title="Offer rate vs close rate by closer" />
          <div style={{ background: "#0f1115", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, padding: "20px 22px" }}>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#64748b" }} tickLine={false} axisLine={false} />
                <YAxis tickFormatter={v => `${v}%`} tick={{ fontSize: 9, fill: "#334155" }} tickLine={false} axisLine={false} domain={[0, 100]} width={36} />
                <Tooltip
                  contentStyle={{ background: "#0f1115", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, fontSize: 11 }}
                  formatter={(v: unknown, name: unknown) => [`${Math.round(Number(v))}%`, name === "offer_rate" ? "Offer rate" : "Close rate"]}
                  labelStyle={{ color: "#94a3b8" }}
                />
                <Bar dataKey="offer_rate" name="Offer rate" fill="rgba(79,142,245,0.7)" radius={[3, 3, 0, 0]} />
                <Bar dataKey="close_rate" name="Close rate" fill="#3ecf8e" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Call quality section */}
      {quality && quality.total_documented > 0 && (
        <div>
          <SectionHead title="Call quality" />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
            <div style={{ background: "#0f1115", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, padding: "18px 20px" }}>
              <div style={{ fontFamily: "monospace", fontSize: 9, color: "#475569", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Avg call rating</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: "#3ecf8e", letterSpacing: "-1px" }}>
                {quality.avg_call_rating != null ? quality.avg_call_rating.toFixed(1) + "/10" : "—"}
              </div>
              <div style={{ fontFamily: "monospace", fontSize: 9, color: "#334155", marginTop: 4 }}>{quality.total_documented} documented calls</div>
            </div>
            <div style={{ background: "#0f1115", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, padding: "18px 20px" }}>
              <div style={{ fontFamily: "monospace", fontSize: 9, color: "#475569", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>Top surface objections</div>
              <div className="flex flex-col gap-2">
                {quality.top_surface_objections.slice(0, 4).map(o => (
                  <div key={o.objection} className="flex items-center justify-between gap-2">
                    <span style={{ fontSize: 11, color: "#94a3b8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.objection}</span>
                    <span style={{ fontFamily: "monospace", fontSize: 10, color: "#64748b", flexShrink: 0 }}>{o.count}×</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ background: "#0f1115", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, padding: "18px 20px" }}>
              <div style={{ fontFamily: "monospace", fontSize: 9, color: "#475569", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>Root cause objections</div>
              <div className="flex flex-col gap-2">
                {quality.top_root_objections.slice(0, 4).map(o => (
                  <div key={o.objection} className="flex items-center justify-between gap-2">
                    <span style={{ fontSize: 11, color: "#94a3b8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.objection}</span>
                    <span style={{ fontFamily: "monospace", fontSize: 10, color: "#64748b", flexShrink: 0 }}>{o.count}×</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

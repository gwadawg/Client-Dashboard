"use client";

import { useEffect, useState } from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
} from "recharts";
import type { SetterRow } from "@/lib/acquisition-team-metrics";
import { rateColor, thresholdStyle } from "@/lib/acquisition-kpi-thresholds";
import type { KpiFilters } from "./AcquisitionKpiFilterBar";
import { fmtPct, fmtNum, fmtMoney } from "./kpi-fmt";

type SummaryRates = {
  intro_booking_rate: number | null;
  intro_show_rate: number | null;
  demo_booking_rate: number | null;
  demo_show_rate: number | null;
};

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

function SummaryCard({ label, value, metricKey }: { label: string; value: number | null | undefined; metricKey: string }) {
  const color = rateColor(metricKey, value ?? null);
  const style = thresholdStyle(color);
  return (
    <div style={{ background: "#0f1115", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, padding: "20px 22px" }}>
      <div style={{ fontFamily: "monospace", fontSize: 9, color: "#475569", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-1px", ...style }}>{fmtPct(value)}</div>
    </div>
  );
}

function RatePill({ value, metricKey }: { value: number | null | undefined; metricKey: string }) {
  const color = rateColor(metricKey, value ?? null);
  const style = thresholdStyle(color);
  return <span style={{ fontFamily: "monospace", fontSize: 11, fontWeight: 600, ...style }}>{fmtPct(value)}</span>;
}

const TH = "text-left px-3 py-3 text-xs font-medium";
const TD = "px-3 py-3 text-sm";

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

        // Compute summary rates across all returned rows
        const totIB = data.reduce((s, r) => s + r.intros_booked, 0);
        const totIS = data.reduce((s, r) => s + r.intros_showed, 0);
        const totITP = data.reduce((s, r) => s + r.intros_taken_place, 0);
        const totDB = data.reduce((s, r) => s + r.demos_booked, 0);
        const totDS = data.reduce((s, r) => s + r.demos_showed, 0);
        const totDTP = data.reduce((s, r) => s + r.demos_taken_place, 0);

        setSummary({
          intro_booking_rate: null, // needs total leads — omit here
          intro_show_rate: totITP > 0 ? (totIS / totITP) * 100 : null,
          demo_booking_rate: totIS > 0 ? (totDB / totIS) * 100 : null,
          demo_show_rate: totDTP > 0 ? (totDS / totDTP) * 100 : null,
        });
      })
      .finally(() => setLoading(false));
  }, [startDate, endDate, filters.offerScope, filters.repFilter, onSetterNamesLoaded]);

  if (loading) return <div className="py-16 text-center" style={{ color: "#334155", fontFamily: "monospace", fontSize: 12 }}>Loading…</div>;

  const chartData = rows
    .filter(r => r.intros_taken_place > 0 || r.intros_booked > 0)
    .map(r => ({ name: r.setter.split(" ")[0], intro_show_rate: r.intro_show_rate ?? 0, demo_show_rate: r.demo_show_rate ?? 0 }));

  return (
    <div className="flex flex-col gap-8 pb-12">

      {/* Summary rate cards */}
      {summary && (
        <div>
          <SectionHead title="Team conversion rates" />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
            <SummaryCard label="Intro show rate" value={summary.intro_show_rate} metricKey="intro_show_rate" />
            <SummaryCard label="Demo booking rate" value={summary.demo_booking_rate} metricKey="demo_booking_rate" />
            <SummaryCard label="Demo show rate" value={summary.demo_show_rate} metricKey="demo_show_rate" />
          </div>
        </div>
      )}

      {/* Setter table */}
      <div>
        <SectionHead title="Setter performance" />
        <div style={{ background: "#0f1115", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, overflowX: "auto" }}>
          {rows.length === 0 ? (
            <div className="py-12 text-center" style={{ color: "#334155", fontFamily: "monospace", fontSize: 11 }}>No setter-attributed appointments in range.</div>
          ) : (
            <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  {["Setter", "Intros Booked", "Intros Showed", "Intro Show %", "Demos Booked", "Demos Showed", "Demo Show %", "IS→DB %", "Offers", "Closes"].map(h => (
                    <th key={h} className={TH} style={{ color: "#475569", fontFamily: "monospace", fontWeight: 400, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.06em" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.setter} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                    <td className={TD} style={{ color: "#e2e8f0", fontWeight: 600 }}>{r.setter}</td>
                    <td className={TD} style={{ color: "#94a3b8", fontFamily: "monospace" }}>{r.intros_booked}</td>
                    <td className={TD} style={{ color: "#94a3b8", fontFamily: "monospace" }}>{r.intros_showed}</td>
                    <td className={TD}><RatePill value={r.intro_show_rate} metricKey="intro_show_rate" /></td>
                    <td className={TD} style={{ color: "#94a3b8", fontFamily: "monospace" }}>{r.demos_booked}</td>
                    <td className={TD} style={{ color: "#94a3b8", fontFamily: "monospace" }}>{r.demos_showed}</td>
                    <td className={TD}><RatePill value={r.demo_show_rate} metricKey="demo_show_rate" /></td>
                    <td className={TD}><RatePill value={r.is_to_db_rate} metricKey="demo_booking_rate" /></td>
                    <td className={TD} style={{ color: "#94a3b8", fontFamily: "monospace" }}>{r.offers}</td>
                    <td className={TD} style={{ color: "#94a3b8", fontFamily: "monospace" }}>{r.closes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Bar chart: show rates by setter */}
      {chartData.length > 0 && (
        <div>
          <SectionHead title="Show rates by setter" />
          <div style={{ background: "#0f1115", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, padding: "20px 22px" }}>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#64748b" }} tickLine={false} axisLine={false} />
                <YAxis tickFormatter={v => `${v}%`} tick={{ fontSize: 9, fill: "#334155" }} tickLine={false} axisLine={false} domain={[0, 100]} width={36} />
                <Tooltip
                  contentStyle={{ background: "#0f1115", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, fontSize: 11 }}
                  formatter={(v: unknown, name: unknown) => [`${Math.round(Number(v))}%`, name === "intro_show_rate" ? "Intro show" : "Demo show"]}
                  labelStyle={{ color: "#94a3b8" }}
                />
                <Bar dataKey="intro_show_rate" name="Intro show rate" fill="#2dd4bf" radius={[3, 3, 0, 0]}>
                  {chartData.map((_, i) => <Cell key={i} fill="#2dd4bf" />)}
                </Bar>
                <Bar dataKey="demo_show_rate" name="Demo show rate" fill="#f0a832" radius={[3, 3, 0, 0]}>
                  {chartData.map((_, i) => <Cell key={i} fill="#f0a832" />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import KpiSections from "@/components/kpi/KpiSections";
import type { MetricsResult } from "@/lib/metrics";
import { normalizeReportingType, type ReportingType } from "@/lib/kpi-layouts";

type ReportMetrics = MetricsResult & { client_name: string; reporting_type?: ReportingType };

type Preset = "this_month" | "last_month" | "last_30" | "all_time";
const PRESETS: { value: Preset; label: string }[] = [
  { value: "this_month", label: "This Month" },
  { value: "last_month", label: "Last Month" },
  { value: "last_30", label: "Last 30 Days" },
  { value: "all_time", label: "All Time" },
];

function getRange(p: Preset) {
  const now = new Date();
  const today = now.toISOString().split("T")[0];
  if (p === "this_month") return { start: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0], end: today };
  if (p === "last_month") return { start: new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split("T")[0], end: new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split("T")[0] };
  if (p === "last_30") return { start: new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0], end: today };
  return { start: "", end: "" };
}

export default function PublicReportPage() {
  const { token } = useParams<{ token: string }>();
  const [metrics, setMetrics] = useState<ReportMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [preset, setPreset] = useState<Preset>("this_month");

  useEffect(() => {
    const { start, end } = getRange(preset);
    queueMicrotask(() => setLoading(true));
    const params = new URLSearchParams({ token });
    if (start) params.set("start_date", start);
    if (end) params.set("end_date", end);
    fetch(`/api/report?${params}`)
      .then(r => { if (r.status === 404) { setNotFound(true); return null; } return r.json(); })
      .then(d => { if (d) setMetrics(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [token, preset]);

  if (notFound) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "#080f1e" }}>
      <p className="text-sm" style={{ color: "#334155" }}>Report not found or link has expired.</p>
    </div>
  );

  return (
    <div className="min-h-screen" style={{ background: "#080f1e" }}>
      <header className="px-6 py-5 flex items-center justify-between flex-wrap gap-3"
        style={{ background: "#050c18", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, #f59e0b, #d97706)" }}>
            <svg viewBox="0 0 24 24" className="w-4 h-4 fill-white">
              <path d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-bold" style={{ color: "#f1f5f9" }}>{metrics?.client_name ?? "Performance Report"}</p>
            <p className="text-xs" style={{ color: "#475569" }}>Call Center Analytics</p>
          </div>
        </div>
        <div className="flex gap-1 rounded-lg p-1" style={{ background: "#0f2040" }}>
          {PRESETS.map(p => (
            <button key={p.value} onClick={() => setPreset(p.value)}
              className="px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
              style={preset === p.value
                ? { background: "#f59e0b", color: "#fff" }
                : { color: "#475569" }}>
              {p.label}
            </button>
          ))}
        </div>
      </header>

      <main className="p-6 md:p-10 max-w-6xl mx-auto">
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="flex items-center gap-3" style={{ color: "#334155" }}>
              <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span className="text-sm">Loading…</span>
            </div>
          </div>
        ) : metrics ? (
          <KpiSections
            metrics={metrics}
            reportingType={normalizeReportingType(metrics.reporting_type)}
          />
        ) : null}
      </main>

      <footer className="text-center py-6 text-xs" style={{ color: "#1e3a5f" }}>
        Powered by Call Center Analytics
      </footer>
    </div>
  );
}

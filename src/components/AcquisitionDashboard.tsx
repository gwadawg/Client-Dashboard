"use client";

import { useEffect, useState } from "react";
import KpiCard from "./kpi/KpiCard";
import KpiSection from "./kpi/KpiSection";
import { formatKpiValue } from "@/lib/kpi-layouts";
import type { AcquisitionMetricsResult } from "@/lib/acquisition-metrics";

type Props = {
  startDate: string;
  endDate: string;
};

function fmt(value: number | null | undefined, format: "money" | "pct" | "int"): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return formatKpiValue(value, format);
}

export default function AcquisitionDashboard({ startDate, endDate }: Props) {
  const [metrics, setMetrics] = useState<AcquisitionMetricsResult | null>(null);
  const [includeDownsells, setIncludeDownsells] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const q = new URLSearchParams({
      from: startDate,
      to: endDate,
      meta_only: "1",
      include_downsells: includeDownsells ? "1" : "0",
    });
    fetch(`/api/acquisition/metrics?${q}`)
      .then((r) => r.json())
      .then((d) => setMetrics(d.metrics ?? null))
      .finally(() => setLoading(false));
  }, [startDate, endDate, includeDownsells]);

  if (loading) {
    return <p className="text-sm py-12 text-center" style={{ color: "#64748b" }}>Loading acquisition metrics…</p>;
  }

  if (!metrics) {
    return (
      <p className="text-sm py-12 text-center" style={{ color: "#64748b" }}>
        No acquisition data yet. Run the backfill script or connect live webhooks.
      </p>
    );
  }

  const m = metrics;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: "#94a3b8" }}>
          <input
            type="checkbox"
            checked={includeDownsells}
            onChange={(e) => setIncludeDownsells(e.target.checked)}
            className="rounded"
          />
          Include Skool / Mid Offer / Bootcamp in offer &amp; close KPIs
        </label>
      </div>

      <KpiSection title="Acquisition Overview" showDivider>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <KpiCard label="Ad Spend" value={fmt(m.ad_spend, "money")} />
          <KpiCard label="Meta Leads" value={fmt(m.meta_leads, "int")} />
          <KpiCard label="CPL" value={fmt(m.cpl, "money")} hint="Meta spend ÷ Meta leads" />
          <KpiCard label="Blended All-in CAC" value={fmt(m.cac, "money")} accent hint="Meta + creative/labor ÷ all closes" />
          <KpiCard label="Meta Media CAC" value={fmt(m.meta_cac, "money")} accent hint="Meta spend ÷ Meta closes" />
          <KpiCard label="Meta All-in CAC" value={fmt(m.meta_all_in_cac, "money")} accent hint="Meta + attributed ledger ÷ Meta closes" />
          <KpiCard label="Closes" value={fmt(m.closes, "int")} />
          <KpiCard label="Close Rate" value={fmt(m.close_rate, "pct")} />
        </div>
      </KpiSection>

      <KpiSection title="Funnel" showDivider>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard label="Intros Booked" value={fmt(m.intros_booked, "int")} />
          <KpiCard label="Intro Show Rate" value={fmt(m.intro_show_rate, "pct")} />
          <KpiCard label="Demos Booked" value={fmt(m.demos_booked, "int")} />
          <KpiCard label="Demo Show Rate" value={fmt(m.demo_show_rate, "pct")} />
          <KpiCard label="Demos Showed" value={fmt(m.demos_showed, "int")} />
          <KpiCard label="Offers" value={fmt(m.offers_made, "int")} />
          <KpiCard label="Offer Rate" value={fmt(m.offer_rate, "pct")} />
          <KpiCard label="Cost / Demo Showed" value={fmt(m.cost_per_demo_showed, "money")} />
        </div>
      </KpiSection>
    </div>
  );
}

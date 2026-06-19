"use client";

import type { OfferScope } from "@/lib/acquisition-metrics";
import type { AcquisitionKpiTab } from "@/lib/nav";
import type { DatePreset } from "@/lib/date-presets";
import DateRangeFilter from "../DateRangeFilter";

export type KpiFilters = {
  offerScope: OfferScope;
  repFilter: string;
};

type Props = {
  activeTab: AcquisitionKpiTab;
  filters: KpiFilters;
  setterNames: string[];
  closerNames: string[];
  onChange: (f: KpiFilters) => void;
  preset: DatePreset;
  customStart: string;
  customEnd: string;
  onPresetChange: (preset: DatePreset) => void;
  onCustomStartChange: (value: string) => void;
  onCustomEndChange: (value: string) => void;
};

const SCOPE_LABELS: Record<OfferScope, string> = {
  core: "Core Offer",
  skool: "Skool",
  all_downsells: "All Downsells",
  all: "All Offers",
};

export default function AcquisitionKpiFilterBar({
  activeTab,
  filters,
  setterNames,
  closerNames,
  onChange,
  preset,
  customStart,
  customEnd,
  onPresetChange,
  onCustomStartChange,
  onCustomEndChange,
}: Props) {
  const repNames = activeTab === "closers" ? closerNames : setterNames;
  const repLabel = activeTab === "closers" ? "Closer" : "Setter";
  const showRepFilter = activeTab === "setters" || activeTab === "closers";

  return (
    <div
      className="flex flex-wrap items-center gap-3 px-6 py-3 text-xs"
      style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(15,17,21,0.8)" }}
    >
      {/* Date range — same presets as Client KPIs */}
      <div className="flex items-center gap-2">
        <span style={{ color: "#475569", fontFamily: "var(--font-mono, monospace)", fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase" }}>
          Period
        </span>
        <DateRangeFilter
          variant="inline"
          preset={preset}
          customStart={customStart}
          customEnd={customEnd}
          onPresetChange={onPresetChange}
          onCustomStartChange={onCustomStartChange}
          onCustomEndChange={onCustomEndChange}
        />
      </div>

      <div style={{ width: 1, height: 20, background: "rgba(255,255,255,0.08)" }} />

      {/* Offer scope */}
      <div className="flex items-center gap-2">
        <span style={{ color: "#475569", fontFamily: "var(--font-mono, monospace)", fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase" }}>
          Scope
        </span>
        <div className="flex gap-1">
          {(["core", "skool", "all_downsells", "all"] as OfferScope[]).map(s => (
            <button
              key={s}
              onClick={() => onChange({ ...filters, offerScope: s })}
              className="px-3 py-1 rounded-full transition-all"
              style={
                filters.offerScope === s
                  ? { background: "#4f8ef5", color: "#fff", fontWeight: 600 }
                  : { background: "rgba(255,255,255,0.05)", color: "#64748b", border: "1px solid rgba(255,255,255,0.08)" }
              }
            >
              {SCOPE_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      {/* Rep filter — only on setter/closer tabs */}
      {showRepFilter && (
        <>
          <div style={{ width: 1, height: 20, background: "rgba(255,255,255,0.08)" }} />
          <div className="flex items-center gap-2">
            <span style={{ color: "#475569", fontFamily: "var(--font-mono, monospace)", fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase" }}>
              {repLabel}
            </span>
            <select
              value={filters.repFilter}
              onChange={e => onChange({ ...filters, repFilter: e.target.value })}
              className="rounded-md px-2 py-1 text-xs outline-none"
              style={{ background: "#161820", border: "1px solid rgba(255,255,255,0.1)", color: "#e2e8f0", fontFamily: "inherit" }}
            >
              <option value="">All</option>
              {repNames.map(n => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
        </>
      )}

      {/* Date semantics tooltip */}
      <div className="ml-auto" style={{ color: "#334155", fontFamily: "var(--font-mono, monospace)", fontSize: 9 }}>
        Intro show/demo show → scheduled date · Bookings → booked date · Leads → created date
      </div>
    </div>
  );
}

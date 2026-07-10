"use client";

import type { OfferScope } from "@/lib/acquisition-metrics";
import type { AcquisitionKpiTab } from "@/lib/nav";
import type { DatePreset } from "@/lib/date-presets";
import DateRangeFilter from "../DateRangeFilter";
import { KPI } from "./kpi-ui";

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
      className="relative shrink-0 px-6 py-4"
      style={{
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        background: "linear-gradient(180deg, rgba(12,18,32,0.95) 0%, rgba(8,12,22,0.88) 100%)",
        fontFamily: KPI.font,
      }}
    >
      <div className="flex flex-wrap items-center gap-4">
        <FilterGroup label="Period">
          <DateRangeFilter
            variant="inline"
            preset={preset}
            customStart={customStart}
            customEnd={customEnd}
            onPresetChange={onPresetChange}
            onCustomStartChange={onCustomStartChange}
            onCustomEndChange={onCustomEndChange}
          />
        </FilterGroup>

        <Divider />

        <FilterGroup label="Scope">
          <div className="flex flex-wrap gap-1.5">
            {(["core", "skool", "all_downsells", "all"] as OfferScope[]).map(s => {
              const active = filters.offerScope === s;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => onChange({ ...filters, offerScope: s })}
                  className="rounded-full px-4 py-2 text-sm font-medium transition-all duration-300 active:scale-[0.98]"
                  style={
                    active
                      ? {
                          background: "rgba(96,165,250,0.2)",
                          color: "#93c5fd",
                          border: "1px solid rgba(96,165,250,0.45)",
                          boxShadow: "inset 0 1px 1px rgba(255,255,255,0.1)",
                        }
                      : {
                          background: "rgba(255,255,255,0.04)",
                          color: KPI.textMuted,
                          border: "1px solid rgba(255,255,255,0.08)",
                        }
                  }
                >
                  {SCOPE_LABELS[s]}
                </button>
              );
            })}
          </div>
        </FilterGroup>

        {showRepFilter && (
          <>
            <Divider />
            <FilterGroup label={repLabel}>
              <select
                value={filters.repFilter}
                onChange={e => onChange({ ...filters, repFilter: e.target.value })}
                className="rounded-xl px-3 py-2 text-sm font-medium outline-none"
                style={{
                  background: "rgba(8,14,28,0.95)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  color: KPI.text,
                  minWidth: 140,
                }}
              >
                <option value="">All reps</option>
                {repNames.map(n => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </FilterGroup>
          </>
        )}

        <p className="ml-auto hidden max-w-xs text-right text-xs leading-relaxed lg:block" style={{ color: KPI.textDim }}>
          Intro & demo show dates use scheduled time. Bookings use booked date. Leads use created date.
        </p>
      </div>
    </div>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: KPI.textDim }}>
        {label}
      </span>
      {children}
    </div>
  );
}

function Divider() {
  return <div className="hidden h-10 w-px sm:block" style={{ background: "rgba(255,255,255,0.08)" }} />;
}

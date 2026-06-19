"use client";

import { useState, useCallback, useEffect } from "react";
import ViewHub from "../nav/ViewHub";
import AcquisitionKpiFilterBar, { type KpiFilters } from "../acquisition-kpi/AcquisitionKpiFilterBar";
import AcquisitionKpiOverview from "../acquisition-kpi/AcquisitionKpiOverview";
import AcquisitionKpiSetters from "../acquisition-kpi/AcquisitionKpiSetters";
import AcquisitionKpiClosers from "../acquisition-kpi/AcquisitionKpiClosers";
import AcquisitionKpiCosts from "../acquisition-kpi/AcquisitionKpiCosts";
import { ACQUISITION_KPI_TABS, type AcquisitionKpiTab } from "@/lib/nav";
import type { DatePreset } from "@/lib/date-presets";

type Props = {
  tab: AcquisitionKpiTab;
  onTabChange: (tab: AcquisitionKpiTab) => void;
  startDate: string;
  endDate: string;
  isOwner?: boolean;
  preset: DatePreset;
  customStart: string;
  customEnd: string;
  onPresetChange: (preset: DatePreset) => void;
  onCustomStartChange: (value: string) => void;
  onCustomEndChange: (value: string) => void;
};

export default function AcquisitionKpiHub({
  tab,
  onTabChange,
  startDate,
  endDate,
  isOwner = false,
  preset,
  customStart,
  customEnd,
  onPresetChange,
  onCustomStartChange,
  onCustomEndChange,
}: Props) {
  const [filters, setFilters] = useState<KpiFilters>({ offerScope: "core", repFilter: "" });
  const [setterNames, setSetterNames] = useState<string[]>([]);
  const [closerNames, setCloserNames] = useState<string[]>([]);

  const handleSetterNames = useCallback((names: string[]) => setSetterNames(names), []);
  const handleCloserNames = useCallback((names: string[]) => setCloserNames(names), []);

  // Redirect non-owners away from costs tab
  useEffect(() => {
    if (!isOwner && tab === "costs") {
      onTabChange("overview");
    }
  }, [isOwner, tab, onTabChange]);

  // Only show Costs tab to the owner
  const visibleTabs = isOwner
    ? ACQUISITION_KPI_TABS
    : ACQUISITION_KPI_TABS.filter(t => t.key !== "costs");

  const activeTab = (!isOwner && tab === "costs") ? "overview" : tab;

  return (
    <div className="flex flex-col" style={{ minHeight: 0 }}>
      <AcquisitionKpiFilterBar
        activeTab={activeTab}
        filters={filters}
        setterNames={setterNames}
        closerNames={closerNames}
        onChange={setFilters}
        preset={preset}
        customStart={customStart}
        customEnd={customEnd}
        onPresetChange={onPresetChange}
        onCustomStartChange={onCustomStartChange}
        onCustomEndChange={onCustomEndChange}
      />
      <div className="flex-1 overflow-y-auto">
        <div className="px-6 pt-6">
          <ViewHub
            tabs={visibleTabs}
            activeTab={activeTab}
            onTabChange={key => onTabChange(key as AcquisitionKpiTab)}
          >
            <div className="mt-2">
              {activeTab === "overview" && (
                <AcquisitionKpiOverview startDate={startDate} endDate={endDate} filters={filters} />
              )}
              {activeTab === "setters" && (
                <AcquisitionKpiSetters
                  startDate={startDate}
                  endDate={endDate}
                  filters={filters}
                  onSetterNamesLoaded={handleSetterNames}
                />
              )}
              {activeTab === "closers" && (
                <AcquisitionKpiClosers
                  startDate={startDate}
                  endDate={endDate}
                  filters={filters}
                  onCloserNamesLoaded={handleCloserNames}
                />
              )}
              {isOwner && activeTab === "costs" && (
                <AcquisitionKpiCosts startDate={startDate} endDate={endDate} filters={filters} />
              )}
            </div>
          </ViewHub>
        </div>
      </div>
    </div>
  );
}

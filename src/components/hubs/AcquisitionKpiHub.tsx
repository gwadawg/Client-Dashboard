"use client";

import { useState, useCallback } from "react";
import ViewHub from "../nav/ViewHub";
import AcquisitionKpiFilterBar, { type KpiFilters } from "../acquisition-kpi/AcquisitionKpiFilterBar";
import AcquisitionKpiOverview from "../acquisition-kpi/AcquisitionKpiOverview";
import AcquisitionKpiSetters from "../acquisition-kpi/AcquisitionKpiSetters";
import AcquisitionKpiClosers from "../acquisition-kpi/AcquisitionKpiClosers";
import AcquisitionKpiCosts from "../acquisition-kpi/AcquisitionKpiCosts";
import { ACQUISITION_KPI_TABS, type AcquisitionKpiTab } from "@/lib/nav";

type Props = {
  tab: AcquisitionKpiTab;
  onTabChange: (tab: AcquisitionKpiTab) => void;
  startDate: string;
  endDate: string;
};

export default function AcquisitionKpiHub({ tab, onTabChange, startDate, endDate }: Props) {
  const [filters, setFilters] = useState<KpiFilters>({ offerScope: "core", repFilter: "" });
  const [setterNames, setSetterNames] = useState<string[]>([]);
  const [closerNames, setCloserNames] = useState<string[]>([]);

  const handleSetterNames = useCallback((names: string[]) => setSetterNames(names), []);
  const handleCloserNames = useCallback((names: string[]) => setCloserNames(names), []);

  return (
    <div className="flex flex-col" style={{ minHeight: 0 }}>
      <AcquisitionKpiFilterBar
        activeTab={tab}
        filters={filters}
        setterNames={setterNames}
        closerNames={closerNames}
        onChange={setFilters}
      />
      <div className="flex-1 overflow-y-auto">
        <div className="px-6 pt-6">
          <ViewHub
            tabs={ACQUISITION_KPI_TABS}
            activeTab={tab}
            onTabChange={key => onTabChange(key as AcquisitionKpiTab)}
          >
            <div className="mt-2">
              {tab === "overview" && (
                <AcquisitionKpiOverview startDate={startDate} endDate={endDate} filters={filters} />
              )}
              {tab === "setters" && (
                <AcquisitionKpiSetters
                  startDate={startDate}
                  endDate={endDate}
                  filters={filters}
                  onSetterNamesLoaded={handleSetterNames}
                />
              )}
              {tab === "closers" && (
                <AcquisitionKpiClosers
                  startDate={startDate}
                  endDate={endDate}
                  filters={filters}
                  onCloserNamesLoaded={handleCloserNames}
                />
              )}
              {tab === "costs" && (
                <AcquisitionKpiCosts startDate={startDate} endDate={endDate} filters={filters} />
              )}
            </div>
          </ViewHub>
        </div>
      </div>
    </div>
  );
}

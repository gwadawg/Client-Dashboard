"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo } from "react";
import ViewHub from "../nav/ViewHub";
import WorkspaceSubTabs from "./WorkspaceSubTabs";
import WorkspaceFilterBar from "./WorkspaceFilterBar";
import ClientActivityRail from "./ClientActivityRail";
import ClientKpiPanel, { type ClientKpiPanelData } from "./ClientKpiPanel";
import {
  CLIENT_WORKSPACE_SUBTABS,
  CLIENT_WORKSPACE_TABS,
  resolveWorkspaceSubTab,
  type ClientWorkspaceTab,
  type DataExplorerTab,
  type HeatmapTab,
} from "@/lib/nav";
import type { DashboardClient, DashboardFilters } from "@/lib/use-dashboard-filters";

const DialAnalytics = dynamic(() => import("../DialAnalytics"));
const HeatMap = dynamic(() => import("../HeatMap"));
const RawDataTable = dynamic(() => import("../RawDataTable"));
const AppointmentsTable = dynamic(() => import("../AppointmentsTable"));
const LeadProfilesTable = dynamic(() => import("../LeadProfilesTable"));

type Props = {
  tab: ClientWorkspaceTab;
  /** Level-2 selection, or `conversions` on the KPIs tab. */
  sub: string | null;
  onTabChange: (tab: ClientWorkspaceTab) => void;
  onSubChange: (sub: string | null) => void;
  /** Tabs the viewer is permitted to open, in display order. */
  allowedTabs: ClientWorkspaceTab[];
  filters: DashboardFilters;
  clients: DashboardClient[];
  kpi: ClientKpiPanelData;
  railOpen: boolean;
  onToggleRail: () => void;
};

export default function ClientWorkspaceHub({
  tab,
  sub,
  onTabChange,
  onSubChange,
  allowedTabs,
  filters,
  clients,
  kpi,
  railOpen,
  onToggleRail,
}: Props) {
  const visibleTabs = useMemo(
    () => CLIENT_WORKSPACE_TABS.filter(t => allowedTabs.includes(t.key)),
    [allowedTabs],
  );

  const permitted = allowedTabs.includes(tab);
  const activeTab = permitted ? tab : visibleTabs[0]?.key ?? tab;

  // A hand-typed or bookmarked tab the viewer can't open falls back to their
  // first permitted one, and the URL is corrected to match.
  useEffect(() => {
    if (!permitted && visibleTabs.length) onTabChange(visibleTabs[0].key);
  }, [permitted, visibleTabs, onTabChange]);

  const nestedTabs = CLIENT_WORKSPACE_SUBTABS[activeTab];
  const activeSub = resolveWorkspaceSubTab(activeTab, sub);

  if (!visibleTabs.length) {
    return (
      <div className="flex items-center justify-center py-24">
        <p className="text-sm" style={{ color: "var(--color-ws-text-muted)" }}>
          You don&apos;t have access to any Client Workspace tabs yet.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-0">
      <WorkspaceFilterBar
        filters={filters}
        clients={clients}
        showCompare={
          activeTab === "kpis" && filters.preset !== "all_time" && filters.preset !== "since_launch"
        }
        railOpen={railOpen}
        onToggleRail={onToggleRail}
      />

      <div className="flex gap-6 pt-6 min-w-0">
        <div className="flex-1 min-w-0 space-y-6">
          <ViewHub
            tabs={visibleTabs}
            activeTab={activeTab}
            onTabChange={key => onTabChange(key as ClientWorkspaceTab)}
          >
            {nestedTabs && activeSub && (
              <WorkspaceSubTabs
                tabs={nestedTabs}
                activeTab={activeSub}
                onTabChange={onSubChange}
              />
            )}

            {activeTab === "kpis" && (
              <ClientKpiPanel
                data={kpi}
                filters={filters}
                selectedClient={filters.selectedClient}
                showConversions={sub === "conversions"}
                onOpenConversions={() => onSubChange("conversions")}
                onCloseConversions={() => onSubChange(null)}
                onReviewOverdue={() => {
                  onTabChange("explorer");
                  onSubChange("appointments");
                }}
              />
            )}

            {activeTab === "dials" && (
              <DialAnalytics
                startDate={filters.dateStart}
                endDate={filters.dateEnd}
                clientId={filters.singleClientId}
                liveOnly={filters.liveOnly}
                onOpenRawDials={() => {
                  onTabChange("explorer");
                  onSubChange("dials");
                }}
              />
            )}

            {activeTab === "heatmaps" && (
              <HeatMap
                type={activeSub as HeatmapTab}
                startDate={filters.heatmapStart}
                endDate={filters.heatmapEnd}
                clientId={filters.singleClientId}
                liveOnly={filters.liveOnly}
              />
            )}

            {activeTab === "explorer" && (
              <ExplorerPanel tab={activeSub as DataExplorerTab} filters={filters} />
            )}
          </ViewHub>
        </div>

        {railOpen && (
          <ClientActivityRail
            client={filters.selectedClient}
            todayYmd={filters.todayYmd}
            onClose={onToggleRail}
          />
        )}
      </div>
    </div>
  );
}

function ExplorerPanel({ tab, filters }: { tab: DataExplorerTab; filters: DashboardFilters }) {
  const scope = {
    clientId: filters.singleClientId,
    liveOnly: filters.liveOnly,
    startDate: filters.dateStart,
    endDate: filters.dateEnd,
  };

  if (tab === "leads" || tab === "conversions") {
    return <LeadProfilesTable {...scope} conversionsTab={tab === "conversions"} />;
  }
  if (tab === "appointments") return <AppointmentsTable {...scope} />;
  // Keyed so switching between the RawDataTable-backed tabs resets its rows
  // instead of briefly showing the previous tab's columns against new data.
  return <RawDataTable key={tab} type={tab === "meta_ads" ? "meta_ad_insights" : tab} {...scope} />;
}

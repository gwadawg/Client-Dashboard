"use client";

import HeatMap from "../HeatMap";
import ViewHub from "../nav/ViewHub";
import { HEATMAP_TABS, type HeatmapTab } from "@/lib/nav";

type Props = {
  tab: HeatmapTab;
  onTabChange: (tab: HeatmapTab) => void;
  heatmapClientId: string;
  heatmapStart?: string;
  heatmapEnd?: string;
};

export default function HeatMapsHub({
  tab,
  onTabChange,
  heatmapClientId,
  heatmapStart,
  heatmapEnd,
}: Props) {
  const clientId = heatmapClientId !== "__live__" ? heatmapClientId || undefined : undefined;
  const liveOnly = heatmapClientId === "__live__";

  return (
    <ViewHub
      tabs={HEATMAP_TABS}
      activeTab={tab}
      onTabChange={key => onTabChange(key as HeatmapTab)}
    >
      <HeatMap
        type={tab}
        startDate={heatmapStart}
        endDate={heatmapEnd}
        clientId={clientId}
        liveOnly={liveOnly}
      />
    </ViewHub>
  );
}

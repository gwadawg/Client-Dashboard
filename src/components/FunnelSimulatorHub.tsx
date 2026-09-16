"use client";

import { useState } from "react";
import FunnelSimulatorView from "./FunnelSimulatorView";
import LeadSourceRoiCalculator from "./LeadSourceRoiCalculator";
import SegmentedControl from "./ui/SegmentedControl";
import type { MetricsResult } from "@/lib/metrics";

export type SimTab = "funnel" | "lead_source_roi";

type Props = {
  metrics: MetricsResult | null;
  metricsLoading: boolean;
  clientLabel?: string;
  clientIsRm: boolean;
  dateRangeLabel: string;
  onViewActuals?: () => void;
  initialFunnelEncoded?: string | null;
  onFunnelStateChange?: (encoded: string) => void;
  initialRoiEncoded?: string | null;
  onRoiStateChange?: (encoded: string) => void;
  initialTab?: SimTab;
  onTabChange?: (tab: SimTab) => void;
};

export default function FunnelSimulatorHub(props: Props) {
  const [tab, setTab] = useState<SimTab>(props.initialTab || "funnel");

  function select(next: SimTab) {
    setTab(next);
    props.onTabChange?.(next);
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="px-4 pt-3 pb-3 shrink-0">
        <SegmentedControl
          segments={[
            { key: "funnel", label: "Funnel" },
            { key: "lead_source_roi", label: "Lead Source ROI" },
          ]}
          value={tab}
          onChange={key => select(key as SimTab)}
          ariaLabel="Simulator views"
        />
      </div>
      {tab === "funnel" ? (
        <FunnelSimulatorView
          metrics={props.metrics}
          metricsLoading={props.metricsLoading}
          clientLabel={props.clientLabel}
          clientIsRm={props.clientIsRm}
          dateRangeLabel={props.dateRangeLabel}
          onViewActuals={props.onViewActuals}
          initialEncoded={props.initialFunnelEncoded}
          onStateChange={props.onFunnelStateChange}
        />
      ) : (
        <LeadSourceRoiCalculator
          variant="internal"
          initialEncoded={props.initialRoiEncoded}
          onStateChange={props.onRoiStateChange}
        />
      )}
    </div>
  );
}

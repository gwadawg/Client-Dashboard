"use client";

import { useState } from "react";
import FunnelSimulatorView from "./FunnelSimulatorView";
import LeadSourceRoiCalculator from "./LeadSourceRoiCalculator";
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
      <div
        className="flex gap-1 px-4 pt-3 pb-0 shrink-0"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        {(
          [
            ["funnel", "Funnel"],
            ["lead_source_roi", "Lead source ROI"],
          ] as const
        ).map(([key, label]) => {
          const active = tab === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => select(key)}
              className="px-3 py-2 text-sm font-medium"
              style={{
                color: active ? "#f59e0b" : "#94a3b8",
                borderBottom: active
                  ? "2px solid #f59e0b"
                  : "2px solid transparent",
              }}
            >
              {label}
            </button>
          );
        })}
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

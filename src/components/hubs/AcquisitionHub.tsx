"use client";

import AcquisitionDashboard from "../AcquisitionDashboard";
import AcquisitionTeamBoard from "../AcquisitionTeamBoard";
import AcquisitionSetterCreditQueue from "../AcquisitionSetterCreditQueue";
import AcquisitionSalesCalls from "../AcquisitionSalesCalls";
import AcquisitionPendingCloses from "../AcquisitionPendingCloses";
import ViewHub from "../nav/ViewHub";
import { ACQUISITION_TABS, type AcquisitionTab } from "@/lib/nav";

type Props = {
  tab: AcquisitionTab;
  onTabChange: (tab: AcquisitionTab) => void;
  startDate: string;
  endDate: string;
};

export default function AcquisitionHub({ tab, onTabChange, startDate, endDate }: Props) {
  return (
    <ViewHub
      tabs={ACQUISITION_TABS}
      activeTab={tab}
      onTabChange={key => onTabChange(key as AcquisitionTab)}
    >
      {tab === "overview" && <AcquisitionDashboard startDate={startDate} endDate={endDate} />}
      {tab === "team" && <AcquisitionTeamBoard startDate={startDate} endDate={endDate} />}
      {tab === "credit_queue" && (
        <AcquisitionSetterCreditQueue startDate={startDate} endDate={endDate} />
      )}
      {tab === "sales_calls" && (
        <AcquisitionSalesCalls startDate={startDate} endDate={endDate} />
      )}
      {tab === "pending_closes" && <AcquisitionPendingCloses />}
    </ViewHub>
  );
}

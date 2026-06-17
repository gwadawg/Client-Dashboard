"use client";

import AcquisitionDashboard from "../AcquisitionDashboard";
import AcquisitionRawTable from "../AcquisitionRawTable";
import AcquisitionTeamBoard from "../AcquisitionTeamBoard";
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
      {tab === "leads" && <AcquisitionRawTable type="leads" startDate={startDate} endDate={endDate} />}
      {tab === "appointments" && (
        <AcquisitionRawTable type="appointments" startDate={startDate} endDate={endDate} />
      )}
      {tab === "offers" && <AcquisitionRawTable type="offers" startDate={startDate} endDate={endDate} />}
      {tab === "ads" && <AcquisitionRawTable type="ads" startDate={startDate} endDate={endDate} />}
    </ViewHub>
  );
}

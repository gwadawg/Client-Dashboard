"use client";

import AcquisitionLeadProfilesTable from "../AcquisitionLeadProfilesTable";
import AcquisitionRawTable from "../AcquisitionRawTable";
import ViewHub from "../nav/ViewHub";
import { ACQUISITION_DATA_EXPLORER_TABS, type AcquisitionDataExplorerTab } from "@/lib/nav";

type Props = {
  tab: AcquisitionDataExplorerTab;
  onTabChange: (tab: AcquisitionDataExplorerTab) => void;
  startDate: string;
  endDate: string;
};

export default function AcquisitionDataExplorerHub({ tab, onTabChange, startDate, endDate }: Props) {
  return (
    <ViewHub
      tabs={ACQUISITION_DATA_EXPLORER_TABS}
      activeTab={tab}
      onTabChange={key => onTabChange(key as AcquisitionDataExplorerTab)}
    >
      {tab === "leads" && (
        <AcquisitionLeadProfilesTable startDate={startDate} endDate={endDate} />
      )}
      {tab === "appointments" && (
        <AcquisitionRawTable type="appointments" startDate={startDate} endDate={endDate} />
      )}
      {tab === "offers" && (
        <AcquisitionRawTable type="offers" startDate={startDate} endDate={endDate} />
      )}
      {tab === "dials" && (
        <AcquisitionRawTable type="dials" startDate={startDate} endDate={endDate} />
      )}
      {tab === "closes" && (
        <AcquisitionRawTable type="closes" startDate={startDate} endDate={endDate} />
      )}
      {tab === "ads" && (
        <AcquisitionRawTable type="ads" startDate={startDate} endDate={endDate} />
      )}
    </ViewHub>
  );
}

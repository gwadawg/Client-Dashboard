"use client";

import AcquisitionRawTable from "./AcquisitionRawTable";
import ViewHub from "./nav/ViewHub";
import { ACQUISITION_DATA_EXPLORER_TABS, type AcquisitionDataExplorerTab } from "@/lib/nav";

type Props = {
  subTab: AcquisitionDataExplorerTab;
  onSubTabChange: (tab: AcquisitionDataExplorerTab) => void;
  startDate: string;
  endDate: string;
};

export default function AcquisitionDataSection({ subTab, onSubTabChange, startDate, endDate }: Props) {
  return (
    <div className="space-y-4">
      <ViewHub
        tabs={ACQUISITION_DATA_EXPLORER_TABS}
        activeTab={subTab}
        onTabChange={key => onSubTabChange(key as AcquisitionDataExplorerTab)}
      >
        {subTab === "offers" && (
          <AcquisitionRawTable type="offers" startDate={startDate} endDate={endDate} />
        )}
        {subTab === "dials" && (
          <AcquisitionRawTable type="dials" startDate={startDate} endDate={endDate} />
        )}
        {subTab === "closes" && (
          <AcquisitionRawTable type="closes" startDate={startDate} endDate={endDate} />
        )}
        {subTab === "ads" && (
          <AcquisitionRawTable type="ads" startDate={startDate} endDate={endDate} />
        )}
      </ViewHub>
    </div>
  );
}

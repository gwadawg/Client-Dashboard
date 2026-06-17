"use client";

import RawDataTable from "../RawDataTable";
import AppointmentsTable from "../AppointmentsTable";
import LeadProfilesTable from "../LeadProfilesTable";
import ViewHub from "../nav/ViewHub";
import { DATA_EXPLORER_TABS, type DataExplorerTab } from "@/lib/nav";

type Client = { id: string; name: string };
type Preset = string;

type Props = {
  tab: DataExplorerTab;
  onTabChange: (tab: DataExplorerTab) => void;
  clients: Client[];
  preset: Preset;
  startDate: string;
  endDate: string;
};

export default function DataExplorerHub({
  tab,
  onTabChange,
  clients,
  preset,
  startDate,
  endDate,
}: Props) {
  return (
    <ViewHub
      tabs={DATA_EXPLORER_TABS}
      activeTab={tab}
      onTabChange={key => onTabChange(key as DataExplorerTab)}
    >
      {tab === "leads" && (
        <LeadProfilesTable clients={clients} startDate={startDate} endDate={endDate} />
      )}
      {tab === "appointments" && (
        <AppointmentsTable clients={clients} startDate={startDate} endDate={endDate} />
      )}
      {tab === "dials" && (
        <RawDataTable type="dials" clients={clients} preset={preset} startDate={startDate} endDate={endDate} />
      )}
      {tab === "speed_to_lead" && (
        <RawDataTable type="speed_to_lead" clients={clients} preset={preset} startDate={startDate} endDate={endDate} />
      )}
      {tab === "meta_ads" && (
        <RawDataTable type="meta_ad_insights" clients={clients} preset={preset} startDate={startDate} endDate={endDate} />
      )}
    </ViewHub>
  );
}

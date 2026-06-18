"use client";

import AgentPerformance from "../AgentPerformance";
import AgentCreditQueue from "../AgentCreditQueue";
import RecordingBrowser from "../RecordingBrowser";
import GoalTracker from "../GoalTracker";
import ViewHub from "../nav/ViewHub";
import { AGENTS_TABS, type AgentsTab } from "@/lib/nav";

type Client = { id: string; name: string };
type Preset = string;

type Props = {
  tab: AgentsTab;
  onTabChange: (tab: AgentsTab) => void;
  clients: Client[];
  preset: Preset;
  startDate: string;
  endDate: string;
};

export default function AgentsHub({
  tab,
  onTabChange,
  clients,
  preset,
  startDate,
  endDate,
}: Props) {
  return (
    <ViewHub
      tabs={AGENTS_TABS}
      activeTab={tab}
      onTabChange={key => onTabChange(key as AgentsTab)}
    >
      {tab === "performance" && (
        <AgentPerformance preset={preset} startDate={startDate} endDate={endDate} />
      )}
      {tab === "goals" && (
        <GoalTracker clients={clients} startDate={startDate} endDate={endDate} mode="agents" />
      )}
      {tab === "credit_queue" && (
        <AgentCreditQueue clients={clients} startDate={startDate} endDate={endDate} />
      )}
      {tab === "recordings" && (
        <RecordingBrowser clients={clients} startDate={startDate} endDate={endDate} />
      )}
    </ViewHub>
  );
}

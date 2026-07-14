"use client";

import AcquisitionSetterCreditQueue from "../AcquisitionSetterCreditQueue";
import AcquisitionSalesCalls from "../AcquisitionSalesCalls";
import AcquisitionPendingCloses from "../AcquisitionPendingCloses";
import AcquisitionLogClose from "../AcquisitionLogClose";
import AcquisitionAppointmentsTable from "../AcquisitionAppointmentsTable";
import DialExamplesLibrary from "../DialExamplesLibrary";
import ViewHub from "../nav/ViewHub";
import { ACQUISITION_TABS, type AcquisitionTab } from "@/lib/nav";

type Props = {
  tab: AcquisitionTab;
  onTabChange: (tab: AcquisitionTab) => void;
  startDate: string;
  endDate: string;
  canManage?: boolean;
};

export default function AcquisitionHub({
  tab,
  onTabChange,
  startDate,
  endDate,
  canManage = false,
}: Props) {
  return (
    <ViewHub
      tabs={ACQUISITION_TABS}
      activeTab={tab}
      onTabChange={key => onTabChange(key as AcquisitionTab)}
    >
      {tab === "appointments" && (
        <AcquisitionAppointmentsTable startDate={startDate} endDate={endDate} />
      )}
      {tab === "credit_queue" && (
        <AcquisitionSetterCreditQueue startDate={startDate} endDate={endDate} />
      )}
      {tab === "sales_calls" && (
        <AcquisitionSalesCalls startDate={startDate} endDate={endDate} />
      )}
      {tab === "call_examples" && (
        <DialExamplesLibrary
          domain="b2b"
          canManage={canManage}
          startDate={startDate}
          endDate={endDate}
        />
      )}
      {tab === "pending_closes" && <AcquisitionPendingCloses />}
      {tab === "log_close" && <AcquisitionLogClose />}
    </ViewHub>
  );
}

"use client";

import { useState } from "react";
import AccountWeekPlanForm from "@/components/AccountWeekPlanForm";
import AccountWeekPlanApprovalQueue from "@/components/AccountWeekPlanApprovalQueue";
import AccountWeekPlansWeekList from "@/components/AccountWeekPlansWeekList";

type Tab = "week" | "approve" | "new";

const TABS: { key: Tab; label: string }[] = [
  { key: "week", label: "This week" },
  { key: "approve", label: "Approve" },
  { key: "new", label: "New plan" },
];

export default function AccountWeekPlansHub() {
  const [tab, setTab] = useState<Tab>("week");
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="space-y-4 max-w-4xl">
      <div>
        <h2 className="text-lg font-semibold text-slate-100">Account Work</h2>
        <p className="text-sm text-slate-400 mt-1">
          Weekly plans per client: tasks assigned and scheduled. Founder approves
          every plan. Completing a task can optionally log a Client Success
          account change.
        </p>
      </div>

      <div className="flex gap-1 border-b border-white/10 pb-2">
        {TABS.map(t => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`px-3 py-1.5 text-xs rounded-md ${
              tab === t.key
                ? "bg-white/10 text-white"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div key={refreshKey}>
        {tab === "week" && <AccountWeekPlansWeekList />}
        {tab === "approve" && (
          <AccountWeekPlanApprovalQueue
            onChanged={() => setRefreshKey(k => k + 1)}
          />
        )}
        {tab === "new" && (
          <AccountWeekPlanForm
            onCreated={() => {
              setRefreshKey(k => k + 1);
              setTab("approve");
            }}
          />
        )}
      </div>
    </div>
  );
}

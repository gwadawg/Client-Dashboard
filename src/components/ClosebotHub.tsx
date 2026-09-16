"use client";

import ClosebotPromptLog from "@/components/ClosebotPromptLog";
import ClosebotTicketsSection from "@/components/ClosebotTicketsSection";
import SegmentedControl from "@/components/ui/SegmentedControl";
import { useUrlParams } from "@/lib/use-url-params";

type ClosebotTab = "tickets" | "updates";

type Props = {
  canWrite?: boolean;
};

const TABS: { key: ClosebotTab; label: string }[] = [
  { key: "tickets", label: "Tickets" },
  { key: "updates", label: "Updates" },
];

export default function ClosebotHub({ canWrite = false }: Props) {
  const url = useUrlParams();
  const tab: ClosebotTab = url.get("tab") === "updates" ? "updates" : "tickets";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p
            className="text-[10px] font-semibold uppercase tracking-[0.28em] mb-2"
            style={{ color: "#f59e0b", fontFamily: "var(--font-archivo)" }}
          >
            Closebot
          </p>
          <h2
            className="text-3xl font-semibold tracking-tight"
            style={{ color: "#f8fafc", fontFamily: "var(--font-archivo)" }}
          >
            {tab === "tickets" ? "Incident database" : "Prompt updates"}
          </h2>
          <p className="text-sm mt-1 max-w-xl" style={{ color: "#64748b" }}>
            {tab === "tickets"
              ? "Open cases, grouped by type after ops tags them. The report form only asks for the client."
              : "What we changed in each agent, and whether it worked."}
          </p>
        </div>
      </div>

      <SegmentedControl
        segments={TABS}
        value={tab}
        onChange={key => url.set("tab", key === "tickets" ? null : key)}
        ariaLabel="Closebot sections"
      />

      {tab === "tickets" ? (
        <ClosebotTicketsSection canWrite={canWrite} />
      ) : (
        <ClosebotPromptLog canWrite={canWrite} embedded />
      )}
    </div>
  );
}

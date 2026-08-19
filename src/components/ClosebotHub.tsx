"use client";

import ClosebotPromptLog from "@/components/ClosebotPromptLog";
import ClosebotTicketsSection from "@/components/ClosebotTicketsSection";
import { useUrlParams } from "@/lib/use-url-params";

type ClosebotTab = "tickets" | "updates";

type Props = {
  canWrite?: boolean;
};

const TABS: { key: ClosebotTab; label: string; hint: string }[] = [
  { key: "tickets", label: "Tickets", hint: "Incidents the team filed" },
  { key: "updates", label: "Updates", hint: "Prompt changes we shipped" },
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
              ? "Open cases, grouped by failure type. Separate from the prompt-change log."
              : "What we changed in each agent, and whether it worked."}
          </p>
        </div>
      </div>

      <div
        role="tablist"
        aria-label="Closebot sections"
        className="flex gap-1 p-1 rounded-xl w-fit"
        style={{
          background: "rgba(5,12,24,0.85)",
          border: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        {TABS.map((item) => {
          const active = tab === item.key;
          return (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => url.set("tab", item.key === "tickets" ? null : item.key)}
              className="px-4 py-2 rounded-lg text-left transition-colors"
              style={{
                background: active
                  ? item.key === "tickets"
                    ? "rgba(245,158,11,0.16)"
                    : "rgba(59,130,246,0.16)"
                  : "transparent",
                color: active ? "#f8fafc" : "#94a3b8",
              }}
            >
              <span
                className="block text-sm font-semibold"
                style={{ fontFamily: "var(--font-archivo)" }}
              >
                {item.label}
              </span>
              <span className="block text-[11px] mt-0.5" style={{ color: active ? "#cbd5e1" : "#64748b" }}>
                {item.hint}
              </span>
            </button>
          );
        })}
      </div>

      {tab === "tickets" ? (
        <ClosebotTicketsSection canWrite={canWrite} />
      ) : (
        <ClosebotPromptLog canWrite={canWrite} embedded />
      )}
    </div>
  );
}

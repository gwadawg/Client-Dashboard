"use client";

import type { MetricsResult } from "@/lib/metrics";

type Props = { metrics: MetricsResult };

type Stage = { label: string; value: number };

function pct(part: number, whole: number): string {
  if (whole <= 0) return "—";
  return `${((part / whole) * 100).toFixed(1)}%`;
}

/**
 * Top-to-bottom acquisition funnel so you can see exactly where leads leak out
 * between first contact and a funded loan. Each bar is sized relative to the top
 * stage; the right-hand number is conversion from the previous stage.
 */
export default function ConversionFunnel({ metrics }: Props) {
  const stages: Stage[] = [
    { label: "Total Leads", value: metrics.new_leads },
    { label: "Qualified", value: metrics.qualified_leads },
    { label: "Booked", value: metrics.booked_appointments },
    { label: "Shows", value: metrics.shows },
    { label: "Proposals", value: metrics.proposals_made },
    { label: "Submissions", value: metrics.submissions_made },
    { label: "Funded", value: metrics.funded_loans },
  ];

  const top = stages[0]?.value ?? 0;

  return (
    <div
      className="rounded-xl p-5"
      style={{ background: "linear-gradient(135deg, #0f2040 0%, #0c1a30 100%)", border: "1px solid rgba(255,255,255,0.07)" }}
    >
      <h3 className="text-sm font-semibold mb-1" style={{ color: "#e2e8f0" }}>Conversion funnel</h3>
      <p className="text-[10px] mb-4" style={{ color: "#475569" }}>
        Lead → funded. Right column is step conversion from the stage above.
      </p>

      {top === 0 ? (
        <p className="text-xs py-8 text-center" style={{ color: "#475569" }}>No leads in this range.</p>
      ) : (
        <div className="space-y-2">
          {stages.map((stage, i) => {
            const prev = i > 0 ? stages[i - 1].value : null;
            const widthPct = top > 0 ? Math.max((stage.value / top) * 100, stage.value > 0 ? 4 : 0) : 0;
            const isLast = i === stages.length - 1;
            return (
              <div key={stage.label} className="flex items-center gap-3">
                <span className="text-[11px] w-20 flex-shrink-0 truncate" style={{ color: "#64748b" }}>
                  {stage.label}
                </span>
                <div className="flex-1 h-7 rounded-md relative overflow-hidden" style={{ background: "#0a1628" }}>
                  <div
                    className="h-full rounded-md flex items-center px-2 transition-all duration-300"
                    style={{
                      width: `${widthPct}%`,
                      background: isLast
                        ? "linear-gradient(90deg, #f59e0b, #fbbf24)"
                        : "linear-gradient(90deg, #1d4ed8, #3b82f6)",
                    }}
                  >
                    <span className="text-xs font-semibold tabular-nums" style={{ color: "#f1f5f9" }}>
                      {stage.value}
                    </span>
                  </div>
                </div>
                <span className="text-[11px] w-14 flex-shrink-0 text-right tabular-nums" style={{ color: prev != null ? "#94a3b8" : "#334155" }}>
                  {prev != null ? pct(stage.value, prev) : "100%"}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

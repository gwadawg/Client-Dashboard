"use client";

import { useState } from "react";
import type { VerticalEffort } from "@/lib/agent-performance-types";
import {
  REPORTING_TYPES,
  REPORTING_TYPE_META,
  type ReportingType,
} from "@/lib/reporting-types";

type Props = {
  verticalEffort: VerticalEffort;
};

const LABELS: Record<ReportingType, string> = {
  RM: "Reverse",
  DSCR: "DSCR",
  CALL_CENTER: "Call Center / HE",
};

export default function VerticalDialMix({ verticalEffort }: Props) {
  const [open, setOpen] = useState<ReportingType | null>("RM");
  const total = Math.max(1, verticalEffort.total_attributed_dials);

  return (
    <section className="space-y-4">
      <div>
        <h3 className="text-base font-semibold" style={{ color: "#e2e8f0" }}>
          Where dials are going
        </h3>
        <p className="text-xs mt-0.5" style={{ color: "#475569" }}>
          Dial events by client reporting type · top accounts per vertical
        </p>
      </div>

      {/* Share bar */}
      <div
        className="h-3 rounded-full overflow-hidden flex"
        style={{ background: "rgba(255,255,255,0.06)" }}
        title="Attributed dial share"
      >
        {REPORTING_TYPES.map(t => {
          const d = verticalEffort.by_type[t].dials;
          if (d <= 0) return null;
          const meta = REPORTING_TYPE_META[t];
          return (
            <div
              key={t}
              style={{
                width: `${(d / total) * 100}%`,
                background: meta.color,
                minWidth: d > 0 ? 4 : 0,
              }}
            />
          );
        })}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {REPORTING_TYPES.map(t => {
          const bucket = verticalEffort.by_type[t];
          const meta = REPORTING_TYPE_META[t];
          const share = Math.round((bucket.dials / total) * 100);
          const isOpen = open === t;
          return (
            <div
              key={t}
              className="rounded-2xl overflow-hidden"
              style={{
                background: "#0a1628",
                border: isOpen
                  ? `1px solid ${meta.color}55`
                  : "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : t)}
                className="w-full text-left p-4 space-y-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className="text-[11px] font-bold uppercase tracking-[0.12em]"
                    style={{ color: meta.color }}
                  >
                    {LABELS[t]}
                  </span>
                  <span className="text-xs tabular-nums" style={{ color: "#64748b" }}>
                    {share}% of dials
                  </span>
                </div>
                <p className="text-3xl font-extrabold tabular-nums" style={{ color: "#f8fafc" }}>
                  {bucket.dials.toLocaleString()}
                </p>
                <div className="flex gap-4 text-xs">
                  <span style={{ color: "#94a3b8" }}>
                    <span className="font-semibold tabular-nums">{bucket.pickups.toLocaleString()}</span>{" "}
                    pickups
                  </span>
                  <span style={{ color: "#94a3b8" }}>
                    <span className="font-semibold tabular-nums" style={{ color: meta.color }}>
                      {bucket.pickup_rate}%
                    </span>{" "}
                    rate
                  </span>
                  <span style={{ color: "#94a3b8" }}>
                    <span className="font-semibold tabular-nums">
                      {bucket.conversations.toLocaleString()}
                    </span>{" "}
                    2m+
                  </span>
                </div>
              </button>

              {isOpen && (
                <div
                  className="px-4 pb-4"
                  style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}
                >
                  <p
                    className="text-[10px] font-bold uppercase tracking-widest py-2"
                    style={{ color: "#475569" }}
                  >
                    Top clients by dials
                  </p>
                  {bucket.clients.length === 0 ? (
                    <p className="text-xs" style={{ color: "#334155" }}>
                      No dials in range
                    </p>
                  ) : (
                    <ul className="space-y-1.5">
                      {bucket.clients.map(c => (
                        <li
                          key={c.client_id}
                          className="flex items-center justify-between gap-2 text-xs"
                        >
                          <span className="truncate" style={{ color: "#cbd5e1" }}>
                            {c.client_name}
                          </span>
                          <span className="tabular-nums flex-shrink-0" style={{ color: "#94a3b8" }}>
                            {c.dials.toLocaleString()}
                            <span style={{ color: "#475569" }}>
                              {" "}
                              · {c.pickups.toLocaleString()} pu
                            </span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {verticalEffort.unattributed.dials > 0 && (
        <p
          className="text-xs px-3 py-2 rounded-lg"
          style={{
            background: "rgba(248,113,113,0.08)",
            border: "1px solid rgba(248,113,113,0.2)",
            color: "#fca5a5",
          }}
        >
          {verticalEffort.unattributed.dials.toLocaleString()} dials missing client attribution
          (not in vertical totals above)
        </p>
      )}
    </section>
  );
}

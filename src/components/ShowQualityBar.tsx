"use client";

import type { MetricsResult } from "@/lib/metrics";

type Props = { metrics: MetricsResult };

type Segment = { key: string; label: string; value: number; color: string; hint: string };

/**
 * Single stacked bar that breaks "Appointments Booked" into its outcomes so the
 * show rate is explainable at a glance: how much of the booked volume actually
 * showed vs. was lost to no-shows, LO bails, cancellations, or is still pending.
 */
export default function ShowQualityBar({ metrics }: Props) {
  const segments: Segment[] = [
    { key: "shows", label: "Showed", value: metrics.shows, color: "#34d399", hint: "Lead attended" },
    { key: "no_shows", label: "No-showed", value: metrics.no_shows, color: "#f87171", hint: "Lead missed" },
    { key: "lo_bailed", label: "LO bailed", value: metrics.lo_bailed, color: "#fbbf24", hint: "Loan officer missed (not the lead)" },
    { key: "cancelled", label: "Cancelled", value: metrics.appointment_cancelled, color: "#94a3b8", hint: "Appointment cancelled" },
    { key: "pending", label: "Pending", value: metrics.appts_to_take_place, color: "#475569", hint: "Still scheduled / awaiting outcome" },
  ];

  const total = segments.reduce((sum, s) => sum + s.value, 0);

  return (
    <div
      className="rounded-xl p-5"
      style={{ background: "linear-gradient(135deg, #0f2040 0%, #0c1a30 100%)", border: "1px solid rgba(255,255,255,0.07)" }}
    >
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold" style={{ color: "#e2e8f0" }}>Appointment outcomes</h3>
        <span className="text-xs tabular-nums" style={{ color: "#64748b" }}>{total} booked</span>
      </div>
      <p className="text-[10px] mb-4" style={{ color: "#475569" }}>
        Where every booked appointment ended up. Net show rate counts only Showed vs. No-showed.
      </p>

      {total === 0 ? (
        <p className="text-xs py-8 text-center" style={{ color: "#475569" }}>No appointments in this range.</p>
      ) : (
        <>
          <div className="flex w-full h-5 rounded-md overflow-hidden" style={{ background: "#0a1628" }}>
            {segments.map(s =>
              s.value > 0 ? (
                <div
                  key={s.key}
                  style={{ width: `${(s.value / total) * 100}%`, background: s.color }}
                  title={`${s.label}: ${s.value} (${((s.value / total) * 100).toFixed(1)}%)`}
                />
              ) : null,
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mt-4">
            {segments.map(s => (
              <div key={s.key} className="flex items-start gap-2" title={s.hint}>
                <span className="mt-1 w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: s.color }} />
                <div className="min-w-0">
                  <p className="text-[11px] truncate" style={{ color: "#64748b" }}>{s.label}</p>
                  <p className="text-sm font-semibold tabular-nums" style={{ color: "#e2e8f0" }}>
                    {s.value}
                    <span className="text-[10px] font-normal ml-1" style={{ color: "#475569" }}>
                      {((s.value / total) * 100).toFixed(0)}%
                    </span>
                  </p>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

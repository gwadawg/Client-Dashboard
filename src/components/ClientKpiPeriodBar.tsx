"use client";

import {
  type DatePreset,
  getDateRange,
  PRESET_LABELS,
} from "@/lib/date-presets";
import {
  describeClientTenure,
  type ClientTenureInput,
} from "@/lib/client-tenure";

type Props = {
  clientName: string;
  client: ClientTenureInput;
  todayYmd: string;
  /** Read-only here — the workspace filter bar owns the range. */
  preset: DatePreset;
  customStart: string;
  customEnd: string;
};

/**
 * Account context for the selected client: how long they've been live, which
 * engagement month they're in, and the window the numbers below cover. It used
 * to carry its own preset chips too, which put the range under two owners at
 * once; the workspace filter bar is now the only place it can be changed.
 */
export default function ClientKpiPeriodBar({
  clientName,
  client,
  todayYmd,
  preset,
  customStart,
  customEnd,
}: Props) {
  const tenure = describeClientTenure(client, todayYmd);
  const launchHeadline = tenure.launchLabel
    ? tenure.phase === "prelaunch"
      ? `Launches ${tenure.launchLabel}`
      : `Launched ${tenure.launchLabel}`
    : tenure.signedLabel
      ? `Signed ${tenure.signedLabel}`
      : "Launch date not on file";

  const range =
    preset === "custom"
      ? { start: customStart, end: customEnd }
      : getDateRange(preset, tenure.launchYmd);
  const rangeHint =
    range.start && range.end ? `${formatChipDate(range.start)} – ${formatChipDate(range.end)}` : null;

  return (
    <section
      className="rounded-2xl px-5 py-4"
      style={{
        background: "linear-gradient(180deg, rgba(15,32,64,0.92) 0%, rgba(8,15,30,0.88) 100%)",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: "#64748b" }}>
            Client account
          </p>
          <h2 className="text-lg font-semibold mt-1 truncate" style={{ color: "#f1f5f9" }}>
            {clientName}
          </h2>
          <p className="text-sm mt-0.5" style={{ color: "#94a3b8" }}>
            {launchHeadline}
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Stat
            label="Time live"
            value={tenure.liveLabel}
            hint={
              tenure.phase === "live" && tenure.daysLive != null && tenure.daysLive > 0
                ? `${tenure.daysLive} calendar day${tenure.daysLive === 1 ? "" : "s"}`
                : tenure.phase === "signed"
                  ? "Set launch date on the client file"
                  : tenure.phase === "unknown"
                    ? "Add a launch date to track tenure"
                    : undefined
            }
            accent={tenure.phase === "live"}
          />
          <Stat
            label="Engagement"
            value={tenure.engagementMonth != null ? `Month ${tenure.engagementMonth}` : "—"}
            hint={tenure.engagementMonth != null ? "Month of engagement since launch" : undefined}
          />
          <Stat
            label="KPI period"
            value={PRESET_LABELS[preset]}
            hint={rangeHint ?? undefined}
          />
        </div>
      </div>

    </section>
  );
}

function Stat({
  label,
  value,
  hint,
  accent = false,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div
      className="min-w-[9.5rem] rounded-xl px-3.5 py-2.5"
      style={{ background: "rgba(8,15,30,0.7)", border: "1px solid rgba(255,255,255,0.06)" }}
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: "#64748b" }}>
        {label}
      </p>
      <p className="text-sm font-semibold mt-1" style={{ color: accent ? "#fbbf24" : "#e2e8f0" }}>
        {value}
      </p>
      {hint ? (
        <p className="text-[11px] mt-0.5" style={{ color: "#475569" }}>{hint}</p>
      ) : null}
    </div>
  );
}

function formatChipDate(ymd: string): string {
  const day = ymd.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return ymd;
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

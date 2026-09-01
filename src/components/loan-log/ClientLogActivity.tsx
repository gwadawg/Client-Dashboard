"use client";

import { useCallback, useEffect, useState } from "react";
import {
  FONT_BODY,
  FONT_DISPLAY,
  SHADOW_SM,
  WAIZ,
} from "@/components/onboarding/brand";
import { formatMoney } from "@/lib/loan-log-lead-context";
import type { ActivityRange, ActivityRow, ActivityStage } from "@/lib/client-log-activity";

type Props = {
  token: string;
  refreshKey?: number;
};

type ActivityPayload = {
  range: { start: string | null; end: string };
  summary: {
    proposals: number;
    submitted: number;
    funded: number;
    disqualified: number;
  };
  rows: ActivityRow[];
};

const RANGES: { value: ActivityRange; label: string }[] = [
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
  { value: "90d", label: "90d" },
  { value: "all", label: "All" },
];

const STAGE_LABELS: Record<ActivityStage, string> = {
  proposal: "Proposal",
  submitted: "Submitted",
  funded: "Funded",
  disqualified: "Disqualified",
};

const STAGE_BADGE: Record<ActivityStage, { bg: string; color: string }> = {
  proposal: { bg: WAIZ.tint2, color: WAIZ.royal },
  submitted: { bg: "#FFF7ED", color: "#C2410C" },
  funded: { bg: "#ECFDF5", color: WAIZ.greenInk },
  disqualified: { bg: "#FEF2F2", color: "#B42318" },
};

function rangeChipStyle(active: boolean): React.CSSProperties {
  return {
    border: `1px solid ${active ? WAIZ.accent : WAIZ.line}`,
    background: active ? WAIZ.tint : WAIZ.soft,
    color: active ? WAIZ.navy : WAIZ.muted,
    transition: "background 150ms, border-color 150ms, color 150ms",
  };
}

function formatDate(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ background: WAIZ.white, boxShadow: SHADOW_SM }}
    >
      <div
        style={{
          height: 3,
          background: `linear-gradient(90deg, ${WAIZ.accent700}, ${WAIZ.accent})`,
        }}
      />
      <div className="px-4 py-3 text-center">
        <p
          className="text-[28px] leading-none font-semibold tabular-nums"
          style={{ fontFamily: FONT_DISPLAY, color: WAIZ.navy }}
        >
          {value}
        </p>
        <p
          className="mt-1.5 text-xs uppercase tracking-wide"
          style={{ color: WAIZ.muted }}
        >
          {label}
        </p>
      </div>
    </div>
  );
}

function ActivitySkeleton() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="h-20 rounded-xl" style={{ background: WAIZ.tint }} />
        ))}
      </div>
      <div className="space-y-2">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="h-10 rounded-lg" style={{ background: WAIZ.tint }} />
        ))}
      </div>
    </div>
  );
}

export default function ClientLogActivity({ token, refreshKey = 0 }: Props) {
  const [range, setRange] = useState<ActivityRange>("30d");
  const [data, setData] = useState<ActivityPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(false);
    fetch(
      `/api/forms/loans/${encodeURIComponent(token)}/activity?range=${encodeURIComponent(range)}`,
    )
      .then(async res => {
        const json = await res.json().catch(() => null);
        if (!res.ok || !json) {
          setError(true);
          setData(null);
          return;
        }
        setData(json as ActivityPayload);
      })
      .catch(() => {
        setError(true);
        setData(null);
      })
      .finally(() => setLoading(false));
  }, [token, range]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  return (
    <div className="space-y-5" style={{ fontFamily: FONT_BODY }}>
      <div className="grid grid-cols-4 gap-2">
        {RANGES.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            onClick={() => setRange(value)}
            className="rounded-xl py-2 text-xs font-semibold"
            style={rangeChipStyle(range === value)}
          >
            {label}
          </button>
        ))}
      </div>

      {loading && <ActivitySkeleton />}

      {!loading && error && (
        <div
          className="rounded-xl px-4 py-3 text-sm flex items-center justify-between gap-3"
          style={{ background: "#FEF2F2", color: "#B42318" }}
        >
          <span>Couldn’t load activity.</span>
          <button
            type="button"
            onClick={load}
            className="font-semibold underline-offset-2 hover:underline shrink-0"
            style={{ color: WAIZ.accent700 }}
          >
            Retry
          </button>
        </div>
      )}

      {!loading && !error && data && (
        <div className="space-y-5" key={`${range}-${refreshKey}`} style={{ animation: "fadeIn 200ms ease" }}>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <SummaryCard label="Proposals" value={data.summary.proposals} />
            <SummaryCard label="Submitted" value={data.summary.submitted} />
            <SummaryCard label="Funded" value={data.summary.funded} />
            <SummaryCard label="Disqualified" value={data.summary.disqualified} />
          </div>

          {data.rows.length === 0 ? (
            <p className="text-center py-10 text-sm" style={{ color: WAIZ.muted }}>
              No activity in this range.
            </p>
          ) : (
            <div className="overflow-x-auto -mx-1 px-1">
              <table className="w-full min-w-[560px] text-sm border-collapse">
                <thead>
                  <tr style={{ background: WAIZ.soft }}>
                    {["Lead", "Stage", "Size", "Type", "Date"].map(col => (
                      <th
                        key={col}
                        className="text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wide"
                        style={{ color: WAIZ.muted }}
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row, idx) => {
                    const badge = STAGE_BADGE[row.stage];
                    return (
                      <tr
                        key={`${row.id}-${row.stage}`}
                        style={{ background: idx % 2 === 1 ? WAIZ.soft : WAIZ.white }}
                      >
                        <td className="px-3 py-2.5">
                          <p className="font-semibold" style={{ color: WAIZ.ink }}>
                            {row.lead_name}
                          </p>
                          {row.lead_phone && (
                            <p className="text-xs mt-0.5" style={{ color: WAIZ.muted }}>
                              {row.lead_phone}
                            </p>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          <span
                            className="inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold"
                            style={{ background: badge.bg, color: badge.color }}
                          >
                            {STAGE_LABELS[row.stage]}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 tabular-nums" style={{ color: WAIZ.ink }}>
                          {row.loan_size != null && row.loan_size > 0
                            ? formatMoney(row.loan_size)
                            : "—"}
                        </td>
                        <td className="px-3 py-2.5" style={{ color: WAIZ.muted }}>
                          {row.transaction_label?.trim() || "—"}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap" style={{ color: WAIZ.muted }}>
                          {formatDate(row.occurred_on)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

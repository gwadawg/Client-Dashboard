"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FONT_BODY,
  FONT_DISPLAY,
  SHADOW,
  SHADOW_SM,
  WAIZ,
} from "@/components/onboarding/brand";
import { formatMoney } from "@/lib/loan-log-lead-context";
import {
  filterActivityRows,
  type ActivityRange,
  type ActivityRow,
  type ActivityStage,
  type ActivityStageFilter,
} from "@/lib/client-log-activity";

type Props = {
  token: string;
  refreshKey?: number;
};

type ActivityPayload = {
  range: { start: string | null; end: string };
  summary: {
    proposals: number;
    submitted: number;
    fell_out: number;
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

const STAGE_FILTERS: { value: ActivityStageFilter; label: string }[] = [
  { value: "all", label: "All stages" },
  { value: "proposal", label: "Proposal" },
  { value: "submitted", label: "Submitted" },
  { value: "fell_out", label: "Fell out" },
  { value: "funded", label: "Funded" },
  { value: "disqualified", label: "Disqualified" },
];

const STAGE_LABELS: Record<ActivityStage, string> = {
  proposal: "Proposal",
  submitted: "Submitted",
  fell_out: "Fell out",
  funded: "Funded",
  disqualified: "Disqualified",
};

const STAGE_BADGE: Record<ActivityStage, { bg: string; color: string }> = {
  proposal: { bg: WAIZ.tint2, color: WAIZ.royal },
  submitted: { bg: "#FFF7ED", color: "#C2410C" },
  fell_out: { bg: "#F4F4F5", color: "#52525B" },
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
      <div className="px-3 py-3 text-center">
        <p
          className="text-2xl sm:text-[28px] leading-none font-semibold tabular-nums"
          style={{ fontFamily: FONT_DISPLAY, color: WAIZ.navy }}
        >
          {value}
        </p>
        <p
          className="mt-1.5 text-[10px] sm:text-xs uppercase tracking-wide"
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
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {[0, 1, 2, 3, 4].map(i => (
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

function ActivityDetailPanel({
  row,
  token,
  onClose,
  onUpdated,
}: {
  row: ActivityRow;
  token: string;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const [fellOut, setFellOut] = useState(row.stage === "fell_out");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setFellOut(row.stage === "fell_out");
    setError(null);
  }, [row]);

  async function save(nextFellOut: boolean) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/forms/loans/${encodeURIComponent(token)}/deals/${encodeURIComponent(row.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fell_out: nextFellOut }),
        },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof json.error === "string" ? json.error : "Couldn't save.");
        return;
      }
      setFellOut(nextFellOut);
      onUpdated();
    } catch {
      setError("Couldn't save.");
    } finally {
      setSaving(false);
    }
  }

  const displayStage: ActivityStage =
    row.editable && fellOut ? "fell_out" : row.stage === "fell_out" && !fellOut ? "submitted" : row.stage;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4"
      style={{ background: "rgba(11,18,32,.45)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl p-6 space-y-5 max-h-[90vh] overflow-y-auto"
        style={{ background: WAIZ.white, boxShadow: SHADOW, fontFamily: FONT_BODY }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold" style={{ fontFamily: FONT_DISPLAY, color: WAIZ.navy }}>
              {row.lead_name}
            </h2>
            {row.lead_phone && (
              <p className="text-sm mt-1" style={{ color: WAIZ.muted }}>
                {row.lead_phone}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-sm font-semibold shrink-0"
            style={{ color: WAIZ.muted }}
          >
            Close
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs uppercase tracking-wide" style={{ color: WAIZ.muted }}>
              Stage
            </p>
            <span
              className="inline-block mt-1 rounded-full px-2.5 py-0.5 text-xs font-semibold"
              style={{
                background: STAGE_BADGE[displayStage].bg,
                color: STAGE_BADGE[displayStage].color,
              }}
            >
              {STAGE_LABELS[displayStage]}
            </span>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide" style={{ color: WAIZ.muted }}>
              Size
            </p>
            <p className="mt-1 font-semibold tabular-nums" style={{ color: WAIZ.ink }}>
              {row.loan_size != null && row.loan_size > 0 ? formatMoney(row.loan_size) : "—"}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide" style={{ color: WAIZ.muted }}>
              Type
            </p>
            <p className="mt-1" style={{ color: WAIZ.ink }}>
              {row.transaction_label?.trim() || "—"}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide" style={{ color: WAIZ.muted }}>
              Date
            </p>
            <p className="mt-1" style={{ color: WAIZ.ink }}>
              {formatDate(row.occurred_on)}
            </p>
          </div>
          {row.submitted_on && (
            <div className="col-span-2">
              <p className="text-xs uppercase tracking-wide" style={{ color: WAIZ.muted }}>
                Submitted
              </p>
              <p className="mt-1" style={{ color: WAIZ.ink }}>
                {formatDate(row.submitted_on)}
              </p>
            </div>
          )}
          {row.dq_reason && (
            <div className="col-span-2">
              <p className="text-xs uppercase tracking-wide" style={{ color: WAIZ.muted }}>
                DQ reason
              </p>
              <p className="mt-1" style={{ color: WAIZ.ink }}>
                {row.dq_reason}
              </p>
            </div>
          )}
        </div>

        {row.editable && (
          <div
            className="rounded-xl p-4 space-y-3"
            style={{ background: WAIZ.soft, border: `1px solid ${WAIZ.line}` }}
          >
            <p className="text-sm font-medium" style={{ color: WAIZ.ink }}>
              Update status
            </p>
            <p className="text-xs" style={{ color: WAIZ.muted }}>
              Mark loans that were submitted but fell out of processing. They still count toward your
              submission total.
            </p>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                className="mt-1"
                checked={fellOut}
                disabled={saving}
                onChange={e => void save(e.target.checked)}
              />
              <span className="text-sm" style={{ color: WAIZ.ink }}>
                This loan fell out
              </span>
            </label>
          </div>
        )}

        {!row.editable && row.record_type === "deal" && (
          <p className="text-sm" style={{ color: WAIZ.muted }}>
            Funded loans can’t be edited here. Log a new entry if something changed.
          </p>
        )}

        {error && (
          <p className="text-sm" style={{ color: "#B42318" }}>
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

export default function ClientLogActivity({ token, refreshKey = 0 }: Props) {
  const [range, setRange] = useState<ActivityRange>("30d");
  const [stageFilter, setStageFilter] = useState<ActivityStageFilter>("all");
  const [search, setSearch] = useState("");
  const [data, setData] = useState<ActivityPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selectedRow, setSelectedRow] = useState<ActivityRow | null>(null);

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

  const filteredRows = useMemo(
    () => (data ? filterActivityRows(data.rows, stageFilter, search) : []),
    [data, stageFilter, search],
  );

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
        <div className="space-y-5" key={`${range}-${refreshKey}`}>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <SummaryCard label="Proposals" value={data.summary.proposals} />
            <SummaryCard label="Submitted" value={data.summary.submitted} />
            <SummaryCard label="Fell out" value={data.summary.fell_out} />
            <SummaryCard label="Funded" value={data.summary.funded} />
            <SummaryCard label="Disqualified" value={data.summary.disqualified} />
          </div>

          <div className="space-y-3">
            <input
              type="search"
              placeholder="Search by name or phone…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full rounded-xl px-3 py-2.5 text-sm"
              style={{
                border: `1px solid ${WAIZ.line}`,
                background: WAIZ.white,
                color: WAIZ.ink,
              }}
            />
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
              {STAGE_FILTERS.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setStageFilter(value)}
                  className="rounded-xl py-2 px-3 text-xs font-semibold whitespace-nowrap shrink-0"
                  style={rangeChipStyle(stageFilter === value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {filteredRows.length === 0 ? (
            <p className="text-center py-10 text-sm" style={{ color: WAIZ.muted }}>
              {data.rows.length === 0
                ? "No activity in this range."
                : "No entries match your filters."}
            </p>
          ) : (
            <div className="overflow-x-auto -mx-1 px-1">
              <table className="w-full min-w-[600px] text-sm border-collapse">
                <thead>
                  <tr style={{ background: WAIZ.soft }}>
                    {["Lead", "Stage", "Size", "Type", "Date", ""].map(col => (
                      <th
                        key={col || "action"}
                        className="text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wide"
                        style={{ color: WAIZ.muted }}
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row, idx) => {
                    const badge = STAGE_BADGE[row.stage];
                    return (
                      <tr
                        key={`${row.id}-${row.stage}`}
                        className="group"
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
                        <td className="px-3 py-2.5">
                          <button
                            type="button"
                            onClick={() => setSelectedRow(row)}
                            className="text-xs font-semibold whitespace-nowrap"
                            style={{ color: WAIZ.accent700 }}
                          >
                            {row.editable ? "Edit" : "View"}
                          </button>
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

      {selectedRow && (
        <ActivityDetailPanel
          row={selectedRow}
          token={token}
          onClose={() => setSelectedRow(null)}
          onUpdated={() => {
            load();
            setSelectedRow(null);
          }}
        />
      )}
    </div>
  );
}

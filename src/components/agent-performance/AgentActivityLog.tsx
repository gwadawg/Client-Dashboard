"use client";

import { useEffect, useState } from "react";

type AppointmentStatus = "pending" | "show" | "no_show" | "appointment_cancelled" | "lo_bailed";

type AppointmentRow = {
  id: string;
  occurred_at: string | null;
  scheduled_at: string | null;
  external_id: string | null;
  calendar_name: string | null;
  lead_name: string | null;
  lead_phone: string | null;
  lead_email: string | null;
  client_name: string | null;
  status: AppointmentStatus;
};

type TransferRow = {
  id: string;
  occurred_at: string | null;
  lead_name: string | null;
  lead_phone: string | null;
  lead_email: string | null;
  client_name: string | null;
};

type ActivityTab = "appointments" | "live_transfers";

type Props = {
  agentName: string;
  startDate: string;
  endDate: string;
};

const STATUS_LABELS: Record<AppointmentStatus, string> = {
  pending: "Pending",
  show: "Show",
  no_show: "No Show",
  appointment_cancelled: "Cancelled",
  lo_bailed: "LO Bailed",
};

const STATUS_STYLES: Record<AppointmentStatus, { bg: string; color: string }> = {
  pending: { bg: "rgba(245,158,11,0.14)", color: "#fbbf24" },
  show: { bg: "rgba(34,197,94,0.14)", color: "#4ade80" },
  no_show: { bg: "rgba(239,68,68,0.14)", color: "#f87171" },
  appointment_cancelled: { bg: "rgba(148,163,184,0.14)", color: "#cbd5e1" },
  lo_bailed: { bg: "rgba(168,85,247,0.14)", color: "#c084fc" },
};

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AgentActivityLog({ agentName, startDate, endDate }: Props) {
  const [tab, setTab] = useState<ActivityTab>("appointments");
  const [rows, setRows] = useState<(AppointmentRow | TransferRow)[]>([]);
  const [summary, setSummary] = useState<Record<string, number>>({});
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPage(1);
  }, [tab, agentName, startDate, endDate]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({
      agent_name: agentName,
      tab,
      page: String(page),
      limit: "50",
    });
    if (startDate) params.set("startDate", startDate);
    if (endDate) params.set("endDate", endDate);

    fetch(`/api/agent-stats/activity?${params}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) {
          setError(d.error);
          setRows([]);
          setTotal(0);
        } else {
          setRows(d.rows ?? []);
          setSummary(d.summary ?? {});
          setTotal(d.total ?? 0);
        }
        setLoading(false);
      })
      .catch(() => {
        setError("Failed to load activity");
        setLoading(false);
      });
  }, [agentName, startDate, endDate, tab, page]);

  const totalPages = Math.max(1, Math.ceil(total / 50));

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "#334155" }}>
          Activity Log
        </p>
        <div className="flex gap-1">
          {(
            [
              { key: "appointments" as const, label: "Appointments" },
              { key: "live_transfers" as const, label: "Live Transfers" },
            ] as const
          ).map(t => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className="text-xs px-3 py-1.5 rounded-lg transition-colors"
              style={{
                background: tab === t.key ? "rgba(245,158,11,0.15)" : "rgba(255,255,255,0.04)",
                color: tab === t.key ? "#f59e0b" : "#64748b",
                border: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "appointments" && !loading && !error && (
        <div className="space-y-2 mb-3">
          <div className="flex flex-wrap gap-3 text-xs tabular-nums">
          <span style={{ color: "#94a3b8" }}>
            <span className="font-semibold" style={{ color: "#e2e8f0" }}>
              {summary.appointments ?? 0}
            </span>{" "}
            booked
          </span>
          <span style={{ color: "#4ade80" }}>
            <span className="font-semibold">{summary.shows ?? 0}</span> showed
          </span>
          <span style={{ color: "#f87171" }}>
            <span className="font-semibold">{summary.no_shows ?? 0}</span> no-show
          </span>
          <span style={{ color: "#fbbf24" }}>
            <span className="font-semibold">{summary.pending ?? 0}</span> pending
          </span>
          </div>
          <p className="text-[11px]" style={{ color: "#475569" }}>
            Counts match the scorecard KPIs — each row is an appointment booked in this period with its linked show/no-show outcome.
          </p>
        </div>
      )}

      {tab === "live_transfers" && !loading && !error && (
        <p className="text-xs mb-3 tabular-nums" style={{ color: "#94a3b8" }}>
          <span className="font-semibold" style={{ color: "#a78bfa" }}>
            {summary.live_transfers ?? total}
          </span>{" "}
          live transfers in this period
        </p>
      )}

      {error && (
        <p className="text-sm py-4 text-center" style={{ color: "#f87171" }}>
          {error}
        </p>
      )}

      <div
        className="rounded-lg overflow-hidden"
        style={{ border: "1px solid rgba(255,255,255,0.06)", background: "rgba(0,0,0,0.15)" }}
      >
        <div className="overflow-x-auto max-h-80 overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0" style={{ background: "#050c18" }}>
              <tr>
                {tab === "appointments" ? (
                  <>
                    <th className="px-3 py-2 text-left font-semibold uppercase tracking-wider whitespace-nowrap" style={{ color: "#475569" }}>Booked</th>
                    <th className="px-3 py-2 text-left font-semibold uppercase tracking-wider whitespace-nowrap" style={{ color: "#475569" }}>Scheduled</th>
                    <th className="px-3 py-2 text-left font-semibold uppercase tracking-wider whitespace-nowrap" style={{ color: "#475569" }}>Client</th>
                    <th className="px-3 py-2 text-left font-semibold uppercase tracking-wider whitespace-nowrap" style={{ color: "#475569" }}>Lead</th>
                    <th className="px-3 py-2 text-left font-semibold uppercase tracking-wider whitespace-nowrap" style={{ color: "#475569" }}>Phone</th>
                    <th className="px-3 py-2 text-left font-semibold uppercase tracking-wider whitespace-nowrap" style={{ color: "#475569" }}>Status</th>
                  </>
                ) : (
                  <>
                    <th className="px-3 py-2 text-left font-semibold uppercase tracking-wider whitespace-nowrap" style={{ color: "#475569" }}>Date</th>
                    <th className="px-3 py-2 text-left font-semibold uppercase tracking-wider whitespace-nowrap" style={{ color: "#475569" }}>Client</th>
                    <th className="px-3 py-2 text-left font-semibold uppercase tracking-wider whitespace-nowrap" style={{ color: "#475569" }}>Lead</th>
                    <th className="px-3 py-2 text-left font-semibold uppercase tracking-wider whitespace-nowrap" style={{ color: "#475569" }}>Phone</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center" style={{ color: "#1e3a5f" }}>
                    Loading…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center" style={{ color: "#475569" }}>
                    No {tab === "appointments" ? "appointments" : "live transfers"} in this period
                  </td>
                </tr>
              ) : tab === "appointments" ? (
                (rows as AppointmentRow[]).map((row, i) => {
                  const style = STATUS_STYLES[row.status];
                  return (
                    <tr
                      key={row.id}
                      style={{
                        borderTop: "1px solid rgba(255,255,255,0.03)",
                        background: i % 2 === 0 ? "rgba(255,255,255,0.015)" : "transparent",
                      }}
                    >
                      <td className="px-3 py-2 whitespace-nowrap" style={{ color: "#94a3b8" }}>
                        {formatDateTime(row.occurred_at)}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap" style={{ color: "#64748b" }}>
                        {formatDateTime(row.scheduled_at)}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap" style={{ color: "#94a3b8" }}>
                        {row.client_name ?? "—"}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap" style={{ color: "#e2e8f0" }}>
                        {row.lead_name ?? "—"}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap tabular-nums" style={{ color: "#64748b" }}>
                        {row.lead_phone ?? "—"}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span
                          className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide"
                          style={{ background: style.bg, color: style.color }}
                        >
                          {STATUS_LABELS[row.status]}
                        </span>
                      </td>
                    </tr>
                  );
                })
              ) : (
                (rows as TransferRow[]).map((row, i) => (
                  <tr
                    key={row.id}
                    style={{
                      borderTop: "1px solid rgba(255,255,255,0.03)",
                      background: i % 2 === 0 ? "rgba(255,255,255,0.015)" : "transparent",
                    }}
                  >
                    <td className="px-3 py-2 whitespace-nowrap" style={{ color: "#94a3b8" }}>
                      {formatDateTime(row.occurred_at)}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap" style={{ color: "#94a3b8" }}>
                      {row.client_name ?? "—"}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap" style={{ color: "#e2e8f0" }}>
                      {row.lead_name ?? "—"}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap tabular-nums" style={{ color: "#64748b" }}>
                      {row.lead_phone ?? "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-3 text-xs" style={{ color: "#64748b" }}>
          <span>
            Page {page} of {totalPages} · {total.toLocaleString()} rows
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage(p => p - 1)}
              className="px-2 py-1 rounded disabled:opacity-40"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}
            >
              Prev
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage(p => p + 1)}
              className="px-2 py-1 rounded disabled:opacity-40"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

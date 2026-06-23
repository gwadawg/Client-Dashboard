"use client";

import { useCallback, useEffect, useState } from "react";
import CloseEditorDrawer from "./acquisition/CloseEditorDrawer";
import {
  CLOSE_FIELD_LABELS,
  type CloseCompleteness,
  type CloseFilterMode,
} from "@/lib/acquisition-close-completeness";

type Props = {
  type: "leads" | "appointments" | "offers" | "closes" | "ads" | "dials";
  startDate: string;
  endDate: string;
};

const COLUMNS: Record<Exclude<Props["type"], "closes">, { key: string; label: string }[]> = {
  leads: [
    { key: "created_at", label: "Created" },
    { key: "lead_name", label: "Name" },
    { key: "email", label: "Email" },
    { key: "phone", label: "Phone" },
    { key: "source", label: "Source" },
    { key: "offer_interest", label: "Offer" },
    { key: "ghl_contact_id", label: "GHL ID" },
  ],
  appointments: [
    { key: "booked_at", label: "Booked" },
    { key: "scheduled_at", label: "Scheduled" },
    { key: "appointment_type", label: "Type" },
    { key: "status", label: "Status" },
    { key: "setter_name", label: "Setter" },
    { key: "call_taken_by", label: "Taken By" },
    { key: "lead_name", label: "Lead" },
    { key: "qualified", label: "Qualified" },
    { key: "closer_form", label: "Closer form" },
  ],
  offers: [
    { key: "offered_at", label: "Date" },
    { key: "lead_name", label: "Lead" },
    { key: "offer_type", label: "Offer" },
    { key: "is_closed", label: "Closed" },
    { key: "cash_collected", label: "Cash" },
    { key: "setter_name", label: "Setter" },
    { key: "offered_by", label: "Closer" },
    { key: "lead_email", label: "Email" },
  ],
  ads: [
    { key: "insight_date", label: "Date" },
    { key: "adset_name", label: "Ad Set" },
    { key: "ad_name", label: "Ad" },
    { key: "spend", label: "Spend" },
    { key: "impressions", label: "Impressions" },
    { key: "clicks", label: "Clicks" },
  ],
  dials: [
    { key: "occurred_at", label: "When" },
    { key: "agent_name", label: "Agent" },
    { key: "phone", label: "Phone" },
    { key: "duration_seconds", label: "Duration" },
    { key: "outcome", label: "Outcome" },
    { key: "recording_url", label: "Recording" },
    { key: "report_status", label: "Report" },
  ],
};

const CLOSE_COLUMNS = [
  { key: "closed_at", label: "Closed" },
  { key: "lead_name", label: "Lead" },
  { key: "offer_type", label: "Offer" },
  { key: "setter_name", label: "Setter" },
  { key: "offered_by", label: "Closer" },
  { key: "client_name", label: "Client" },
  { key: "cash_collected", label: "Cash" },
  { key: "completeness", label: "Data" },
  { key: "actions", label: "Actions" },
];

const CLOSE_FILTERS: { key: CloseFilterMode; label: string }[] = [
  { key: "all", label: "All" },
  { key: "incomplete", label: "Incomplete" },
  { key: "pending_client", label: "Awaiting client" },
  { key: "missing_cash", label: "Missing cash" },
  { key: "excluded", label: "Excluded" },
];

function fmt(key: string, v: unknown): string {
  if (v == null) return "—";
  if (key === "report_status") {
    if (v === "documented") return "Documented";
    if (v === "missing") return "Missing";
    return String(v);
  }
  if (key === "is_closed") return v ? "Y" : "N";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "number" && (key.includes("spent") || key.includes("cash") || key.includes("collected"))) {
    return `$${v.toLocaleString()}`;
  }
  if (typeof v === "string" && v.includes("T")) return v.slice(0, 16).replace("T", " ");
  return String(v);
}

function CloseStatusBadge({ status }: { status: string }) {
  if (status === "pending_client") {
    return (
      <span
        className="inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide"
        style={{ background: "rgba(245, 158, 11, 0.15)", color: "#fbbf24" }}
      >
        Awaiting client
      </span>
    );
  }
  if (status === "dismissed") {
    return (
      <span
        className="inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide"
        style={{ background: "rgba(100, 116, 139, 0.2)", color: "#94a3b8" }}
      >
        Excluded
      </span>
    );
  }
  return null;
}

function CompletenessCell({ completeness, mappingStatus }: { completeness?: CloseCompleteness; mappingStatus?: string }) {
  if (mappingStatus === "dismissed") {
    return <span className="text-xs text-slate-500">Excluded</span>;
  }
  if (!completeness || completeness.status === "complete") {
    return <span className="text-xs font-medium" style={{ color: "#22c55e" }}>Complete</span>;
  }
  const color = completeness.status === "critical" ? "#f87171" : "#fbbf24";
  const label = completeness.status === "critical" ? "Critical" : "Review";
  const topMissing = completeness.missing_fields[0];
  return (
    <div>
      <span className="text-xs font-medium" style={{ color }}>{label}</span>
      {topMissing && (
        <p className="text-[10px] mt-0.5" style={{ color: "#64748b" }}>
          {CLOSE_FIELD_LABELS[topMissing] ?? topMissing}
          {completeness.missing_count > 1 ? ` +${completeness.missing_count - 1}` : ""}
        </p>
      )}
    </div>
  );
}

function CloserFormCell({ row }: { row: Record<string, unknown> }) {
  if (row.status !== "showed") {
    return <span style={{ color: "#334155" }}>—</span>;
  }
  if (row.closer_form_done === true) {
    return <span className="text-xs font-medium" style={{ color: "#22c55e" }}>Done</span>;
  }
  const url = row.closer_form_url;
  if (typeof url === "string" && url) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs font-semibold whitespace-nowrap"
        style={{ color: "#38bdf8" }}
      >
        Fill out form
      </a>
    );
  }
  return <span className="text-xs" style={{ color: "#f87171" }}>No GHL contact</span>;
}

export default function AcquisitionRawTable({ type, startDate, endDate }: Props) {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [total, setTotal] = useState(0);
  const [incompleteCount, setIncompleteCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [closeFilter, setCloseFilter] = useState<CloseFilterMode>("all");
  const [editingCloseId, setEditingCloseId] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);

  async function postCloseAction(closeId: string, action: "dismiss" | "restore") {
    const label = action === "dismiss" ? "Remove this close from acquisition reporting?" : "Restore this close to reporting?";
    if (!confirm(label)) return;
    setActionId(closeId);
    try {
      const res = await fetch("/api/acquisition/pending-closes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, close_id: closeId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Action failed");
      load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Action failed");
    } finally {
      setActionId(null);
    }
  }

  const load = useCallback(() => {
    setLoading(true);
    const q = new URLSearchParams({ type, from: startDate, to: endDate, limit: "1000" });
    if (type === "closes" && closeFilter !== "all") {
      q.set("filter", closeFilter);
    }
    fetch(`/api/acquisition/raw?${q}`)
      .then(r => r.json())
      .then(d => {
        setRows(d.rows ?? []);
        setTotal(d.total ?? 0);
        if (type === "closes") setIncompleteCount(d.incomplete_count ?? 0);
      })
      .finally(() => setLoading(false));
  }, [type, startDate, endDate, closeFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const cols = type === "closes" ? CLOSE_COLUMNS : COLUMNS[type];

  return (
    <>
      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="px-4 py-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between" style={{ background: "#0a1424" }}>
          <div>
            <p className="text-sm font-medium" style={{ color: "#94a3b8" }}>
              {total.toLocaleString()} rows {total > rows.length ? `(showing ${rows.length})` : ""}
            </p>
            {type === "closes" && incompleteCount > 0 && (
              <p className="text-xs mt-0.5" style={{ color: "#fbbf24" }}>
                {incompleteCount} close{incompleteCount === 1 ? "" : "s"} need attention in this date range
              </p>
            )}
          </div>
          {type === "closes" && (
            <div className="flex flex-wrap gap-1.5">
              {CLOSE_FILTERS.map(f => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setCloseFilter(f.key)}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-medium"
                  style={
                    closeFilter === f.key
                      ? { background: "rgba(56,189,248,0.15)", color: "#38bdf8", border: "1px solid rgba(56,189,248,0.3)" }
                      : { background: "transparent", color: "#64748b", border: "1px solid rgba(255,255,255,0.08)" }
                  }
                >
                  {f.label}
                </button>
              ))}
            </div>
          )}
        </div>
        {loading ? (
          <p className="p-8 text-center text-sm" style={{ color: "#64748b" }}>Loading…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: "#070f1d" }}>
                  {cols.map(c => (
                    <th key={c.key} className="text-left px-3 py-2 font-medium whitespace-nowrap" style={{ color: "#64748b" }}>
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(row => {
                  const rowKey = String(row.id ?? row.closed_at);
                  if (type === "closes") {
                    const closeId = String(row.id);
                    const mappingStatus = String(row.mapping_status ?? "mapped");
                    const isExcluded = mappingStatus === "dismissed";
                    const busy = actionId === closeId;
                    return (
                      <tr
                        key={rowKey}
                        style={{
                          borderTop: "1px solid rgba(255,255,255,0.04)",
                          opacity: isExcluded ? 0.55 : 1,
                        }}
                      >
                        {CLOSE_COLUMNS.slice(0, 7).map(c => (
                          <td key={c.key} className="px-3 py-2 whitespace-nowrap tabular-nums" style={{ color: "#cbd5e1" }}>
                            {c.key === "client_name" ? (
                              <div>
                                {fmt(c.key, row[c.key])}
                                <CloseStatusBadge status={mappingStatus} />
                              </div>
                            ) : (
                              fmt(c.key, row[c.key])
                            )}
                          </td>
                        ))}
                        <td className="px-3 py-2 whitespace-nowrap">
                          <CompletenessCell
                            completeness={row.completeness as CloseCompleteness | undefined}
                            mappingStatus={mappingStatus}
                          />
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setEditingCloseId(closeId)}
                              className="px-2.5 py-1 rounded text-[11px] font-medium"
                              style={{ background: "rgba(56,189,248,0.12)", color: "#38bdf8" }}
                            >
                              Edit
                            </button>
                            {isExcluded ? (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => postCloseAction(closeId, "restore")}
                                className="px-2.5 py-1 rounded text-[11px] font-medium disabled:opacity-50"
                                style={{ color: "#94a3b8" }}
                              >
                                {busy ? "…" : "Restore"}
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => postCloseAction(closeId, "dismiss")}
                                className="px-2.5 py-1 rounded text-[11px] font-medium disabled:opacity-50"
                                style={{ color: "#f87171" }}
                              >
                                {busy ? "…" : "Remove"}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  }

                  return (
                    <tr key={rowKey} style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                      {cols.map(c => (
                        <td key={c.key} className="px-3 py-2 whitespace-nowrap tabular-nums" style={{ color: "#cbd5e1" }}>
                          {c.key === "closer_form" ? (
                            <CloserFormCell row={row} />
                          ) : c.key === "report_status" ? (
                            <span
                              className="text-xs font-medium"
                              style={{ color: row.report_status === "documented" ? "#22c55e" : "#f87171" }}
                            >
                              {fmt(c.key, row[c.key])}
                              {row.report_form_type ? (
                                <span className="text-slate-500 font-normal ml-1">
                                  ({String(row.report_form_type).replace(/_/g, " ")})
                                </span>
                              ) : null}
                            </span>
                          ) : c.key === "recording_url" && row[c.key] ? (
                            <a
                              href={String(row[c.key])}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs font-semibold"
                              style={{ color: "#f59e0b" }}
                            >
                              Listen
                            </a>
                          ) : (
                            fmt(c.key, row[c.key])
                          )}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <CloseEditorDrawer
        closeId={editingCloseId}
        onClose={() => setEditingCloseId(null)}
        onSaved={() => {
          load();
        }}
      />
    </>
  );
}

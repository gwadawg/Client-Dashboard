"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ACQUISITION_STATUS_OPTIONS,
  ACQUISITION_STATUS_STYLES,
  acquisitionAppointmentNeedsDisposition,
  acquisitionCallIsDocumented,
  acquisitionLeadFileUrl,
  appointmentRep,
  type AcquisitionAppointmentStatus,
  type EnrichedAcquisitionAppointment,
} from "@/lib/acquisition-appointment-enriched";
import {
  ACQUISITION_LEAD_SOURCES,
  acquisitionLeadSourceLabel,
  type AcquisitionLeadSource,
} from "@/lib/acquisition-lead-source";

type Props = {
  startDate: string;
  endDate: string;
};

const TYPE_FILTERS = ["all", "intro", "demo", "followup", "bamfam", "organic", "other"] as const;

type SourceFilter = "all" | "__unset__" | AcquisitionLeadSource | "missing_lead";

const SOURCE_FILTERS: { value: SourceFilter; label: string }[] = [
  { value: "all", label: "All sources" },
  { value: "__unset__", label: "Unset source" },
  { value: "missing_lead", label: "No lead linked" },
  ...ACQUISITION_LEAD_SOURCES,
];

function formatWhen(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function normalizeStatus(value: string): AcquisitionAppointmentStatus {
  const match = ACQUISITION_STATUS_OPTIONS.find(o => o.value === value);
  return match?.value ?? "pending";
}

function LinkChip({
  href,
  label,
  color,
  external,
}: {
  href: string;
  label: string;
  color: string;
  external?: boolean;
}) {
  const className =
    "inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors whitespace-nowrap";
  const style = {
    background: "#0f2040",
    border: "1px solid rgba(255,255,255,0.12)",
    color,
  };

  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={className} style={style}>
        {label} ↗
      </a>
    );
  }

  return (
    <Link href={href} className={className} style={style}>
      {label} →
    </Link>
  );
}

export default function AcquisitionAppointmentsTable({ startDate, endDate }: Props) {
  const searchParams = useSearchParams();
  const highlightedAppointmentId = searchParams.get("appointment_id");
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});
  const [rows, setRows] = useState<EnrichedAcquisitionAppointment[]>([]);
  const [total, setTotal] = useState(0);
  const [pendingDispositionCount, setPendingDispositionCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<(typeof TYPE_FILTERS)[number]>("all");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [pendingOnly, setPendingOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savingSourceId, setSavingSourceId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setLoading(true);
    const q = new URLSearchParams({ from: startDate, to: endDate, limit: "200" });
    if (typeFilter !== "all") q.set("appointment_type", typeFilter);
    if (pendingOnly) q.set("queue_action", "needs_disposition");
    if (debouncedSearch) q.set("search", debouncedSearch);
    if (highlightedAppointmentId) q.set("appointment_id", highlightedAppointmentId);
    if (sourceFilter === "missing_lead") q.set("missing_lead", "true");
    else if (sourceFilter !== "all") q.set("lead_source", sourceFilter);

    fetch(`/api/acquisition/appointments?${q}`)
      .then(async r => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "Failed to load appointments");
        return d;
      })
      .then(d => {
        setRows(d.rows ?? []);
        setTotal(d.total ?? 0);
        setPendingDispositionCount(d.pending_disposition_count ?? 0);
        setError(null);
      })
      .catch(e => {
        setRows([]);
        setTotal(0);
        setPendingDispositionCount(0);
        setError(e instanceof Error ? e.message : "Failed to load appointments");
      })
      .finally(() => setLoading(false));
  }, [startDate, endDate, typeFilter, sourceFilter, pendingOnly, debouncedSearch, highlightedAppointmentId]);

  useEffect(() => {
    if (!highlightedAppointmentId || loading) return;
    const el = rowRefs.current[highlightedAppointmentId];
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightedAppointmentId, loading, rows]);

  const pendingCount = pendingOnly
    ? total
    : pendingDispositionCount || rows.filter(r => acquisitionAppointmentNeedsDisposition(r)).length;

  async function updateStatus(row: EnrichedAcquisitionAppointment, nextStatus: AcquisitionAppointmentStatus) {
    const current = normalizeStatus(row.status);
    if (nextStatus === current) return;

    setSavingId(row.id);
    setError(null);
    setRows(prev => prev.map(r => (r.id === row.id ? { ...r, status: nextStatus } : r)));

    try {
      const res = await fetch("/api/acquisition/appointments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appointment_id: row.id, status: nextStatus }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to update status");
      }

      if (pendingOnly && nextStatus !== "pending") {
        setRows(prev => prev.filter(r => r.id !== row.id));
        setTotal(t => Math.max(0, t - 1));
      } else {
        setRows(prev =>
          prev.map(r => {
            if (r.id !== row.id) return r;
            const stillNeedsDisposition =
              nextStatus === "pending" &&
              r.scheduled_at != null &&
              new Date(r.scheduled_at).getTime() < Date.now();
            return {
              ...r,
              status: nextStatus,
              queue_action: stillNeedsDisposition ? "needs_disposition" : null,
            };
          }),
        );
      }
    } catch (e) {
      setRows(prev => prev.map(r => (r.id === row.id ? { ...r, status: current } : r)));
      setError(e instanceof Error ? e.message : "Failed to update status");
    } finally {
      setSavingId(null);
    }
  }

  async function updateLeadSource(row: EnrichedAcquisitionAppointment, nextSource: AcquisitionLeadSource) {
    if (!row.lead_id) return;

    setSavingSourceId(row.id);
    setError(null);
    setRows(prev =>
      prev.map(r => (r.id === row.id ? { ...r, lead_source: nextSource } : r)),
    );

    try {
      const res = await fetch("/api/acquisition/leads", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_id: row.lead_id, source: nextSource }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to update lead source");
      }
    } catch (e) {
      setRows(prev =>
        prev.map(r => (r.id === row.id ? { ...r, lead_source: row.lead_source } : r)),
      );
      setError(e instanceof Error ? e.message : "Failed to update lead source");
    } finally {
      setSavingSourceId(null);
    }
  }

  return (
    <div className="space-y-4">
      {highlightedAppointmentId && (
        <div
          className="px-4 py-2.5 rounded-xl text-sm"
          style={{
            background: "rgba(52,211,153,0.1)",
            border: "1px solid rgba(52,211,153,0.35)",
            color: "#6ee7b7",
          }}
        >
          Highlighting appointment linked from a documented sales call.
        </div>
      )}

      {!pendingOnly && pendingCount > 0 && (
        <div
          className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-xl"
          style={{
            background: "linear-gradient(135deg, rgba(245,158,11,0.12) 0%, rgba(15,32,64,0.9) 100%)",
            border: "1px solid rgba(245,158,11,0.35)",
          }}
        >
          <div>
            <p className="text-sm font-semibold" style={{ color: "#fbbf24" }}>
              {pendingCount} appointment{pendingCount === 1 ? "" : "s"} awaiting disposition
            </p>
            <p className="text-xs mt-0.5" style={{ color: "#94a3b8" }}>
              Scheduled time has passed but show / no-show has not been recorded yet.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setPendingOnly(true)}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold"
            style={{
              background: "rgba(245,158,11,0.2)",
              border: "1px solid rgba(245,158,11,0.45)",
              color: "#fbbf24",
            }}
          >
            Review pending →
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {TYPE_FILTERS.map(t => (
          <button
            key={t}
            type="button"
            onClick={() => setTypeFilter(t)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium capitalize"
            style={{
              background: typeFilter === t ? "rgba(56,189,248,0.15)" : "rgba(255,255,255,0.04)",
              color: typeFilter === t ? "#38bdf8" : "#94a3b8",
              border: `1px solid ${typeFilter === t ? "rgba(56,189,248,0.3)" : "transparent"}`,
            }}
          >
            {t === "all" ? "All types" : t}
          </button>
        ))}

        <button
          type="button"
          onClick={() => setPendingOnly(v => !v)}
          className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
          style={{
            background: pendingOnly ? "rgba(245,158,11,0.18)" : "rgba(255,255,255,0.04)",
            border: `1px solid ${pendingOnly ? "rgba(245,158,11,0.55)" : "rgba(255,255,255,0.08)"}`,
            color: pendingOnly ? "#fbbf24" : "#94a3b8",
          }}
        >
          {pendingOnly ? "● Pending disposition" : "Pending disposition"}
        </button>

        {SOURCE_FILTERS.map(s => (
          <button
            key={s.value}
            type="button"
            onClick={() => setSourceFilter(s.value)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap"
            style={{
              background: sourceFilter === s.value ? "rgba(167,139,250,0.15)" : "rgba(255,255,255,0.04)",
              color: sourceFilter === s.value ? "#c4b5fd" : "#94a3b8",
              border: `1px solid ${sourceFilter === s.value ? "rgba(167,139,250,0.35)" : "transparent"}`,
            }}
          >
            {s.label}
          </button>
        ))}

        <input
          type="search"
          placeholder="Search lead, phone, setter…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="ml-auto px-3 py-1.5 rounded-lg text-xs min-w-[200px]"
          style={{ background: "#0f2040", border: "1px solid rgba(255,255,255,0.12)", color: "#e2e8f0" }}
        />

        <span className="text-xs w-full sm:w-auto" style={{ color: "#475569" }}>
          {total.toLocaleString()} appointments
        </span>
      </div>

      {error && (
        <div
          className="px-4 py-2.5 rounded-lg text-sm"
          style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.4)", color: "#f87171" }}
        >
          {error}
        </div>
      )}

      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
        {loading ? (
          <p className="p-8 text-center text-sm text-slate-500">Loading…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: "#050c18" }}>
                  {[
                    "Booked",
                    "Scheduled",
                    "Type",
                    "Lead",
                    "Source",
                    "Setter / Rep",
                    "Status",
                    "Lead file",
                    "Sales call",
                    "Action",
                  ].map(h => (
                    <th
                      key={h}
                      className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider whitespace-nowrap"
                      style={{ color: "#475569", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  const status = normalizeStatus(row.status);
                  const style = ACQUISITION_STATUS_STYLES[status] ?? ACQUISITION_STATUS_STYLES.pending;
                  const needsDisposition = acquisitionAppointmentNeedsDisposition(row);
                  const ghlUrl = acquisitionLeadFileUrl(row);
                  const documented = acquisitionCallIsDocumented(row);
                  const highlighted = row.id === highlightedAppointmentId;

                  return (
                    <tr
                      key={row.id}
                      ref={el => {
                        rowRefs.current[row.id] = el;
                      }}
                      style={{
                        borderTop: "1px solid rgba(255,255,255,0.03)",
                        background: highlighted
                          ? "rgba(52,211,153,0.12)"
                          : needsDisposition
                            ? "rgba(245,158,11,0.07)"
                            : i % 2 === 0
                              ? "rgba(255,255,255,0.015)"
                              : "transparent",
                        boxShadow: highlighted
                          ? "inset 3px 0 0 #34d399"
                          : needsDisposition
                            ? "inset 3px 0 0 #f59e0b"
                            : undefined,
                      }}
                    >
                      <td className="px-4 py-2.5 whitespace-nowrap text-slate-300">{formatWhen(row.booked_at)}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-slate-300">
                        <span style={{ color: needsDisposition ? "#fbbf24" : undefined }}>
                          {formatWhen(row.scheduled_at)}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 capitalize text-slate-400">{row.appointment_type}</td>
                      <td className="px-4 py-2.5 text-slate-200">
                        <div>{row.lead_name ?? "—"}</div>
                        {row.phone && <div className="text-xs text-slate-500">{row.phone}</div>}
                        {!row.lead_id && (
                          <div className="text-[10px] mt-0.5 font-medium uppercase tracking-wide" style={{ color: "#f87171" }}>
                            No lead linked
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        {!row.lead_id ? (
                          <span className="text-xs" style={{ color: "#334155" }}>—</span>
                        ) : row.lead_source ? (
                          <span className="text-xs text-slate-300">{acquisitionLeadSourceLabel(row.lead_source)}</span>
                        ) : (
                          <select
                            value=""
                            disabled={savingSourceId === row.id}
                            onChange={e => updateLeadSource(row, e.target.value as AcquisitionLeadSource)}
                            className="px-2 py-1 rounded-lg text-xs outline-none cursor-pointer disabled:opacity-50"
                            style={{
                              background: "rgba(167,139,250,0.12)",
                              border: "1px solid rgba(167,139,250,0.35)",
                              color: "#c4b5fd",
                            }}
                          >
                            <option value="" disabled style={{ background: "#0f2040", color: "#94a3b8" }}>
                              Set source…
                            </option>
                            {ACQUISITION_LEAD_SOURCES.map(s => (
                              <option key={s.value} value={s.value} style={{ background: "#0f2040", color: "#e2e8f0" }}>
                                {s.label}
                              </option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-slate-400">{appointmentRep(row) ?? "—"}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <select
                          value={status}
                          disabled={savingId === row.id}
                          onChange={e => updateStatus(row, e.target.value as AcquisitionAppointmentStatus)}
                          className="px-2.5 py-1.5 rounded-lg text-xs font-semibold outline-none cursor-pointer disabled:opacity-50"
                          style={{ background: style.bg, border: `1px solid ${style.border}`, color: style.color }}
                        >
                          {ACQUISITION_STATUS_OPTIONS.map(o => (
                            <option key={o.value} value={o.value} style={{ background: "#0f2040", color: "#e2e8f0" }}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        {ghlUrl ? (
                          <LinkChip href={ghlUrl} label="Open in GHL" color="#60a5fa" external />
                        ) : (
                          <span className="text-xs" style={{ color: "#334155" }}>—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        {documented ? (
                          <div className="flex flex-wrap gap-1.5 items-center">
                            <span
                              className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide"
                              style={{
                                background: "rgba(52,211,153,0.15)",
                                border: "1px solid rgba(52,211,153,0.35)",
                                color: "#6ee7b7",
                              }}
                            >
                              Form logged
                            </span>
                            {row.recording_url && (
                              <LinkChip href={row.recording_url} label="Recording" color="#38bdf8" external />
                            )}
                            {row.disposition && (
                              <span className="text-xs text-slate-400 max-w-[140px] truncate" title={row.disposition}>
                                {row.disposition}
                              </span>
                            )}
                          </div>
                        ) : row.recording_url ? (
                          <LinkChip href={row.recording_url} label="Recording" color="#38bdf8" external />
                        ) : (
                          <span className="text-xs" style={{ color: "#334155" }}>Not logged</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        {row.queue_action === "needs_credit" ? (
                          <span className="text-xs font-medium" style={{ color: "#f59e0b" }}>
                            Needs credit
                          </span>
                        ) : needsDisposition ? (
                          <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#fbbf24" }}>
                            Awaiting show
                          </span>
                        ) : row.credit_granted ? (
                          <span className="text-xs" style={{ color: "#34d399" }}>
                            Credited
                          </span>
                        ) : (
                          <span className="text-xs" style={{ color: "#334155" }}>—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {!rows.length && (
                  <tr>
                    <td colSpan={10} className="px-4 py-8 text-center text-slate-500">
                      {pendingOnly ? "No appointments awaiting disposition." : "No appointments in range."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

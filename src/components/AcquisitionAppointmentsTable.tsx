"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import AppointmentLinkDrawer from "@/components/acquisition/AppointmentLinkDrawer";
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

type TypeFilter = "all" | "intro" | "demo" | "followup" | "bamfam" | "organic" | "other";
type SourceFilter = "all" | AcquisitionLeadSource;
type IssueFilter = "all" | "needs_disposition" | "missing_lead" | "needs_credit" | "unset_source";
type StatusFilter = "all" | AcquisitionAppointmentStatus;

const TYPE_OPTIONS: { value: TypeFilter; label: string }[] = [
  { value: "all", label: "All types" },
  { value: "intro", label: "Intro" },
  { value: "demo", label: "Demo" },
  { value: "followup", label: "Followup" },
  { value: "bamfam", label: "Bamfam" },
  { value: "organic", label: "Organic" },
  { value: "other", label: "Other" },
];

const SOURCE_OPTIONS: { value: SourceFilter; label: string }[] = [
  { value: "all", label: "All sources" },
  ...ACQUISITION_LEAD_SOURCES,
];

const ISSUE_OPTIONS: { value: IssueFilter; label: string }[] = [
  { value: "all", label: "All clear" },
  { value: "needs_disposition", label: "Pending disposition" },
  { value: "missing_lead", label: "No lead linked" },
  { value: "needs_credit", label: "Needs credit" },
  { value: "unset_source", label: "Unset source" },
];

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All statuses" },
  ...ACQUISITION_STATUS_OPTIONS,
];

const FILTER_SELECT_STYLE = {
  background: "#0f2040",
  border: "1px solid rgba(255,255,255,0.12)",
  color: "#e2e8f0",
} as const;

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

function FilterSelect<T extends string>({
  label,
  value,
  onChange,
  options,
  activeStyle,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  activeStyle?: { border: string; color: string };
}) {
  const isActive = value !== options[0]?.value;
  const selected = options.find(o => o.value === value);

  return (
    <label className="inline-flex flex-col gap-0.5">
      <span className="text-[10px] font-medium uppercase tracking-wide" style={{ color: "#475569" }}>
        {label}
      </span>
      <select
        value={value}
        onChange={e => onChange(e.target.value as T)}
        className="px-2.5 py-1.5 rounded-lg text-xs font-medium outline-none cursor-pointer min-w-[120px]"
        style={{
          ...FILTER_SELECT_STYLE,
          ...(isActive && activeStyle
            ? { border: `1px solid ${activeStyle.border}`, color: activeStyle.color }
            : {}),
        }}
      >
        {options.map(o => (
          <option key={o.value} value={o.value} style={{ background: "#0f2040", color: "#e2e8f0" }}>
            {o.label}
          </option>
        ))}
      </select>
      {isActive && selected && (
        <span className="text-[10px] truncate max-w-[140px]" style={{ color: activeStyle?.color ?? "#94a3b8" }}>
          {selected.label}
        </span>
      )}
    </label>
  );
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

function ActionBadge({ row, needsDisposition }: { row: EnrichedAcquisitionAppointment; needsDisposition: boolean }) {
  if (row.queue_action === "needs_credit") {
    return (
      <span className="text-[10px] font-medium uppercase tracking-wide" style={{ color: "#f59e0b" }}>
        Needs credit
      </span>
    );
  }
  if (needsDisposition) {
    return (
      <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "#fbbf24" }}>
        Awaiting show
      </span>
    );
  }
  if (row.credit_granted) {
    return (
      <span className="text-[10px]" style={{ color: "#34d399" }}>
        Credited
      </span>
    );
  }
  return null;
}

function appointmentNeedsLink(row: EnrichedAcquisitionAppointment): boolean {
  return !row.lead_id || !row.ghl_contact_id;
}

export default function AcquisitionAppointmentsTable({ startDate, endDate }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const highlightedAppointmentId = searchParams.get("appointment_id");
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});
  const scrolledToHighlightRef = useRef<string | null>(null);
  const [rows, setRows] = useState<EnrichedAcquisitionAppointment[]>([]);
  const [total, setTotal] = useState(0);
  const [pendingDispositionCount, setPendingDispositionCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [issueFilter, setIssueFilter] = useState<IssueFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [linkDrawerRow, setLinkDrawerRow] = useState<EnrichedAcquisitionAppointment | null>(null);
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
    if (statusFilter !== "all") q.set("status", statusFilter);
    if (debouncedSearch) q.set("search", debouncedSearch);
    if (highlightedAppointmentId) q.set("appointment_id", highlightedAppointmentId);

    if (issueFilter === "needs_disposition") q.set("queue_action", "needs_disposition");
    else if (issueFilter === "needs_credit") q.set("queue_action", "needs_credit");
    else if (issueFilter === "missing_lead") q.set("missing_lead", "true");
    else if (issueFilter === "unset_source") q.set("lead_source", "__unset__");
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
  }, [
    startDate,
    endDate,
    typeFilter,
    sourceFilter,
    issueFilter,
    statusFilter,
    debouncedSearch,
    highlightedAppointmentId,
  ]);

  useEffect(() => {
    if (!highlightedAppointmentId || loading) return;
    if (scrolledToHighlightRef.current === highlightedAppointmentId) return;
    const el = rowRefs.current[highlightedAppointmentId];
    if (!el) return;
    scrolledToHighlightRef.current = highlightedAppointmentId;
    el.scrollIntoView({ behavior: "smooth", block: "center" });

    const params = new URLSearchParams(searchParams.toString());
    if (params.get("appointment_id") === highlightedAppointmentId) {
      params.delete("appointment_id");
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }
  }, [highlightedAppointmentId, loading, rows, pathname, router, searchParams]);

  const pendingCount =
    issueFilter === "needs_disposition"
      ? total
      : pendingDispositionCount || rows.filter(r => acquisitionAppointmentNeedsDisposition(r)).length;

  function handleSourceChange(next: SourceFilter) {
    setSourceFilter(next);
    if (next !== "all") setIssueFilter("all");
  }

  function handleIssueChange(next: IssueFilter) {
    setIssueFilter(next);
    if (next === "unset_source" || next === "missing_lead") setSourceFilter("all");
  }

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

      if (issueFilter === "needs_disposition" && nextStatus !== "pending") {
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
    setRows(prev => prev.map(r => (r.id === row.id ? { ...r, lead_source: nextSource } : r)));

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
      setRows(prev => prev.map(r => (r.id === row.id ? { ...r, lead_source: row.lead_source } : r)));
      setError(e instanceof Error ? e.message : "Failed to update lead source");
    } finally {
      setSavingSourceId(null);
    }
  }

  async function handleLinked(patch: Partial<EnrichedAcquisitionAppointment> & { id: string }) {
    try {
      const q = new URLSearchParams({
        from: startDate,
        to: endDate,
        appointment_id: patch.id,
        limit: "1",
      });
      const res = await fetch(`/api/acquisition/appointments?${q}`);
      const data = await res.json();
      const refreshed = (data.rows ?? []).find(
        (r: EnrichedAcquisitionAppointment) => r.id === patch.id,
      );

      if (issueFilter === "missing_lead" && (refreshed?.lead_id ?? patch.lead_id)) {
        setRows(prev => prev.filter(r => r.id !== patch.id));
        setTotal(t => Math.max(0, t - 1));
        return;
      }

      if (refreshed) {
        setRows(prev => prev.map(r => (r.id === patch.id ? refreshed : r)));
      } else {
        setRows(prev => prev.map(r => (r.id === patch.id ? { ...r, ...patch } : r)));
      }
    } catch {
      setRows(prev => prev.map(r => (r.id === patch.id ? { ...r, ...patch } : r)));
    }
  }

  const TABLE_HEADERS = ["", "Booked", "Scheduled", "Type", "Lead", "Source", "Setter / Rep", "Status", "Lead file", "Sales call"];

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

      {issueFilter !== "needs_disposition" && pendingCount > 0 && (
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
            onClick={() => setIssueFilter("needs_disposition")}
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

      <div className="flex flex-wrap items-end gap-3">
        <FilterSelect
          label="Type"
          value={typeFilter}
          onChange={setTypeFilter}
          options={TYPE_OPTIONS}
          activeStyle={{ border: "rgba(56,189,248,0.45)", color: "#38bdf8" }}
        />
        <FilterSelect
          label="Source"
          value={sourceFilter}
          onChange={handleSourceChange}
          options={SOURCE_OPTIONS}
          activeStyle={{ border: "rgba(167,139,250,0.45)", color: "#c4b5fd" }}
        />
        <FilterSelect
          label="Issues"
          value={issueFilter}
          onChange={handleIssueChange}
          options={ISSUE_OPTIONS}
          activeStyle={{ border: "rgba(245,158,11,0.55)", color: "#fbbf24" }}
        />
        <FilterSelect
          label="Status"
          value={statusFilter}
          onChange={setStatusFilter}
          options={STATUS_OPTIONS}
          activeStyle={{ border: "rgba(148,163,184,0.45)", color: "#cbd5e1" }}
        />

        <input
          type="search"
          placeholder="Search lead, phone, setter…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="ml-auto px-3 py-1.5 rounded-lg text-xs min-w-[200px]"
          style={{ background: "#0f2040", border: "1px solid rgba(255,255,255,0.12)", color: "#e2e8f0" }}
        />

        <span className="text-xs pb-1.5" style={{ color: "#475569" }}>
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
                  {TABLE_HEADERS.map(h => (
                    <th
                      key={h || "expand"}
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
                  const expanded = expandedId === row.id;
                  const needsLink = appointmentNeedsLink(row);
                  const hasCallDetail = documented || row.recording_url || row.disposition;

                  return (
                    <Fragment key={row.id}>
                      <tr
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
                        <td className="px-2 py-2.5 w-8">
                          {hasCallDetail && (
                            <button
                              type="button"
                              onClick={() => setExpandedId(expanded ? null : row.id)}
                              className="w-6 h-6 rounded text-xs flex items-center justify-center"
                              style={{ color: "#64748b", background: "rgba(255,255,255,0.04)" }}
                              aria-label={expanded ? "Collapse row" : "Expand sales call details"}
                            >
                              {expanded ? "−" : "+"}
                            </button>
                          )}
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap text-slate-300">{formatWhen(row.booked_at)}</td>
                        <td className="px-4 py-2.5 whitespace-nowrap text-slate-300">
                          <span style={{ color: needsDisposition ? "#fbbf24" : undefined }}>
                            {formatWhen(row.scheduled_at)}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 capitalize text-slate-400">{row.appointment_type}</td>
                        <td className="px-4 py-2.5 text-slate-200">
                          <div className="flex items-start gap-2">
                            <div className="min-w-0">
                              <div>{row.lead_name ?? "—"}</div>
                              {row.phone && <div className="text-xs text-slate-500">{row.phone}</div>}
                              {!row.lead_id && (
                                <div
                                  className="text-[10px] mt-0.5 font-medium uppercase tracking-wide"
                                  style={{ color: "#f87171" }}
                                >
                                  No lead linked
                                </div>
                              )}
                            </div>
                            {needsLink && (
                              <button
                                type="button"
                                onClick={() => setLinkDrawerRow(row)}
                                className="shrink-0 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide"
                                style={{
                                  background: "rgba(239,68,68,0.12)",
                                  border: "1px solid rgba(239,68,68,0.35)",
                                  color: "#f87171",
                                }}
                              >
                                Fix
                              </button>
                            )}
                          </div>
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
                          <div className="flex flex-col gap-1">
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
                            <ActionBadge row={row} needsDisposition={needsDisposition} />
                          </div>
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          {ghlUrl ? (
                            <LinkChip href={ghlUrl} label="Open in GHL" color="#60a5fa" external />
                          ) : needsLink ? (
                            <button
                              type="button"
                              onClick={() => setLinkDrawerRow(row)}
                              className="text-xs font-medium"
                              style={{ color: "#f87171" }}
                            >
                              Link →
                            </button>
                          ) : (
                            <span className="text-xs" style={{ color: "#334155" }}>—</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          {documented ? (
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
                          ) : row.recording_url ? (
                            <span
                              className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium"
                              style={{
                                background: "rgba(56,189,248,0.12)",
                                border: "1px solid rgba(56,189,248,0.3)",
                                color: "#38bdf8",
                              }}
                            >
                              Recording
                            </span>
                          ) : (
                            <span className="text-xs" style={{ color: "#334155" }}>Not logged</span>
                          )}
                        </td>
                      </tr>
                      {expanded && hasCallDetail && (
                        <tr key={`${row.id}-detail`} style={{ background: "rgba(255,255,255,0.02)" }}>
                          <td colSpan={TABLE_HEADERS.length} className="px-4 py-3">
                            <div className="flex flex-wrap gap-3 items-center text-xs" style={{ color: "#94a3b8" }}>
                              {row.recording_url && (
                                <LinkChip href={row.recording_url} label="Open recording" color="#38bdf8" external />
                              )}
                              {row.disposition && (
                                <span>
                                  <span style={{ color: "#64748b" }}>Disposition: </span>
                                  {row.disposition}
                                </span>
                              )}
                              {row.call_handled_by && (
                                <span>
                                  <span style={{ color: "#64748b" }}>Handled by: </span>
                                  {row.call_handled_by}
                                </span>
                              )}
                              {row.call_duration_seconds != null && (
                                <span>
                                  <span style={{ color: "#64748b" }}>Duration: </span>
                                  {Math.round(row.call_duration_seconds / 60)}m
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
                {!rows.length && (
                  <tr>
                    <td colSpan={TABLE_HEADERS.length} className="px-4 py-8 text-center text-slate-500">
                      {issueFilter === "needs_disposition"
                        ? "No appointments awaiting disposition."
                        : "No appointments in range."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AppointmentLinkDrawer
        row={linkDrawerRow}
        onClose={() => setLinkDrawerRow(null)}
        onLinked={handleLinked}
      />
    </div>
  );
}

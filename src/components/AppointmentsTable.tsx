"use client";

import { useEffect, useState } from "react";

type Client = { id: string; name: string };

type Props = {
  clients: Client[];
  startDate: string;
  endDate: string;
};

type AppointmentStatus = "pending" | "show" | "no_show" | "appointment_cancelled" | "lo_bailed";

type AppointmentRow = {
  id: string;
  occurred_at: string | null;
  scheduled_at: string | null;
  external_id: string | null;
  calendar_name: string | null;
  stage_booked: string | null;
  lead_name: string | null;
  lead_phone: string | null;
  lead_email: string | null;
  agent_name: string | null;
  ghl_contact_id: string | null;
  clients: { name: string; ghl_location_id: string | null } | null;
  status: AppointmentStatus;
  outcome_id: string | null;
};

const STATUS_OPTIONS: { value: AppointmentStatus; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "show", label: "Show" },
  { value: "no_show", label: "No Show" },
  { value: "appointment_cancelled", label: "Cancelled" },
  { value: "lo_bailed", label: "LO Bailed" },
];

// Each status gets a distinct colour; pending is amber so un-dispositioned
// appointments visually jump out of the list.
const STATUS_STYLES: Record<AppointmentStatus, { bg: string; border: string; color: string }> = {
  pending:               { bg: "rgba(245,158,11,0.14)",  border: "rgba(245,158,11,0.55)", color: "#fbbf24" },
  show:                  { bg: "rgba(34,197,94,0.14)",   border: "rgba(34,197,94,0.5)",   color: "#4ade80" },
  no_show:               { bg: "rgba(239,68,68,0.14)",   border: "rgba(239,68,68,0.5)",   color: "#f87171" },
  appointment_cancelled: { bg: "rgba(148,163,184,0.14)", border: "rgba(148,163,184,0.4)", color: "#cbd5e1" },
  lo_bailed:             { bg: "rgba(168,85,247,0.14)",  border: "rgba(168,85,247,0.5)",  color: "#c084fc" },
};

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function ghlContactUrl(row: AppointmentRow): string | null {
  const locationId = row.clients?.ghl_location_id;
  const contactId = row.ghl_contact_id;
  if (!locationId || !contactId) return null;
  return `https://app.gohighlevel.com/v2/location/${locationId}/contacts/detail/${contactId}`;
}

export default function AppointmentsTable({ clients: allClients, startDate, endDate }: Props) {
  const [rows, setRows] = useState<AppointmentRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [clientFilter, setClientFilter] = useState("");
  const [pendingOnly, setPendingOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => { setPage(1); }, [clientFilter, pendingOnly, debouncedSearch, startDate, endDate]);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ type: "appointments", page: String(page) });
    if (clientFilter === "__live__") params.set("live_only", "true");
    else if (clientFilter) params.set("client_id", clientFilter);
    if (startDate) params.set("start_date", startDate);
    if (endDate) params.set("end_date", endDate);
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (pendingOnly) params.set("status", "pending");

    fetch(`/api/raw?${params}`)
      .then(r => r.json())
      .then(d => { setRows(d.rows ?? []); setTotal(d.total ?? 0); setLoading(false); })
      .catch(() => setLoading(false));
  }, [clientFilter, pendingOnly, page, startDate, endDate, debouncedSearch]);

  async function updateStatus(row: AppointmentRow, nextStatus: AppointmentStatus) {
    if (nextStatus === row.status) return;
    const previousStatus = row.status;
    setSavingId(row.id);
    setError(null);

    // Optimistic update.
    setRows(prev => prev.map(r => (r.id === row.id ? { ...r, status: nextStatus } : r)));

    try {
      const res = await fetch("/api/raw", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appointment_event_id: row.id, status: nextStatus }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to update status");
      }
      // When filtering to pending only, a freshly-dispositioned row drops out.
      if (pendingOnly && nextStatus !== "pending") {
        setRows(prev => prev.filter(r => r.id !== row.id));
        setTotal(t => Math.max(0, t - 1));
      }
    } catch (e) {
      // Revert on failure.
      setRows(prev => prev.map(r => (r.id === row.id ? { ...r, status: previousStatus } : r)));
      setError(e instanceof Error ? e.message : "Failed to update status");
    } finally {
      setSavingId(null);
    }
  }

  const totalPages = Math.ceil(total / 100);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={clientFilter}
          onChange={e => setClientFilter(e.target.value)}
          className="px-4 py-2 rounded-lg text-sm font-medium outline-none"
          style={{ background: "#0f2040", border: "1px solid rgba(255,255,255,0.12)", color: "#e2e8f0", minWidth: "11rem" }}
        >
          <option value="">All Clients</option>
          <option value="__live__">Live Clients</option>
          {allClients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>

        <div className="relative">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search name, phone or email…"
            className="pl-9 pr-8 py-2 rounded-lg text-sm outline-none"
            style={{ background: "#0f2040", border: "1px solid rgba(255,255,255,0.12)", color: "#e2e8f0", minWidth: "16rem" }}
          />
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: "#475569" }}>⌕</span>
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-sm leading-none"
              style={{ color: "#64748b" }}
              aria-label="Clear search"
            >
              ✕
            </button>
          )}
        </div>

        <button
          onClick={() => setPendingOnly(v => !v)}
          className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          style={{
            background: pendingOnly ? "rgba(245,158,11,0.18)" : "#0f2040",
            border: `1px solid ${pendingOnly ? "rgba(245,158,11,0.55)" : "rgba(255,255,255,0.12)"}`,
            color: pendingOnly ? "#fbbf24" : "#94a3b8",
          }}
        >
          {pendingOnly ? "● Pending only" : "Pending only"}
        </button>

        <span className="text-sm" style={{ color: "#334155" }}>
          {total.toLocaleString()} appointments
          {debouncedSearch && <span style={{ color: "#475569" }}> · searching all dates</span>}
        </span>
      </div>

      {error && (
        <div className="px-4 py-2.5 rounded-lg text-sm" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.4)", color: "#f87171" }}>
          {error}
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-xl" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: "#050c18" }}>
              {["Client", "Booked At", "Lead Name", "Phone", "Email", "Agent", "Calendar", "Stage", "Scheduled For", "Status", "Lead File"].map(label => (
                <th key={label} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider whitespace-nowrap"
                  style={{ color: "#475569", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={11} className="px-4 py-12 text-center text-sm" style={{ color: "#1e3a5f" }}>Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={11} className="px-4 py-12 text-center text-sm" style={{ color: "#1e3a5f" }}>No appointments</td></tr>
            ) : rows.map((row, i) => {
              const url = ghlContactUrl(row);
              const style = STATUS_STYLES[row.status] ?? STATUS_STYLES.pending;
              const isPending = row.status === "pending";
              return (
                <tr key={row.id} style={{
                  borderTop: "1px solid rgba(255,255,255,0.03)",
                  background: isPending ? "rgba(245,158,11,0.05)" : i % 2 === 0 ? "rgba(255,255,255,0.015)" : "transparent",
                }}>
                  <td className="px-4 py-2.5 whitespace-nowrap text-sm" style={{ color: "#94a3b8" }}>{row.clients?.name ?? "—"}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-sm" style={{ color: "#94a3b8" }}>{formatDateTime(row.occurred_at)}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-sm" style={{ color: "#94a3b8" }}>{row.lead_name ?? "—"}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-sm" style={{ color: "#94a3b8" }}>{row.lead_phone ?? "—"}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-sm" style={{ color: "#94a3b8" }}>{row.lead_email ?? "—"}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-sm" style={{ color: "#94a3b8" }}>{row.agent_name ?? "—"}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-sm" style={{ color: "#94a3b8" }}>{row.calendar_name ?? "—"}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-sm" style={{ color: "#94a3b8" }}>{row.stage_booked ?? "—"}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-sm" style={{ color: "#94a3b8" }}>{formatDateTime(row.scheduled_at)}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-sm">
                    <select
                      value={row.status}
                      disabled={savingId === row.id}
                      onChange={e => updateStatus(row, e.target.value as AppointmentStatus)}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-semibold outline-none cursor-pointer disabled:opacity-50"
                      style={{ background: style.bg, border: `1px solid ${style.border}`, color: style.color }}
                    >
                      {STATUS_OPTIONS.map(o => (
                        <option key={o.value} value={o.value} style={{ background: "#0f2040", color: "#e2e8f0" }}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-sm">
                    {url ? (
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors"
                        style={{ background: "#0f2040", border: "1px solid rgba(255,255,255,0.12)", color: "#60a5fa" }}
                      >
                        Open in GHL ↗
                      </a>
                    ) : (
                      <span className="text-xs" style={{ color: "#334155" }}>—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center gap-3 justify-end">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            className="px-3 py-1.5 rounded-lg text-sm font-medium disabled:opacity-30 transition-colors"
            style={{ background: "#0f2040", border: "1px solid rgba(255,255,255,0.10)", color: "#94a3b8" }}>
            ← Prev
          </button>
          <span className="text-sm" style={{ color: "#334155" }}>Page {page} of {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
            className="px-3 py-1.5 rounded-lg text-sm font-medium disabled:opacity-30 transition-colors"
            style={{ background: "#0f2040", border: "1px solid rgba(255,255,255,0.10)", color: "#94a3b8" }}>
            Next →
          </button>
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";

type Client = { id: string; name: string };

type Props = {
  type: "leads" | "dials" | "appointments" | "speed_to_lead" | "ad_spend" | "meta_ad_insights";
  clients: Client[];
  preset: string;
  startDate: string;
  endDate: string;
};

const COLUMNS: Record<string, { key: string; label: string }[]> = {
  leads: [
    { key: "client", label: "Client" },
    { key: "occurred_at", label: "Date / Time" },
    { key: "lead_name", label: "Name" },
    { key: "lead_phone", label: "Phone" },
  ],
  dials: [
    { key: "client", label: "Client" },
    { key: "occurred_at", label: "Date / Time" },
    { key: "lead_name", label: "Lead Name" },
    { key: "lead_phone", label: "Lead Phone" },
    { key: "agent_name", label: "Agent" },
    { key: "dial_source", label: "Software" },
    { key: "phone_number_used", label: "Number Used" },
    { key: "duration_seconds", label: "Duration (s)" },
    { key: "is_pickup", label: "Pickup" },
    { key: "is_conversation", label: "Conversation" },
    { key: "direction", label: "Direction" },
    { key: "call_status", label: "Status" },
    { key: "speed_to_lead_seconds", label: "Speed to Lead (min)" },
    { key: "recording_url", label: "Recording" },
  ],
  appointments: [
    { key: "client", label: "Client" },
    { key: "occurred_at", label: "Booked At" },
    { key: "event_type", label: "Status" },
    { key: "external_id", label: "Appt ID" },
    { key: "calendar_id", label: "Calendar ID" },
    { key: "lead_name", label: "Lead Name" },
    { key: "lead_phone", label: "Lead Phone" },
    { key: "lead_email", label: "Email" },
    { key: "agent_name", label: "Agent" },
    { key: "calendar_name", label: "Calendar" },
    { key: "stage_booked", label: "Stage" },
    { key: "scheduled_at", label: "Scheduled For" },
  ],
  speed_to_lead: [
    { key: "client", label: "Client" },
    { key: "lead_at", label: "Lead Arrived" },
    { key: "dial_at", label: "First Dial" },
    { key: "response_min", label: "Response (min)" },
    { key: "agent_name", label: "Agent" },
    { key: "counted", label: "Counted" },
    { key: "is_pickup", label: "Pickup" },
    { key: "is_conversation", label: "Conversation" },
  ],
  ad_spend: [
    { key: "client", label: "Client" },
    { key: "spend_date", label: "Date" },
    { key: "platform", label: "Platform" },
    { key: "amount", label: "Amount" },
  ],
  meta_ad_insights: [
    { key: "client", label: "Client" },
    { key: "insight_date", label: "Date" },
    { key: "campaign_name", label: "Campaign" },
    { key: "ad_id", label: "Ad ID" },
    { key: "spend", label: "Spend" },
    { key: "impressions", label: "Impressions" },
    { key: "clicks", label: "Clicks" },
    { key: "cpm", label: "CPM" },
    { key: "cpc", label: "CPC" },
    { key: "ctr", label: "CTR" },
  ],
};

const EVENT_TYPE_LABELS: Record<string, string> = {
  appointment_booked: "Booked",
  appointment_cancelled: "Cancelled",
  show: "Show",
  no_show: "No Show",
  lo_bailed: "LO bailed",
  callback_booked: "Callback",
  proposal_sent: "Proposal",
  proposal_made: "Proposal",
  loan_processing: "Submitted",
  submission_made: "Submitted",
  closed: "Funded",
  loan_funded: "Funded",
  lo_audit: "LO audit",
};

function formatCell(key: string, value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (
    key === "occurred_at" ||
    key === "scheduled_at" ||
    key === "spend_date" ||
    key === "insight_date" ||
    key === "lead_at" ||
    key === "dial_at"
  ) {
    return new Date(value as string).toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric",
      ...(key !== "spend_date" && key !== "insight_date" ? { hour: "2-digit", minute: "2-digit" } : {}),
    });
  }
  if (key === "is_pickup" || key === "is_conversation") return value ? "✓" : "✗";
  if (key === "counted") return value ? "Yes" : "No";
  if (key === "speed_to_lead_seconds") return ((value as number) / 60).toFixed(1);
  if (key === "response_min") return Number(value).toFixed(1);
  if (key === "amount" || key === "spend") return `$${Number(value).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
  if (key === "event_type") return EVENT_TYPE_LABELS[value as string] ?? String(value);
  if (key === "platform") return (value as string).replace("_", " ").toUpperCase();
  if (key === "client") {
    const c = value as { name: string } | null;
    return c?.name ?? "—";
  }
  if (key === "recording_url") return value as string;
  return String(value);
}

export default function RawDataTable({ type, clients: allClients, preset, startDate, endDate }: Props) {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [clientFilter, setClientFilter] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [useSetterSchedule, setUseSetterSchedule] = useState(true);
  const [leadAfter, setLeadAfter] = useState("");
  const [leadBefore, setLeadBefore] = useState("");
  const [stlSummary, setStlSummary] = useState<{ median_min: number | null; sample_size: number; time_zone: string } | null>(null);

  const isSpeedToLead = type === "speed_to_lead";
  const pageSize = 100;

  // Search only applies to lead-based event types
  const searchable = ["leads", "dials", "appointments", "speed_to_lead"].includes(type);

  // Debounce the search input to avoid a request on every keystroke
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Reset search when switching to a non-searchable tab
  useEffect(() => { if (!searchable) setSearch(""); }, [searchable]);

  useEffect(() => { setPage(1); }, [type, clientFilter, debouncedSearch, preset, startDate, endDate, useSetterSchedule, leadAfter, leadBefore]);

  useEffect(() => {
    setLoading(true);

    if (isSpeedToLead) {
      const params = new URLSearchParams({ page: String(page), limit: String(pageSize) });
      if (clientFilter === "__live__") params.set("live_only", "true");
      else if (clientFilter) params.set("client_id", clientFilter);
      if (startDate) params.set("start_date", startDate);
      if (endDate) params.set("end_date", endDate);
      if (debouncedSearch) params.set("search", debouncedSearch);
      params.set("use_setter_schedule", useSetterSchedule ? "true" : "false");
      if (leadAfter) params.set("lead_after", leadAfter);
      if (leadBefore) params.set("lead_before", leadBefore);

      fetch(`/api/speed-to-lead?${params}`)
        .then(r => r.json())
        .then(d => {
          setRows(d.rows ?? []);
          setTotal(d.total ?? 0);
          setStlSummary(d.summary ?? null);
          setLoading(false);
        })
        .catch(() => setLoading(false));
      return;
    }

    setStlSummary(null);
    const params = new URLSearchParams({ type, page: String(page) });
    if (clientFilter === "__live__") params.set("live_only", "true");
    else if (clientFilter) params.set("client_id", clientFilter);
    if (startDate) params.set("start_date", startDate);
    if (endDate) params.set("end_date", endDate);
    if (searchable && debouncedSearch) params.set("search", debouncedSearch);

    fetch(`/api/raw?${params}`)
      .then(r => r.json())
      .then(d => { setRows(d.rows ?? []); setTotal(d.total ?? 0); setLoading(false); })
      .catch(() => setLoading(false));
  }, [type, clientFilter, page, startDate, endDate, debouncedSearch, searchable, isSpeedToLead, useSetterSchedule, leadAfter, leadBefore]);

  const cols = COLUMNS[type] ?? [];
  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="space-y-4">
      {/* Client filter */}
      <div className="flex items-center gap-3">
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

        {searchable && (
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
        )}

        <span className="text-sm" style={{ color: "#334155" }}>{total.toLocaleString()} rows</span>
        {isSpeedToLead && stlSummary && (
          <span className="text-xs" style={{ color: "#64748b" }}>
            Median: {stlSummary.median_min != null ? `${stlSummary.median_min} min` : "—"} ({stlSummary.sample_size} counted · {stlSummary.time_zone})
          </span>
        )}
      </div>

      {isSpeedToLead && (
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: "#94a3b8" }}>
            <input
              type="checkbox"
              checked={useSetterSchedule}
              onChange={e => setUseSetterSchedule(e.target.checked)}
              className="rounded"
            />
            Use setter schedule
          </label>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-wide" style={{ color: "#475569" }}>Lead after</label>
            <input
              type="time"
              value={leadAfter}
              onChange={e => setLeadAfter(e.target.value)}
              className="px-2 py-1.5 rounded-lg text-sm outline-none"
              style={{ background: "#0f2040", border: "1px solid rgba(255,255,255,0.12)", color: "#e2e8f0" }}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-wide" style={{ color: "#475569" }}>Lead before</label>
            <input
              type="time"
              value={leadBefore}
              onChange={e => setLeadBefore(e.target.value)}
              className="px-2 py-1.5 rounded-lg text-sm outline-none"
              style={{ background: "#0f2040", border: "1px solid rgba(255,255,255,0.12)", color: "#e2e8f0" }}
            />
          </div>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-xl" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: "#050c18" }}>
              {cols.map(c => (
                <th key={c.key} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider whitespace-nowrap"
                  style={{ color: "#475569", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={cols.length} className="px-4 py-12 text-center text-sm" style={{ color: "#1e3a5f" }}>Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={cols.length} className="px-4 py-12 text-center text-sm" style={{ color: "#1e3a5f" }}>No data</td></tr>
            ) : rows.map((row, i) => (
              <tr key={i} style={{ borderTop: "1px solid rgba(255,255,255,0.03)", background: i % 2 === 0 ? "rgba(255,255,255,0.015)" : "transparent" }}>
                {cols.map(c => {
                  const rawVal = c.key === "client" && !isSpeedToLead ? row["clients"] : row[c.key];
                  const val = formatCell(c.key, rawVal);
                  const excludedLabel = row["excluded_label"] as string | null;
                  const showExcludedHint = c.key === "counted" && !row["counted"] && excludedLabel;
                  return (
                    <td
                      key={c.key}
                      className="px-4 py-2.5 whitespace-nowrap text-sm"
                      style={{ color: c.key === "counted" && row["counted"] === false ? "#64748b" : "#94a3b8" }}
                      title={showExcludedHint ? excludedLabel : undefined}
                    >
                      {c.key === "recording_url" && val !== "—"
                        ? <a href={val} target="_blank" rel="noopener noreferrer" style={{ color: "#f59e0b" }}>▶ Listen</a>
                        : val}
                    </td>
                  );
                })}
              </tr>
            ))}
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

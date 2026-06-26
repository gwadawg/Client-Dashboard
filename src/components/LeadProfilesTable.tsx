"use client";

import { Fragment, useEffect, useState } from "react";

type Client = { id: string; name: string };

type LeadCounts = {
  dials: number;
  pickups: number;
  conversations: number;
  appointments_booked: number;
  shows: number;
  no_shows: number;
  lo_bailed: number;
  cancellations: number;
  callbacks: number;
  live_transfers: number;
  claimed: number;
  proposals: number;
  loan_processing: number;
  closed: number;
  proposals_made: number;
  submissions_made: number;
  funded_loans: number;
};

type TimelineItem = {
  id: string;
  event_type: string;
  occurred_at: string;
  scheduled_at: string | null;
  agent_name: string | null;
  duration_seconds: number | null;
  is_pickup: boolean | null;
  is_conversation: boolean | null;
  call_status: string | null;
  calendar_name: string | null;
  external_id: string | null;
  calendar_id: string | null;
  stage_booked: string | null;
  recording_url: string | null;
};

type LeadProfile = {
  contact_key: string;
  client_name: string;
  lead_name: string | null;
  lead_phone: string | null;
  lead_email: string | null;
  created_at: string;
  is_qualified: boolean;
  is_hot: boolean;
  is_out_of_state: boolean;
  loan_amount: string | null;
  property_value: string | null;
  ltv: number | null;
  b1_age: string | null;
  b2_age: string | null;
  lead_source: string | null;
  has_proposal_made: boolean;
  has_submission_made: boolean;
  has_loan_funded: boolean;
  ghl_contact_id: string | null;
  ghl_location_id: string | null;
  counts: LeadCounts;
  timeline: TimelineItem[];
};

type UnmappedContact = LeadProfile & {
  first_activity: string;
  last_activity: string;
  event_count: number;
  event_types: Record<string, number>;
};

type MappingSummary = {
  leads_in_period: number;
  unmapped_contacts: number;
  unmapped_events: number;
  unmapped_by_type: Record<string, number>;
};

type TableView = "leads" | "unmapped";

type Props = {
  clients: Client[];
  startDate: string;
  endDate: string;
};

const EVENT_LABELS: Record<string, string> = {
  lead: "Lead",
  dial: "Dial",
  appointment_booked: "Appt Booked",
  appointment_cancelled: "Cancelled",
  show: "Show",
  no_show: "No Show (lead)",
  lo_bailed: "LO bailed",
  callback_booked: "Callback",
  live_transfer: "Live Transfer",
  claimed: "Claimed",
  proposal_sent: "Proposal",
  proposal_made: "Proposal",
  loan_processing: "Submitted",
  submission_made: "Submitted",
  closed: "Funded",
  loan_funded: "Funded",
  lo_audit: "LO audit",
  out_of_state_lead: "Out of State",
};

function fmtDate(iso: string, withTime = true) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}

function fmtPhone(phone: string | null) {
  if (!phone) return "—";
  const d = phone.replace(/\D/g, "");
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  return phone;
}

function ghlContactUrl(row: Pick<LeadProfile, "ghl_location_id" | "ghl_contact_id">): string | null {
  if (!row.ghl_location_id || !row.ghl_contact_id) return null;
  return `https://app.gohighlevel.com/v2/location/${row.ghl_location_id}/contacts/detail/${row.ghl_contact_id}`;
}

function formatUnmappedTypes(byType: Record<string, number>): string {
  return Object.entries(byType)
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => `${count} ${EVENT_LABELS[type] ?? type}`)
    .join(" · ");
}

function MappingBanner({
  summary,
  view,
  onViewChange,
}: {
  summary: MappingSummary;
  view: TableView;
  onViewChange: (view: TableView) => void;
}) {
  if (summary.unmapped_contacts === 0) return null;

  return (
    <div
      className="rounded-xl px-4 py-3 space-y-3"
      style={{ background: "#422006", border: "1px solid rgba(251, 191, 36, 0.25)" }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm font-semibold" style={{ color: "#fde68a" }}>
            Unmapped activity detected
          </p>
          <p className="text-xs leading-relaxed max-w-3xl" style={{ color: "#fcd34d" }}>
            {summary.unmapped_contacts.toLocaleString()} contact
            {summary.unmapped_contacts === 1 ? "" : "s"} had{" "}
            {summary.unmapped_events.toLocaleString()} event
            {summary.unmapped_events === 1 ? "" : "s"} in this range with no matching{" "}
            <code className="text-[11px]">lead</code> event on record. These are excluded from the
            lead count ({summary.leads_in_period.toLocaleString()}) so it matches the dashboard.
          </p>
          {Object.keys(summary.unmapped_by_type).length > 0 && (
            <p className="text-xs" style={{ color: "#fbbf24" }}>
              {formatUnmappedTypes(summary.unmapped_by_type)}
            </p>
          )}
        </div>
        <div className="flex rounded-lg overflow-hidden shrink-0" style={{ border: "1px solid rgba(251, 191, 36, 0.3)" }}>
          <button
            type="button"
            onClick={() => onViewChange("leads")}
            className="px-3 py-1.5 text-xs font-semibold transition-colors"
            style={{
              background: view === "leads" ? "#f59e0b" : "transparent",
              color: view === "leads" ? "#1c1917" : "#fde68a",
            }}
          >
            Leads ({summary.leads_in_period.toLocaleString()})
          </button>
          <button
            type="button"
            onClick={() => onViewChange("unmapped")}
            className="px-3 py-1.5 text-xs font-semibold transition-colors"
            style={{
              background: view === "unmapped" ? "#f59e0b" : "transparent",
              color: view === "unmapped" ? "#1c1917" : "#fde68a",
            }}
          >
            Unmapped ({summary.unmapped_contacts.toLocaleString()})
          </button>
        </div>
      </div>
    </div>
  );
}

function csvEscape(s: string): string {
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function downloadLeadsPageCsv(rows: LeadProfile[], page: number) {
  const headers = [
    "Client",
    "Lead ID",
    "Name",
    "Phone",
    "Email",
    "Loan amount",
    "Property value",
    "LTV",
    "B1 age",
    "B2 age",
    "Lead source",
    "Lead created",
    "Qualified",
    "Hot",
    "Out of state",
    "Dials",
    "Appts booked",
    "Shows",
    "No-shows",
    "LO bailed",
    "Cancelled",
    "Funded",
    "In processing",
    "Callbacks",
    "Claimed",
    "Proposals",
    "Live transfers",
  ];
  const lines = [headers.map(csvEscape).join(",")];
  for (const row of rows) {
    const k = row.contact_key;
    const c = row.counts;
    lines.push(
      [
        row.client_name,
        k,
        row.lead_name ?? "",
        row.lead_phone ?? "",
        row.lead_email ?? "",
        row.loan_amount ?? "",
        row.property_value ?? "",
        row.ltv != null ? `${row.ltv}%` : "",
        row.b1_age ?? "",
        row.b2_age ?? "",
        row.lead_source ?? "",
        new Date(row.created_at).toISOString().slice(0, 10),
        row.is_qualified ? "Y" : "",
        row.is_hot ? "Y" : "",
        row.is_out_of_state ? "Y" : "",
        String(c.dials),
        String(c.appointments_booked),
        String(c.shows),
        String(c.no_shows),
        String(c.lo_bailed),
        String(c.cancellations),
        String(c.funded_loans),
        String(c.submissions_made),
        String(c.callbacks),
        String(c.claimed),
        String(c.proposals_made),
        String(c.live_transfers),
      ]
        .map(csvEscape)
        .join(","),
    );
  }
  const blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `raw-leads-page-${page}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function Flag({ on, label, color }: { on: boolean; label: string; color: string }) {
  if (!on) return null;
  return (
    <span
      className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded"
      style={{ background: `${color}22`, color, border: `1px solid ${color}44` }}
    >
      {label}
    </span>
  );
}

function CountPill({ label, value, accent }: { label: string; value: number; accent?: string }) {
  if (value === 0) return null;
  return (
    <span className="text-xs whitespace-nowrap" style={{ color: accent ?? "#94a3b8" }}>
      <span className="font-semibold" style={{ color: accent ?? "#e2e8f0" }}>{value}</span> {label}
    </span>
  );
}

const TIMELINE_APPT_TYPES = new Set([
  "appointment_booked",
  "appointment_cancelled",
  "show",
  "no_show",
  "lo_bailed",
  "callback_booked",
]);

function TimelineRow({ item }: { item: TimelineItem }) {
  const label = EVENT_LABELS[item.event_type] ?? item.event_type;
  const detail: string[] = [];
  if (item.agent_name) detail.push(item.agent_name);
  if (item.duration_seconds != null) detail.push(`${item.duration_seconds}s`);
  if (item.is_pickup) detail.push("pickup");
  if (item.is_conversation) detail.push("2m+");
  if (item.call_status) detail.push(item.call_status);
  if (item.calendar_name) detail.push(item.calendar_name);
  if (item.stage_booked) detail.push(item.stage_booked);
  if (item.scheduled_at) detail.push(`sched ${fmtDate(item.scheduled_at)}`);
  if (TIMELINE_APPT_TYPES.has(item.event_type) && item.external_id) {
    detail.push(`appt ${item.external_id}`);
  }
  if (TIMELINE_APPT_TYPES.has(item.event_type) && item.calendar_id) {
    detail.push(`cal ${item.calendar_id}`);
  }

  return (
    <tr style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
      <td className="px-4 py-2 text-xs whitespace-nowrap" style={{ color: "#64748b" }}>
        {fmtDate(item.occurred_at)}
      </td>
      <td className="px-4 py-2 text-xs font-medium whitespace-nowrap" style={{ color: "#f59e0b" }}>
        {label}
      </td>
      <td className="px-4 py-2 text-xs" style={{ color: "#94a3b8" }}>
        {detail.join(" · ") || "—"}
      </td>
      <td className="px-4 py-2 text-xs">
        {item.recording_url ? (
          <a href={item.recording_url} target="_blank" rel="noopener noreferrer" style={{ color: "#f59e0b" }}>
            ▶ Listen
          </a>
        ) : (
          <span style={{ color: "#334155" }}>—</span>
        )}
      </td>
    </tr>
  );
}

export default function LeadProfilesTable({ clients: allClients, startDate, endDate }: Props) {
  const [rows, setRows] = useState<(LeadProfile | UnmappedContact)[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [clientFilter, setClientFilter] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [capped, setCapped] = useState(false);
  const [conversionFilter, setConversionFilter] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [tableView, setTableView] = useState<TableView>("leads");
  const [mappingSummary, setMappingSummary] = useState<MappingSummary | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
    setExpanded(new Set());
  }, [clientFilter, startDate, endDate, conversionFilter, debouncedSearch, tableView]);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), view: tableView });
    if (clientFilter === "__live__") params.set("live_only", "true");
    else if (clientFilter) params.set("client_id", clientFilter);
    if (startDate) params.set("start_date", startDate);
    if (endDate) params.set("end_date", endDate);
    if (conversionFilter && tableView === "leads") params.set("conversion_event", conversionFilter);
    if (debouncedSearch) params.set("search", debouncedSearch);

    fetch(`/api/raw/leads?${params}`)
      .then((r) => r.json())
      .then((d) => {
        setRows(d.rows ?? []);
        setTotal(d.total ?? 0);
        setCapped(!!d.capped);
        setMappingSummary(d.mapping_summary ?? null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [clientFilter, page, startDate, endDate, conversionFilter, debouncedSearch, tableView]);

  function handleViewChange(next: TableView) {
    setTableView(next);
  }

  const isUnmappedView = tableView === "unmapped";
  const leadCount = mappingSummary?.leads_in_period ?? (isUnmappedView ? 0 : total);

  const totalPages = Math.ceil(total / 50);

  function toggleExpand(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="space-y-4">
      {mappingSummary && (
        <MappingBanner summary={mappingSummary} view={tableView} onViewChange={handleViewChange} />
      )}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={clientFilter}
          onChange={(e) => setClientFilter(e.target.value)}
          className="px-4 py-2 rounded-lg text-sm font-medium outline-none"
          style={{
            background: "#0f2040",
            border: "1px solid rgba(255,255,255,0.12)",
            color: "#e2e8f0",
            minWidth: "11rem",
          }}
        >
          <option value="">All Clients</option>
          <option value="__live__">Live Clients</option>
          {allClients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <div className="relative">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, phone or email…"
            className="pl-9 pr-8 py-2 rounded-lg text-sm outline-none"
            style={{
              background: "#0f2040",
              border: "1px solid rgba(255,255,255,0.12)",
              color: "#e2e8f0",
              minWidth: "16rem",
            }}
          />
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: "#475569" }}>
            ⌕
          </span>
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-sm leading-none"
              style={{ color: "#64748b" }}
              aria-label="Clear search"
            >
              ✕
            </button>
          )}
        </div>

        <select
          value={conversionFilter}
          onChange={(e) => setConversionFilter(e.target.value)}
          disabled={isUnmappedView}
          className="px-4 py-2 rounded-lg text-sm font-medium outline-none disabled:opacity-40"
          style={{
            background: "#0f2040",
            border: "1px solid rgba(255,255,255,0.12)",
            color: "#e2e8f0",
            minWidth: "12rem",
          }}
        >
          <option value="">All Conversion Stages</option>
          <option value="proposal_made">Has Proposal</option>
          <option value="submission_made">Has Submission</option>
          <option value="loan_funded">Has Funded Loan</option>
        </select>
        <span className="text-sm" style={{ color: "#334155" }}>
          {isUnmappedView
            ? `${total.toLocaleString()} unmapped contact${total === 1 ? "" : "s"}`
            : `${leadCount.toLocaleString()} leads`}
          {debouncedSearch && <span style={{ color: "#475569" }}> · searching all dates</span>}
        </span>
        <button
          type="button"
          disabled={loading || rows.length === 0 || isUnmappedView}
          onClick={() => downloadLeadsPageCsv(rows as LeadProfile[], page)}
          className="px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-40 transition-colors"
          style={{
            background: "#0f2040",
            border: "1px solid rgba(255,255,255,0.12)",
            color: "#94a3b8",
          }}
        >
          Download CSV (this page)
        </button>
        {capped && (
          <span className="text-xs px-2 py-1 rounded" style={{ background: "#422006", color: "#fbbf24" }}>
            Large range — narrow dates or client for full history
          </span>
        )}
      </div>
      <p className="text-xs leading-relaxed max-w-3xl" style={{ color: "#475569" }}>
        {isUnmappedView
          ? "Contacts with dial, claim, or appointment activity in this range but no lead event on record anywhere. Expand a row to inspect the orphaned events — usually a missing GHL lead webhook or a legacy contact being power-dialed."
          : "One row per lead event in the selected date range (matches dashboard Total Leads). Activity columns count dials, appointments, and outcomes in the same range. Search by name, phone, or email to jump to a lead (ignores the date range). Expand a row for the full event timeline."}
      </p>

      <div className="overflow-x-auto rounded-xl" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
        <table className="w-full text-sm min-w-[1100px]">
          <thead>
            <tr style={{ background: "#050c18" }}>
              {["", "Client", "Name", "Flags", "Source", "Activity", "Loan amt", "Prop. value", "LTV", "B1 age", "B2 age", "Phone", "Email", isUnmappedView ? "Last activity" : "Created", "Contact"].map((h) => (
                <th
                  key={h || "expand"}
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider whitespace-nowrap"
                  style={{ color: "#475569", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={15} className="px-4 py-12 text-center text-sm" style={{ color: "#1e3a5f" }}>
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={15} className="px-4 py-12 text-center text-sm" style={{ color: "#1e3a5f" }}>
                  {isUnmappedView ? "No unmapped activity in this range" : "No leads in this range"}
                </td>
              </tr>
            ) : (
              rows.map((row, i) => {
                const open = expanded.has(row.contact_key);
                const c = row.counts;
                const unmapped = isUnmappedView ? (row as UnmappedContact) : null;
                return (
                  <Fragment key={row.contact_key}>
                    <tr
                      className="cursor-pointer transition-colors hover:bg-white/[0.03]"
                      style={{
                        borderTop: "1px solid rgba(255,255,255,0.03)",
                        background: i % 2 === 0 ? "rgba(255,255,255,0.015)" : "transparent",
                      }}
                      onClick={() => toggleExpand(row.contact_key)}
                    >
                      <td className="px-4 py-3 text-xs" style={{ color: "#64748b" }}>
                        {open ? "▼" : "▶"}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap" style={{ color: "#94a3b8" }}>
                        {row.client_name}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap font-medium" style={{ color: "#e2e8f0" }}>
                        {row.lead_name ?? "—"}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {isUnmappedView ? (
                            <span
                              className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded"
                              style={{ background: "#422006", color: "#fbbf24", border: "1px solid rgba(251, 191, 36, 0.35)" }}
                            >
                              No lead event
                            </span>
                          ) : (
                            <>
                              <Flag on={row.is_qualified} label="Q" color="#22c55e" />
                              <Flag on={row.is_hot} label="Hot" color="#ef4444" />
                              <Flag on={row.is_out_of_state} label="OOS" color="#a78bfa" />
                              <Flag on={row.has_proposal_made} label="Proposal" color="#38bdf8" />
                              <Flag on={row.has_submission_made} label="Submission" color="#f59e0b" />
                              <Flag on={row.has_loan_funded} label="Funded" color="#22c55e" />
                            </>
                          )}
                        </div>
                      </td>
                      <td
                        className="px-4 py-2.5 whitespace-nowrap text-xs max-w-[8rem] truncate"
                        style={{ color: "#94a3b8" }}
                        title={row.lead_source ?? undefined}
                      >
                        {row.lead_source ?? "—"}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-wrap gap-x-3 gap-y-1">
                          <CountPill label="dials" value={c.dials} />
                          <CountPill label="booked" value={c.appointments_booked} accent="#38bdf8" />
                          <CountPill label="shows" value={c.shows} accent="#22c55e" />
                          <CountPill label="no-shows" value={c.no_shows} accent="#f87171" />
                          <CountPill label="LO bailed" value={c.lo_bailed} accent="#fb923c" />
                          <CountPill label="cancelled" value={c.cancellations} />
                          <CountPill label="funded" value={c.funded_loans} accent="#f59e0b" />
                          <CountPill label="submissions" value={c.submissions_made} />
                          <CountPill label="callbacks" value={c.callbacks} />
                          <CountPill label="claimed" value={c.claimed} accent="#f59e0b" />
                          <CountPill label="proposals" value={c.proposals_made} />
                        </div>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-xs tabular-nums" style={{ color: "#94a3b8" }}>
                        {row.loan_amount ?? "—"}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-xs tabular-nums" style={{ color: "#94a3b8" }}>
                        {row.property_value ?? "—"}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-xs tabular-nums" style={{ color: "#94a3b8" }}>
                        {row.ltv != null ? `${row.ltv}%` : "—"}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-xs tabular-nums" style={{ color: "#94a3b8" }}>
                        {row.b1_age ?? "—"}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-xs tabular-nums" style={{ color: "#94a3b8" }}>
                        {row.b2_age ?? "—"}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap" style={{ color: "#94a3b8" }}>
                        {fmtPhone(row.lead_phone)}
                      </td>
                      <td
                        className="px-4 py-2.5 whitespace-nowrap text-xs max-w-[10rem] truncate"
                        style={{ color: "#94a3b8" }}
                        title={row.lead_email ?? undefined}
                      >
                        {row.lead_email ?? "—"}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-xs" style={{ color: "#64748b" }}>
                        {isUnmappedView && unmapped
                          ? fmtDate(unmapped.last_activity, false)
                          : fmtDate(row.created_at, false)}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-sm" onClick={(e) => e.stopPropagation()}>
                        {(() => {
                          const url = ghlContactUrl(row);
                          return url ? (
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
                          );
                        })()}
                      </td>
                    </tr>
                    {open && (
                      <tr>
                        <td colSpan={14} className="px-0 py-0" style={{ background: "#070f1a" }}>
                          <table className="w-full">
                            <thead>
                              <tr>
                                {["When", "Event", "Details", "Recording"].map((label) => (
                                  <th
                                    key={label}
                                    className={`${label === "When" ? "px-8" : "px-4"} py-2 text-left text-[10px] uppercase tracking-wider`}
                                    style={{ color: "#334155" }}
                                  >
                                    {label}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {row.timeline.length === 0 ? (
                                <tr>
                                  <td colSpan={4} className="px-8 py-4 text-xs" style={{ color: "#334155" }}>
                                    No events
                                  </td>
                                </tr>
                              ) : (
                                row.timeline.map((item) => <TimelineRow key={item.id} item={item} />)
                              )}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center gap-3 justify-end">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1.5 rounded-lg text-sm font-medium disabled:opacity-30 transition-colors"
            style={{
              background: "#0f2040",
              border: "1px solid rgba(255,255,255,0.10)",
              color: "#94a3b8",
            }}
          >
            ← Prev
          </button>
          <span className="text-sm" style={{ color: "#334155" }}>
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-3 py-1.5 rounded-lg text-sm font-medium disabled:opacity-30 transition-colors"
            style={{
              background: "#0f2040",
              border: "1px solid rgba(255,255,255,0.10)",
              color: "#94a3b8",
            }}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}

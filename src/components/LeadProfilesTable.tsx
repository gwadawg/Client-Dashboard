"use client";

import { Fragment, useEffect, useState } from "react";
import { shortLeadId } from "@/lib/contact-key";

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
  proposals: number;
  loan_processing: number;
  closed: number;
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
  b1_age: string | null;
  b2_age: string | null;
  counts: LeadCounts;
  timeline: TimelineItem[];
};

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
  proposal_sent: "Proposal",
  loan_processing: "Submitted",
  closed: "Funded",
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
    "B1 age",
    "B2 age",
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
        row.b1_age ?? "",
        row.b2_age ?? "",
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
        String(c.closed),
        String(c.loan_processing),
        String(c.callbacks),
        String(c.proposals),
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
  const [rows, setRows] = useState<LeadProfile[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [clientFilter, setClientFilter] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [capped, setCapped] = useState(false);

  useEffect(() => {
    setPage(1);
    setExpanded(new Set());
  }, [clientFilter, startDate, endDate]);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page) });
    if (clientFilter === "__live__") params.set("live_only", "true");
    else if (clientFilter) params.set("client_id", clientFilter);
    if (startDate) params.set("start_date", startDate);
    if (endDate) params.set("end_date", endDate);

    fetch(`/api/raw/leads?${params}`)
      .then((r) => r.json())
      .then((d) => {
        setRows(d.rows ?? []);
        setTotal(d.total ?? 0);
        setCapped(!!d.capped);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [clientFilter, page, startDate, endDate]);

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
        <span className="text-sm" style={{ color: "#334155" }}>
          {total.toLocaleString()} leads
        </span>
        <button
          type="button"
          disabled={loading || rows.length === 0}
          onClick={() => downloadLeadsPageCsv(rows, page)}
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
        One row per lead (contact). Columns show identity, loan/property and borrower ages from your webhook payload, flags, and activity counts. Use date and client filters, then page through the full list. Scroll sideways on smaller screens. Expand a row for the full event timeline.
      </p>

      <div className="overflow-x-auto rounded-xl" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
        <table className="w-full text-sm min-w-[1100px]">
          <thead>
            <tr style={{ background: "#050c18" }}>
              {["", "Client", "Lead ID", "Name", "Phone", "Email", "Loan amt", "Prop. value", "B1 age", "B2 age", "Created", "Flags", "Activity"].map((h) => (
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
                <td colSpan={13} className="px-4 py-12 text-center text-sm" style={{ color: "#1e3a5f" }}>
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={13} className="px-4 py-12 text-center text-sm" style={{ color: "#1e3a5f" }}>
                  No leads in this range
                </td>
              </tr>
            ) : (
              rows.map((row, i) => {
                const open = expanded.has(row.contact_key);
                const c = row.counts;
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
                      <td
                        className="px-4 py-2.5 font-mono text-xs whitespace-nowrap"
                        style={{ color: "#64748b" }}
                        title={row.contact_key}
                      >
                        {shortLeadId(row.contact_key)}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap font-medium" style={{ color: "#e2e8f0" }}>
                        {row.lead_name ?? "—"}
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
                      <td className="px-4 py-2.5 whitespace-nowrap text-xs tabular-nums" style={{ color: "#94a3b8" }}>
                        {row.loan_amount ?? "—"}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-xs tabular-nums" style={{ color: "#94a3b8" }}>
                        {row.property_value ?? "—"}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-xs tabular-nums" style={{ color: "#94a3b8" }}>
                        {row.b1_age ?? "—"}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-xs tabular-nums" style={{ color: "#94a3b8" }}>
                        {row.b2_age ?? "—"}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-xs" style={{ color: "#64748b" }}>
                        {fmtDate(row.created_at, false)}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          <Flag on={row.is_qualified} label="Q" color="#22c55e" />
                          <Flag on={row.is_hot} label="Hot" color="#ef4444" />
                          <Flag on={row.is_out_of_state} label="OOS" color="#a78bfa" />
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-wrap gap-x-3 gap-y-1">
                          <CountPill label="dials" value={c.dials} />
                          <CountPill label="booked" value={c.appointments_booked} accent="#38bdf8" />
                          <CountPill label="shows" value={c.shows} accent="#22c55e" />
                          <CountPill label="no-shows" value={c.no_shows} accent="#f87171" />
                          <CountPill label="LO bailed" value={c.lo_bailed} accent="#fb923c" />
                          <CountPill label="cancelled" value={c.cancellations} />
                          <CountPill label="funded" value={c.closed} accent="#f59e0b" />
                          <CountPill label="in processing" value={c.loan_processing} />
                          <CountPill label="callbacks" value={c.callbacks} />
                          <CountPill label="proposals" value={c.proposals} />
                        </div>
                      </td>
                    </tr>
                    {open && (
                      <tr>
                        <td colSpan={13} className="px-0 py-0" style={{ background: "#070f1a" }}>
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

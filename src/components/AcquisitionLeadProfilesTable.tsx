"use client";

import { Fragment, useEffect, useState } from "react";
import {
  ghlAcquisitionContactUrl,
  type AcquisitionLeadCounts,
  type AcquisitionLeadProfile,
  type AcquisitionTimelineItem,
} from "@/lib/acquisition-lead-profiles";

type Props = {
  startDate: string;
  endDate: string;
};

const EVENT_LABELS: Record<string, string> = {
  lead_created: "Lead",
  dial: "Dial",
  intro_booked: "Intro Booked",
  intro_showed: "Intro Showed",
  intro_no_show: "Intro No-Show",
  intro_cancelled: "Intro Cancelled",
  intro_team_no_show: "Intro Team No-Show",
  demo_booked: "Demo Booked",
  demo_showed: "Demo Showed",
  demo_no_show: "Demo No-Show",
  demo_cancelled: "Demo Cancelled",
  demo_team_no_show: "Demo Team No-Show",
  followup_showed: "Follow-up Showed",
  bamfam_showed: "BAMFAM Showed",
  organic_showed: "Organic Call",
  offer_made: "Offer Made",
  offer_closed: "Offer Closed",
  client_closed: "Client Closed",
  client_onboarding: "Client Onboarding",
  client_launch: "Client Launch",
  client_checkin: "Client Check-in",
  client_kickoff: "Client Kickoff",
  client_churn: "Client Churn",
};

const STAGE_LABELS: Record<string, string> = {
  lead: "Lead",
  intro_booked: "Intro Booked",
  intro_showed: "Intro Showed",
  demo_booked: "Demo Booked",
  demo_showed: "Demo Showed",
  offer_made: "Offer Made",
  closed: "Closed",
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
  if (d.length === 11 && d.startsWith("1")) {
    return `(${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
  }
  return phone;
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

function TimelineRow({ item }: { item: AcquisitionTimelineItem }) {
  const label = EVENT_LABELS[item.event_type] ?? item.event_type.replace(/_/g, " ");
  return (
    <tr style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
      <td className="px-4 py-2 text-xs whitespace-nowrap" style={{ color: "#64748b" }}>
        {fmtDate(item.occurred_at)}
      </td>
      <td className="px-4 py-2 text-xs font-medium whitespace-nowrap" style={{ color: "#f59e0b" }}>
        {label}
      </td>
      <td className="px-4 py-2 text-xs" style={{ color: "#94a3b8" }}>
        {item.details ?? "—"}
      </td>
      <td className="px-4 py-2 text-xs">
        {item.recording_url ? (
          <a href={item.recording_url} target="_blank" rel="noopener noreferrer" style={{ color: "#f59e0b" }}>
            ▶ Listen
          </a>
        ) : item.transcript_url ? (
          <a href={item.transcript_url} target="_blank" rel="noopener noreferrer" style={{ color: "#38bdf8" }}>
            Transcript
          </a>
        ) : (
          <span style={{ color: "#334155" }}>—</span>
        )}
      </td>
    </tr>
  );
}

function ActivityPills({ c }: { c: AcquisitionLeadCounts }) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1">
      <CountPill label="dials" value={c.dials} />
      <CountPill label="intro booked" value={c.intro_booked} accent="#38bdf8" />
      <CountPill label="intro showed" value={c.intro_showed} accent="#22c55e" />
      <CountPill label="intro no-show" value={c.intro_no_show} accent="#f87171" />
      <CountPill label="demo booked" value={c.demo_booked} accent="#38bdf8" />
      <CountPill label="demo showed" value={c.demo_showed} accent="#22c55e" />
      <CountPill label="demo no-show" value={c.demo_no_show} accent="#f87171" />
      <CountPill label="offers" value={c.offers} accent="#f59e0b" />
      <CountPill label="closes" value={c.closes} accent="#a78bfa" />
    </div>
  );
}

export default function AcquisitionLeadProfilesTable({ startDate, endDate }: Props) {
  const [rows, setRows] = useState<AcquisitionLeadProfile[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [capped, setCapped] = useState(false);
  const [funnelStage, setFunnelStage] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
    setExpanded(new Set());
  }, [startDate, endDate, funnelStage, debouncedSearch]);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page) });
    if (startDate) params.set("start_date", startDate);
    if (endDate) params.set("end_date", endDate);
    if (funnelStage) params.set("funnel_stage", funnelStage);
    if (debouncedSearch) params.set("search", debouncedSearch);

    fetch(`/api/acquisition/leads?${params}`)
      .then(r => r.json())
      .then(d => {
        setRows(d.rows ?? []);
        setTotal(d.total ?? 0);
        setCapped(!!d.capped);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [page, startDate, endDate, funnelStage, debouncedSearch]);

  const totalPages = Math.max(1, Math.ceil(total / 50));

  function toggleExpand(leadId: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(leadId)) next.delete(leadId);
      else next.add(leadId);
      return next;
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
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
          value={funnelStage}
          onChange={e => setFunnelStage(e.target.value)}
          className="px-4 py-2 rounded-lg text-sm font-medium outline-none"
          style={{
            background: "#0f2040",
            border: "1px solid rgba(255,255,255,0.12)",
            color: "#e2e8f0",
            minWidth: "12rem",
          }}
        >
          <option value="">All Funnel Stages</option>
          <option value="intro_booked">Intro Booked+</option>
          <option value="intro_showed">Intro Showed+</option>
          <option value="demo_booked">Demo Booked+</option>
          <option value="demo_showed">Demo Showed+</option>
          <option value="offer_made">Offer Made+</option>
          <option value="closed">Closed</option>
        </select>

        <span className="text-sm" style={{ color: "#334155" }}>
          {total.toLocaleString()} leads
          {debouncedSearch && <span style={{ color: "#475569" }}> · searching all dates</span>}
        </span>

        {capped && (
          <span className="text-xs px-2 py-1 rounded" style={{ background: "#422006", color: "#fbbf24" }}>
            Large range — narrow dates for full history
          </span>
        )}
      </div>

      <p className="text-xs leading-relaxed max-w-3xl" style={{ color: "#475569" }}>
        One row per acquisition lead. Expand a row for the full funnel timeline — intro/demo bookings and outcomes, offers, closes, and dials. Search ignores the date range. Use Open in GHL to jump to the contact.
      </p>

      <div className="overflow-x-auto rounded-xl" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
        <table className="w-full text-sm min-w-[960px]">
          <thead>
            <tr style={{ background: "#050c18" }}>
              {["", "Name", "Stage", "Flags", "Source", "Activity", "Phone", "Email", "Created", "Contact"].map(h => (
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
                <td colSpan={10} className="px-4 py-12 text-center text-sm" style={{ color: "#1e3a5f" }}>
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-12 text-center text-sm" style={{ color: "#1e3a5f" }}>
                  No leads in this range
                </td>
              </tr>
            ) : (
              rows.map((row, i) => {
                const open = expanded.has(row.lead_id);
                const ghlUrl = ghlAcquisitionContactUrl(row.ghl_contact_id);
                return (
                  <Fragment key={row.lead_id}>
                    <tr
                      className="cursor-pointer transition-colors hover:bg-white/[0.03]"
                      style={{
                        borderTop: "1px solid rgba(255,255,255,0.03)",
                        background: i % 2 === 0 ? "rgba(255,255,255,0.015)" : "transparent",
                      }}
                      onClick={() => toggleExpand(row.lead_id)}
                    >
                      <td className="px-4 py-3 text-xs" style={{ color: "#64748b" }}>
                        {open ? "▼" : "▶"}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap font-medium" style={{ color: "#e2e8f0" }}>
                        {row.lead_name ?? "—"}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-xs" style={{ color: "#94a3b8" }}>
                        {STAGE_LABELS[row.funnel_stage] ?? row.funnel_stage}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          <Flag on={row.qualified} label="Qualified" color="#22c55e" />
                          {row.converted_client_id ? (
                            <Flag on label="Client" color="#a78bfa" />
                          ) : null}
                        </div>
                      </td>
                      <td
                        className="px-4 py-2.5 whitespace-nowrap text-xs max-w-[8rem] truncate"
                        style={{ color: "#94a3b8" }}
                        title={row.source ?? undefined}
                      >
                        {row.source ?? "—"}
                      </td>
                      <td className="px-4 py-2.5">
                        <ActivityPills c={row.counts} />
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap" style={{ color: "#94a3b8" }}>
                        {fmtPhone(row.phone)}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-xs" style={{ color: "#94a3b8" }}>
                        {row.email ?? "—"}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-xs" style={{ color: "#64748b" }}>
                        {fmtDate(row.created_at, false)}
                      </td>
                      <td className="px-4 py-2.5 text-xs" onClick={e => e.stopPropagation()}>
                        {ghlUrl ? (
                          <a
                            href={ghlUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium whitespace-nowrap"
                            style={{ color: "#38bdf8" }}
                          >
                            Open in GHL
                          </a>
                        ) : (
                          <span style={{ color: "#334155" }}>—</span>
                        )}
                      </td>
                    </tr>
                    {open && (
                      <tr style={{ background: "#070f1d" }}>
                        <td colSpan={10} className="px-0 py-0">
                          <div className="px-4 py-3">
                            <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "#475569" }}>
                              Funnel history
                              {row.offer_interest ? (
                                <span className="normal-case font-normal ml-2" style={{ color: "#64748b" }}>
                                  · Offer interest: {row.offer_interest}
                                </span>
                              ) : null}
                              {row.converted_client_id ? (
                                <span className="normal-case font-normal ml-2" style={{ color: "#64748b" }}>
                                  · Includes post-close client calls
                                </span>
                              ) : null}
                            </p>
                            <table className="w-full">
                              <thead>
                                <tr>
                                  {["When", "Event", "Details", "Recording"].map(h => (
                                    <th
                                      key={h}
                                      className="px-4 py-2 text-left text-[10px] font-semibold uppercase tracking-wider"
                                      style={{ color: "#334155" }}
                                    >
                                      {h}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {row.timeline.length === 0 ? (
                                  <tr>
                                    <td colSpan={4} className="px-4 py-4 text-xs" style={{ color: "#334155" }}>
                                      No activity recorded
                                    </td>
                                  </tr>
                                ) : (
                                  row.timeline.map(item => <TimelineRow key={item.id} item={item} />)
                                )}
                              </tbody>
                            </table>
                          </div>
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
        <div className="flex items-center justify-center gap-4">
          <button
            type="button"
            disabled={page <= 1 || loading}
            onClick={() => setPage(p => Math.max(1, p - 1))}
            className="px-4 py-2 rounded-lg text-sm disabled:opacity-40"
            style={{ background: "#0f2040", border: "1px solid rgba(255,255,255,0.12)", color: "#94a3b8" }}
          >
            Previous
          </button>
          <span className="text-sm" style={{ color: "#64748b" }}>
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages || loading}
            onClick={() => setPage(p => p + 1)}
            className="px-4 py-2 rounded-lg text-sm disabled:opacity-40"
            style={{ background: "#0f2040", border: "1px solid rgba(255,255,255,0.12)", color: "#94a3b8" }}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

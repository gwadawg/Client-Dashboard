"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  CALL_CENTER_TIMEZONE,
  LIBRARY_SOP_LINK_LABELS,
  librarySlugsForTemplate,
  type TeamMeetingInstanceView,
} from "@/lib/team-meetings";
import {
  CS_CALL_TYPES,
  csCallTypeLabel,
  type CsAppointmentEnriched,
  type CsCalendarConfig,
  type CsCallType,
} from "@/lib/cs-appointments";
import { commitmentModeForTemplateSlug } from "@/lib/meeting-commitments";
import { weekPlanModeForTemplateSlug } from "@/lib/account-week-plans";
import MeetingCommitmentsPanel from "@/components/MeetingCommitmentsPanel";
import AccountWeekPlanForm from "@/components/AccountWeekPlanForm";
import AccountWeekPlansWeekList from "@/components/AccountWeekPlansWeekList";

const fieldStyle = {
  background: "#0f2040",
  border: "1px solid rgba(255,255,255,0.12)",
  color: "#e2e8f0",
  borderRadius: "0.5rem",
  padding: "0.5rem 0.75rem",
  fontSize: "0.875rem",
  outline: "none",
  width: "100%",
} as const;

const STATUS_COLOR: Record<string, string> = {
  scheduled: "#64748b",
  in_progress: "#60a5fa",
  completed: "#34d399",
  skipped: "#fbbf24",
  cancelled: "#f87171",
  no_show: "#f97316",
};

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: CALL_CENTER_TIMEZONE,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDayKey(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: CALL_CENTER_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function dayHeading(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    timeZone: CALL_CENTER_TIMEZONE,
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

function formatClock(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    timeZone: CALL_CENTER_TIMEZONE,
    hour: "numeric",
    minute: "2-digit",
  });
}

type WhenFilter = "upcoming" | "history" | "all";
type KindFilter = "all" | "team" | "client";

const KIND_LABEL: Record<KindFilter, string> = {
  all: "Together",
  team: "Team",
  client: "Client CS",
};

const WHEN_LABEL: Record<WhenFilter, string> = {
  upcoming: "Upcoming",
  history: "History",
  all: "All",
};

const KIND_RAIL: Record<"team" | "client", string> = {
  team: "#F5C842",
  client: "#4FA3FF",
};

function isUpcomingItem(item: CalendarListItem): boolean {
  if (item.kind === "team") {
    return item.status === "scheduled" || item.status === "in_progress";
  }
  return item.status === "scheduled";
}

function matchesWhen(item: CalendarListItem, when: WhenFilter): boolean {
  if (when === "all") return true;
  if (when === "upcoming") return isUpcomingItem(item);
  return !isUpcomingItem(item);
}

type CalendarListItem =
  | {
      key: string;
      kind: "team";
      scheduled_at: string;
      status: string;
      title: string;
      subtitle: string;
      meeting: TeamMeetingInstanceView;
    }
  | {
      key: string;
      kind: "client";
      scheduled_at: string;
      status: string;
      title: string;
      subtitle: string;
      appointment: CsAppointmentEnriched;
    };

type Props = {
  from: string;
  to: string;
};

export default function TeamMeetings({ from, to }: Props) {
  const [teamRows, setTeamRows] = useState<TeamMeetingInstanceView[]>([]);
  const [clientRows, setClientRows] = useState<CsAppointmentEnriched[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [whenFilter, setWhenFilter] = useState<WhenFilter>("upcoming");
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [showCalConfig, setShowCalConfig] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ from, to });
    Promise.all([
      fetch(`/api/team-meetings?${params}`).then(async r => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "Failed to load team meetings");
        return (d.rows ?? []) as TeamMeetingInstanceView[];
      }),
      fetch(`/api/cs-appointments?${params}`).then(async r => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "Failed to load client calls");
        return (d.appointments ?? []) as CsAppointmentEnriched[];
      }),
    ])
      .then(([team, client]) => {
        setTeamRows(team);
        setClientRows(client);
        setError(null);
      })
      .catch(e => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [from, to]);

  useEffect(() => {
    load();
  }, [load, reloadKey]);

  const items = useMemo((): CalendarListItem[] => {
    const teamItems: CalendarListItem[] = teamRows.map(m => ({
      key: `team:${m.id}`,
      kind: "team" as const,
      scheduled_at: m.scheduled_at,
      status: m.status,
      title: m.template.title,
      subtitle: m.template.theme,
      meeting: m,
    }));
    const clientItems: CalendarListItem[] = clientRows.map(a => ({
      key: `client:${a.id}`,
      kind: "client" as const,
      scheduled_at: a.scheduled_at,
      status: a.status,
      title: a.client_name ?? `Unmapped · ${a.clickup_task_id}`,
      subtitle: `${csCallTypeLabel(a.call_type)}${a.calendar_name ? ` · ${a.calendar_name}` : ""}`,
      appointment: a,
    }));
    return [...teamItems, ...clientItems].sort(
      (a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime(),
    );
  }, [teamRows, clientRows]);

  const filtered = useMemo(() => {
    return items.filter(item => {
      if (kindFilter !== "all" && item.kind !== kindFilter) return false;
      return matchesWhen(item, whenFilter);
    });
  }, [items, kindFilter, whenFilter]);

  const kindCounts = useMemo(() => {
    const inWhen = items.filter(item => matchesWhen(item, whenFilter));
    return {
      all: inWhen.length,
      team: inWhen.filter(i => i.kind === "team").length,
      client: inWhen.filter(i => i.kind === "client").length,
    };
  }, [items, whenFilter]);

  const whenCounts = useMemo(() => {
    const inKind = kindFilter === "all" ? items : items.filter(i => i.kind === kindFilter);
    return {
      upcoming: inKind.filter(i => isUpcomingItem(i)).length,
      history: inKind.filter(i => !isUpcomingItem(i)).length,
      all: inKind.length,
    };
  }, [items, kindFilter]);

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarListItem[]>();
    for (const row of filtered) {
      const key = formatDayKey(row.scheduled_at);
      const list = map.get(key) ?? [];
      list.push(row);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [filtered]);

  const selected = useMemo(
    () => items.find(r => r.key === selectedKey) ?? null,
    [items, selectedKey],
  );

  const unmappedCount = clientRows.filter(r => !r.client_id).length;
  const skippedCount = teamRows.filter(r => r.status === "skipped").length;

  const filtersActive = kindFilter !== "all" || whenFilter !== "all";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2
            className="text-lg font-semibold text-slate-100"
            style={{ fontFamily: "var(--font-display), system-ui, sans-serif", letterSpacing: "-0.02em" }}
          >
            Calendars
          </h2>
          <p className="text-sm text-slate-400">
            One board · São Paulo time · team runbooks + client onboarding / launch / check-in
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCalConfig(v => !v)}
          className="rounded-md px-3 py-1.5 text-xs font-medium shrink-0"
          style={{
            background: showCalConfig ? "rgba(79,163,255,0.16)" : "transparent",
            border: "1px solid rgba(255,255,255,0.14)",
            color: showCalConfig ? "#93c5fd" : "#94a3b8",
          }}
        >
          {showCalConfig ? "Close GHL IDs" : "Register GHL IDs"}
        </button>
      </div>

      <div
        className="flex flex-wrap items-end gap-5 rounded-xl px-4 py-3"
        style={{
          background:
            "linear-gradient(180deg, rgba(14,47,115,0.22), rgba(11,18,32,0.55))",
          border: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <FilterCluster label="Calendar">
          {(
            [
              ["all", KIND_LABEL.all, kindCounts.all],
              ["team", KIND_LABEL.team, kindCounts.team],
              ["client", KIND_LABEL.client, kindCounts.client],
            ] as const
          ).map(([key, label, count]) => (
            <FilterOption
              key={key}
              selected={kindFilter === key}
              onClick={() => setKindFilter(key)}
              hint={
                key === "all"
                  ? "Team meetings and client CS calls, interleaved by time"
                  : key === "team"
                    ? "Internal runbooks only"
                    : "GHL onboarding, launch, and check-in only"
              }
            >
              {label}
              <span
                className="ml-1.5 tabular-nums"
                style={{
                  fontFamily: "var(--font-data), ui-monospace, monospace",
                  fontSize: "10px",
                  color: kindFilter === key ? "#7CFF7A" : "#64748b",
                }}
              >
                {count}
              </span>
            </FilterOption>
          ))}
        </FilterCluster>

        <span
          className="hidden sm:block w-px self-stretch"
          style={{ background: "rgba(255,255,255,0.08)", minHeight: "2.5rem" }}
          aria-hidden
        />

        <FilterCluster label="When">
          {(
            [
              ["upcoming", WHEN_LABEL.upcoming, whenCounts.upcoming],
              ["history", WHEN_LABEL.history, whenCounts.history],
              ["all", WHEN_LABEL.all, whenCounts.all],
            ] as const
          ).map(([key, label, count]) => (
            <FilterOption
              key={key}
              selected={whenFilter === key}
              onClick={() => setWhenFilter(key)}
              hint={
                key === "upcoming"
                  ? "Still on the plate (scheduled or in progress)"
                  : key === "history"
                    ? "Completed, skipped, cancelled, or no-show"
                    : "Everything in the date range"
              }
            >
              {label}
              <span
                className="ml-1.5 tabular-nums"
                style={{
                  fontFamily: "var(--font-data), ui-monospace, monospace",
                  fontSize: "10px",
                  color: whenFilter === key ? "#7CFF7A" : "#64748b",
                }}
              >
                {count}
              </span>
            </FilterOption>
          ))}
        </FilterCluster>
      </div>

      {showCalConfig && (
        <CsCalendarsConfigPanel
          onChanged={() => {
            /* appointments only appear after Make posts; list stays as-is */
          }}
        />
      )}

      {(unmappedCount > 0 || skippedCount > 0) && (
        <p className="text-xs text-slate-400">
          {unmappedCount > 0 && (
            <span className="text-amber-300/90">
              {unmappedCount} client call{unmappedCount === 1 ? "" : "s"} unmapped to a roster ClickUp ID
            </span>
          )}
          {unmappedCount > 0 && skippedCount > 0 ? " · " : null}
          {skippedCount > 0 && (
            <span className="text-amber-300/90">
              {skippedCount} team meeting{skippedCount === 1 ? "" : "s"} skipped in this range
            </span>
          )}
        </p>
      )}

      {error && (
        <p className="text-sm text-red-300 rounded-md px-3 py-2" style={{ background: "rgba(248,113,113,0.1)" }}>
          {error}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div
          className="rounded-xl overflow-hidden"
          style={{ border: "1px solid rgba(255,255,255,0.08)", background: "rgba(15,23,42,0.6)" }}
        >
          {loading ? (
            <p className="text-sm text-slate-500 p-6">Loading calendars…</p>
          ) : byDay.length === 0 ? (
            <div className="px-5 py-8 space-y-3">
              <p className="text-sm text-slate-300">
                {items.length === 0
                  ? kindFilter === "client"
                    ? "No client CS calls in this date range."
                    : kindFilter === "team"
                      ? "No team meetings in this date range."
                      : "Nothing on the board for this date range."
                  : `No ${KIND_LABEL[kindFilter].toLowerCase()} ${WHEN_LABEL[whenFilter].toLowerCase()} events.`}
              </p>
              <p className="text-xs text-slate-500">
                {items.length === 0 && kindFilter !== "team"
                  ? "If Make is still returning unknown calendar_id, register the GHL ID above."
                  : filtersActive
                    ? "Filters are hiding rows that exist in this range."
                    : "Change the dashboard date range to look at another week."}
              </p>
              {filtersActive && items.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {whenFilter === "upcoming" && whenCounts.history > 0 && (
                    <button
                      type="button"
                      onClick={() => setWhenFilter("history")}
                      className="text-xs rounded-md px-2.5 py-1.5"
                      style={{ border: "1px solid rgba(255,255,255,0.14)", color: "#93c5fd" }}
                    >
                      Show history ({whenCounts.history})
                    </button>
                  )}
                  {whenFilter === "history" && whenCounts.upcoming > 0 && (
                    <button
                      type="button"
                      onClick={() => setWhenFilter("upcoming")}
                      className="text-xs rounded-md px-2.5 py-1.5"
                      style={{ border: "1px solid rgba(255,255,255,0.14)", color: "#93c5fd" }}
                    >
                      Show upcoming ({whenCounts.upcoming})
                    </button>
                  )}
                  {(kindFilter !== "all" || whenFilter !== "all") && (
                    <button
                      type="button"
                      onClick={() => {
                        setKindFilter("all");
                        setWhenFilter("all");
                      }}
                      className="text-xs rounded-md px-2.5 py-1.5"
                      style={{ border: "1px solid rgba(255,255,255,0.14)", color: "#cbd5e1" }}
                    >
                      Show everything ({items.length})
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : (
            byDay.map(([day, list]) => (
              <div key={day}>
                <div
                  className="px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500"
                  style={{
                    borderBottom: "1px solid rgba(255,255,255,0.06)",
                    background: "rgba(6,26,74,0.35)",
                  }}
                >
                  {dayHeading(list[0].scheduled_at)}
                </div>
                <ul>
                  {list.map(row => (
                    <li key={row.key}>
                      <button
                        type="button"
                        onClick={() => setSelectedKey(row.key)}
                        className="w-full text-left px-3 py-2.5 flex items-stretch gap-3 hover:bg-white/[0.03]"
                        style={{
                          borderBottom: "1px solid rgba(255,255,255,0.05)",
                          background:
                            selectedKey === row.key ? "rgba(79,163,255,0.08)" : "transparent",
                        }}
                      >
                        <span
                          className="w-0.5 shrink-0 rounded-full self-stretch"
                          style={{ background: KIND_RAIL[row.kind] }}
                          aria-hidden
                        />
                        <span
                          className="w-[4.5rem] shrink-0 pt-0.5 text-sm tabular-nums text-slate-200"
                          style={{ fontFamily: "var(--font-data), ui-monospace, monospace" }}
                        >
                          {formatClock(row.scheduled_at)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-baseline gap-2 min-w-0">
                            <span
                              className="text-[10px] font-semibold uppercase tracking-[0.12em] shrink-0"
                              style={{ color: KIND_RAIL[row.kind] }}
                            >
                              {row.kind === "client" ? "Client" : "Team"}
                            </span>
                            <span className="text-sm text-slate-100 truncate">{row.title}</span>
                          </span>
                          <span className="block text-xs text-slate-500 truncate mt-0.5">
                            {row.subtitle}
                          </span>
                        </span>
                        <span
                          className="text-[10px] uppercase tracking-wide shrink-0 pt-1"
                          style={{ color: STATUS_COLOR[row.status] ?? "#64748b" }}
                        >
                          {row.status.replace("_", " ")}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>

        <div>
          {selected?.kind === "team" ? (
            <TeamMeetingRunbook
              key={selected.meeting.id}
              initial={selected.meeting}
              onChanged={() => setReloadKey(k => k + 1)}
            />
          ) : selected?.kind === "client" ? (
            <ClientCsCallDetail appointment={selected.appointment} />
          ) : (
            <div
              className="rounded-xl p-8 text-sm text-slate-500"
              style={{ border: "1px solid rgba(255,255,255,0.08)", background: "rgba(15,23,42,0.4)" }}
            >
              Open a row to run a team meeting or see a client CS call.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FilterCluster({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <span
        className="text-[10px] font-semibold uppercase tracking-[0.18em]"
        style={{ color: "#64748b" }}
      >
        {label}
      </span>
      <div
        role="radiogroup"
        aria-label={label}
        className="flex flex-wrap rounded-lg p-0.5"
        style={{
          background: "rgba(8,15,30,0.85)",
          border: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function FilterOption({
  selected,
  onClick,
  children,
  hint,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      title={hint}
      onClick={onClick}
      className="rounded-md px-2.5 py-1.5 text-xs font-medium whitespace-nowrap"
      style={{
        background: selected ? "rgba(79,163,255,0.18)" : "transparent",
        color: selected ? "#e2e8f0" : "#94a3b8",
        boxShadow: selected ? "inset 0 0 0 1px rgba(79,163,255,0.35)" : "none",
      }}
    >
      {children}
    </button>
  );
}

function ClientCsCallDetail({ appointment }: { appointment: CsAppointmentEnriched }) {
  const mapped = !!appointment.client_id;
  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ border: "1px solid rgba(255,255,255,0.08)", background: "rgba(15,23,42,0.75)" }}
    >
      <div className="px-4 py-4 space-y-1" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-sky-400/90 mb-1">Client CS call</p>
            <h3 className="text-base font-semibold text-slate-100">
              {appointment.client_name ?? "Unmapped client"}
            </h3>
            <p className="text-xs text-slate-400">{csCallTypeLabel(appointment.call_type)}</p>
          </div>
          <span className="text-[10px] uppercase" style={{ color: STATUS_COLOR[appointment.status] }}>
            {appointment.status.replace("_", " ")}
          </span>
        </div>
        <p className="text-xs text-slate-500">{formatWhen(appointment.scheduled_at)}</p>
      </div>

      <div className="px-4 py-4 space-y-3 text-sm">
        <Row label="Calendar" value={appointment.calendar_name ?? appointment.calendar_id} />
        <Row label="Calendar ID" value={appointment.calendar_id} mono />
        <Row label="ClickUp task" value={appointment.clickup_task_id} mono />
        <Row label="GHL appointment" value={appointment.ghl_appointment_id} mono />
        {appointment.assigned_to && <Row label="Assigned" value={appointment.assigned_to} />}
        {appointment.title && <Row label="Title" value={appointment.title} />}
        {!mapped && (
          <p
            className="text-xs text-amber-200/90 rounded-md px-3 py-2"
            style={{ background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.25)" }}
          >
            No roster client shares this ClickUp task ID. Appointments still sync — set{" "}
            <code className="text-amber-100">clickup_task_id</code> on the client to map them.
          </p>
        )}
        <p className="text-xs text-slate-500 pt-2">
          Notes and recordings for completed CS work live on the client file (Calls & notes). This board
          is the scheduled GHL calendar feed.
        </p>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
      <span className="text-xs uppercase tracking-wide text-slate-500 shrink-0 sm:w-28">{label}</span>
      <span className={`text-slate-200 break-all ${mono ? "font-mono text-xs" : ""}`}>{value}</span>
    </div>
  );
}

function CsCalendarsConfigPanel({ onChanged }: { onChanged?: () => void }) {
  const [calendars, setCalendars] = useState<CsCalendarConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [calendarId, setCalendarId] = useState("");
  const [calendarName, setCalendarName] = useState("");
  const [callType, setCallType] = useState<CsCallType>("checkin");
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/cs-calendars")
      .then(async r => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "Failed to load calendars");
        setCalendars(d.calendars ?? []);
        setError(null);
      })
      .catch(e => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/cs-calendars", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          calendar_id: calendarId.trim(),
          calendar_name: calendarName.trim(),
          call_type: callType,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Save failed");
      setCalendarId("");
      setCalendarName("");
      setMessage("Calendar registered — Make can post this calendar_id now.");
      load();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm(`Remove calendar ${id}? Incoming Make events for this ID will 400 until re-added.`)) {
      return;
    }
    setError(null);
    try {
      const res = await fetch(`/api/cs-calendars?calendar_id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Delete failed");
      load();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  return (
    <div
      className="rounded-xl p-4 space-y-3"
      style={{ border: "1px solid rgba(56,189,248,0.2)", background: "rgba(14,116,144,0.08)" }}
    >
      <div>
        <h3 className="text-sm font-semibold text-slate-100">Register GHL calendar IDs</h3>
        <p className="text-xs text-slate-400 mt-0.5">
          This is setup, not a filter. Paste onboarding / launch / check-in calendar IDs so Make
          webhooks are accepted.
        </p>
      </div>

      {loading ? (
        <p className="text-xs text-slate-500">Loading…</p>
      ) : calendars.length === 0 ? (
        <p className="text-xs text-slate-500">No calendars registered yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {calendars.map(c => (
            <li
              key={c.calendar_id}
              className="flex flex-wrap items-center justify-between gap-2 text-xs rounded-md px-2.5 py-2"
              style={{ background: "rgba(15,23,42,0.55)", border: "1px solid rgba(255,255,255,0.06)" }}
            >
              <div className="min-w-0">
                <span className="text-slate-200 font-medium">{c.calendar_name}</span>
                <span className="text-slate-500"> · {csCallTypeLabel(c.call_type)}</span>
                <span className="block font-mono text-slate-400 truncate">{c.calendar_id}</span>
              </div>
              <button
                type="button"
                onClick={() => remove(c.calendar_id)}
                className="text-red-300/90 hover:text-red-200 shrink-0"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={save} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto] items-end">
        <label className="block space-y-1">
          <span className="text-[11px] text-slate-400">Calendar ID</span>
          <input
            required
            value={calendarId}
            onChange={e => setCalendarId(e.target.value)}
            placeholder="p26ULHRnyCdvIRv6odOZ"
            style={fieldStyle}
            className="font-mono"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-[11px] text-slate-400">Display name</span>
          <input
            required
            value={calendarName}
            onChange={e => setCalendarName(e.target.value)}
            placeholder="CHECK IN CALL"
            style={fieldStyle}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-[11px] text-slate-400">Type</span>
          <select
            value={callType}
            onChange={e => setCallType(e.target.value as CsCallType)}
            style={{ ...fieldStyle, width: "auto", minWidth: "8rem" }}
          >
            {CS_CALL_TYPES.map(t => (
              <option key={t} value={t}>
                {csCallTypeLabel(t)}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={saving}
          className="rounded-md px-3 py-2 text-sm font-medium text-slate-950"
          style={{ background: "#38bdf8", height: "2.5rem" }}
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </form>

      {error && <p className="text-xs text-red-300">{error}</p>}
      {message && <p className="text-xs text-emerald-300">{message}</p>}
    </div>
  );
}

function TeamMeetingRunbook({
  initial,
  onChanged,
}: {
  initial: TeamMeetingInstanceView;
  onChanged: () => void;
}) {
  const [row, setRow] = useState(initial);
  const [checklist, setChecklist] = useState<Record<string, boolean>>(initial.checklist_state ?? {});
  const [responses, setResponses] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(initial.responses ?? {})) {
      if (typeof v === "string") out[k] = v;
    }
    if (initial.recording_url) out.recording_url = initial.recording_url;
    return out;
  });
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [commitmentCount, setCommitmentCount] = useState(0);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const locked = row.status === "completed" || row.status === "cancelled" || row.status === "skipped";
  const commitmentMode = commitmentModeForTemplateSlug(row.template.slug);

  const persistProgress = useCallback(
    (nextChecklist: Record<string, boolean>, nextResponses: Record<string, string>) => {
      if (locked) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        setSaving(true);
        try {
          const res = await fetch(`/api/team-meetings/${row.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              checklist_state: nextChecklist,
              responses: nextResponses,
              recording_url: nextResponses.recording_url ?? "",
            }),
          });
          const d = await res.json();
          if (!res.ok) throw new Error(d.error ?? "Save failed");
          setRow(d.row);
          setError(null);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Save failed");
        } finally {
          setSaving(false);
        }
      }, 400);
    },
    [locked, row.id],
  );

  function toggleCheck(key: string) {
    if (locked) return;
    const next = { ...checklist, [key]: !checklist[key] };
    setChecklist(next);
    persistProgress(next, responses);
  }

  function setResponse(key: string, value: string) {
    if (locked) return;
    const next = { ...responses, [key]: value };
    setResponses(next);
    persistProgress(checklist, next);
  }

  async function submit(action: "complete" | "skip") {
    setSubmitting(true);
    setMessage(null);
    setError(null);
    try {
      if (
        action === "complete" &&
        commitmentMode === "edit" &&
        commitmentCount === 0 &&
        !window.confirm(
          "No commitments logged yet. Complete anyway? (Use an observe row with Why if you’re watching.)",
        )
      ) {
        setSubmitting(false);
        return;
      }
      const res = await fetch(`/api/team-meetings/${row.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          checklist_state: checklist,
          responses,
          recording_url: responses.recording_url ?? "",
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Submit failed");
      setRow(d.row);
      setMessage(action === "skip" ? "Marked skipped." : "Completed — archived to Team Calls.");
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Submit failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ border: "1px solid rgba(255,255,255,0.08)", background: "rgba(15,23,42,0.75)" }}
    >
      <div className="px-4 py-4 space-y-1" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-violet-300/90 mb-1">Team meeting</p>
            <h3 className="text-base font-semibold text-slate-100">{row.template.title}</h3>
            <p className="text-xs text-slate-400">{row.template.theme}</p>
          </div>
          <span className="text-[10px] uppercase" style={{ color: STATUS_COLOR[row.status] }}>
            {row.status.replace("_", " ")}
          </span>
        </div>
        <p className="text-xs text-slate-500">
          {formatWhen(row.scheduled_at)} · {row.template.duration_min} min · host{" "}
          {row.template.host_role}
          {saving ? " · saving…" : ""}
        </p>
      </div>

      <div className="px-4 py-4 space-y-5">
        {(() => {
          const slugs = librarySlugsForTemplate(row.template.slug);
          if (slugs.length === 0) return null;
          return (
            <div className="flex flex-wrap gap-3 text-xs">
              {slugs.map(slug => (
                <a
                  key={slug}
                  href={`/library/${slug}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sky-400 hover:text-sky-300 underline underline-offset-2"
                >
                  {LIBRARY_SOP_LINK_LABELS[slug] ?? slug}
                </a>
              ))}
            </div>
          );
        })()}

        <section>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">
            Live checklist
          </h4>
          <ul className="space-y-2">
            {row.template.checklist.map(item => (
              <li key={item.key}>
                <label className="flex items-start gap-3 cursor-pointer select-none py-1">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4"
                    checked={!!checklist[item.key]}
                    disabled={locked}
                    onChange={() => toggleCheck(item.key)}
                  />
                  <span className="text-sm text-slate-200">
                    {item.label}
                    {item.required ? <span className="text-slate-500"> *</span> : null}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">
            Agenda
          </h4>
          <pre
            className="text-xs text-slate-300 whitespace-pre-wrap font-sans leading-relaxed p-3 rounded-lg"
            style={{ background: "rgba(15,32,64,0.6)", border: "1px solid rgba(255,255,255,0.06)" }}
          >
            {row.template.agenda_md || "—"}
          </pre>
        </section>

        {weekPlanModeForTemplateSlug(row.template.slug) === "intake" && (
          <section
            className="rounded-lg p-3 space-y-2"
            style={{ border: "1px solid rgba(56,189,248,0.2)", background: "rgba(14,116,144,0.08)" }}
          >
            <h4 className="text-xs font-semibold uppercase tracking-wide text-sky-400/90">
              Account week plans (new)
            </h4>
            {!locked && <AccountWeekPlanForm originMeetingId={row.id} compact />}
            {locked && (
              <AccountWeekPlansWeekList originMeetingId={row.id} />
            )}
          </section>
        )}

        {weekPlanModeForTemplateSlug(row.template.slug) === "review" && (
          <section
            className="rounded-lg p-3"
            style={{ border: "1px solid rgba(56,189,248,0.2)", background: "rgba(14,116,144,0.08)" }}
          >
            <h4 className="text-xs font-semibold uppercase tracking-wide text-sky-400/90 mb-2">
              Account week plans (new)
            </h4>
            <AccountWeekPlansWeekList />
          </section>
        )}

        {commitmentMode && (
          <MeetingCommitmentsPanel
            mode={commitmentMode}
            meetingId={row.id}
            locked={locked}
            onCountChange={setCommitmentCount}
          />
        )}

        <section className="space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Disposition
          </h4>
          {(row.template.disposition.length
            ? row.template.disposition
            : [
                { key: "recording_url", label: "Recording URL", required: true, type: "url" as const },
                { key: "summary", label: "Summary", required: true, type: "textarea" as const },
                {
                  key: "participants_present",
                  label: "Who attended",
                  required: true,
                  type: "text" as const,
                },
                { key: "follow_ups", label: "Follow-ups", required: false, type: "textarea" as const },
                {
                  key: "skipped_reason",
                  label: "Skip reason",
                  required: false,
                  type: "textarea" as const,
                },
              ]
          ).map(field => (
            <label key={field.key} className="block space-y-1">
              <span className="text-xs text-slate-400">
                {field.label}
                {field.required ? " *" : ""}
              </span>
              {field.type === "textarea" ? (
                <textarea
                  rows={3}
                  style={fieldStyle}
                  disabled={locked}
                  value={responses[field.key] ?? ""}
                  onChange={e => setResponse(field.key, e.target.value)}
                />
              ) : (
                <input
                  type={field.type === "url" ? "url" : "text"}
                  style={fieldStyle}
                  disabled={locked}
                  value={responses[field.key] ?? ""}
                  onChange={e => setResponse(field.key, e.target.value)}
                  placeholder={field.key === "recording_url" ? "https://…" : undefined}
                />
              )}
            </label>
          ))}
        </section>

        {error && <p className="text-sm text-red-300">{error}</p>}
        {message && <p className="text-sm text-emerald-300">{message}</p>}

        {!locked && (
          <div
            className="flex flex-wrap gap-2 sticky bottom-0 pt-2 pb-1"
            style={{ background: "linear-gradient(transparent, rgba(15,23,42,0.95) 30%)" }}
          >
            <button
              type="button"
              disabled={submitting}
              onClick={() => submit("complete")}
              className="rounded-md px-4 py-2.5 text-sm font-medium text-slate-950"
              style={{ background: "#34d399" }}
            >
              {submitting ? "Saving…" : "Complete"}
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => submit("skip")}
              className="rounded-md px-4 py-2.5 text-sm text-slate-200"
              style={{ background: "rgba(251,191,36,0.15)", border: "1px solid rgba(251,191,36,0.35)" }}
            >
              Skip
            </button>
          </div>
        )}

        {row.team_call_id && (
          <p className="text-xs text-slate-500">
            Linked Team Call: <code className="text-slate-400">{row.team_call_id}</code>
          </p>
        )}
      </div>
    </div>
  );
}

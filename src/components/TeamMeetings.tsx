"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CALL_CENTER_TIMEZONE,
  LIBRARY_SOP_LINK_LABELS,
  librarySlugsForTemplate,
  type TeamMeetingInstanceView,
} from "@/lib/team-meetings";
import { commitmentModeForTemplateSlug } from "@/lib/meeting-commitments";
import MeetingCommitmentsPanel from "@/components/MeetingCommitmentsPanel";

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

type Filter = "all" | "upcoming" | "in_progress" | "completed" | "skipped";

type Props = {
  from: string;
  to: string;
};

export default function TeamMeetings({ from, to }: Props) {
  const [rows, setRows] = useState<TeamMeetingInstanceView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ from, to });
    fetch(`/api/team-meetings?${params}`)
      .then(async r => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "Failed to load");
        setRows(d.rows ?? []);
        setError(null);
      })
      .catch(e => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [from, to]);

  useEffect(() => {
    load();
  }, [load, reloadKey]);

  const selected = useMemo(
    () => rows.find(r => r.id === selectedId) ?? null,
    [rows, selectedId],
  );

  const filtered = useMemo(() => {
    if (filter === "all") return rows;
    if (filter === "upcoming") {
      return rows.filter(r => r.status === "scheduled" || r.status === "in_progress");
    }
    return rows.filter(r => r.status === filter);
  }, [rows, filter]);

  const byDay = useMemo(() => {
    const map = new Map<string, TeamMeetingInstanceView[]>();
    for (const row of filtered) {
      const key = formatDayKey(row.scheduled_at);
      const list = map.get(key) ?? [];
      list.push(row);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [filtered]);

  const skippedCount = rows.filter(r => r.status === "skipped").length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">Team Meetings</h2>
          <p className="text-sm text-slate-400">
            Q3 runbooks · times in São Paulo · open linked SOPs from Mon/Thu KPI
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          {(
            [
              ["all", "All"],
              ["upcoming", "Upcoming"],
              ["in_progress", "In progress"],
              ["completed", "Done"],
              ["skipped", "Skipped"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className="rounded-md px-2.5 py-1.5"
              style={{
                background: filter === key ? "rgba(96,165,250,0.2)" : "rgba(15,32,64,0.8)",
                border: "1px solid rgba(255,255,255,0.12)",
                color: filter === key ? "#93c5fd" : "#94a3b8",
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {skippedCount > 0 && (
        <p className="text-xs text-amber-300/90">
          {skippedCount} skipped this window — leadership smell if this piles up.
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
            <p className="text-sm text-slate-500 p-6">Loading meetings…</p>
          ) : byDay.length === 0 ? (
            <p className="text-sm text-slate-500 p-6">No meetings in this range.</p>
          ) : (
            byDay.map(([day, list]) => (
              <div key={day}>
                <div
                  className="px-4 py-2 text-xs font-medium uppercase tracking-wide text-slate-400"
                  style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
                >
                  {dayHeading(list[0].scheduled_at)}
                </div>
                <ul>
                  {list.map(row => (
                    <li key={row.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(row.id)}
                        className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-white/[0.03]"
                        style={{
                          borderBottom: "1px solid rgba(255,255,255,0.05)",
                          background:
                            selectedId === row.id ? "rgba(96,165,250,0.08)" : "transparent",
                        }}
                      >
                        <span
                          className="mt-1.5 h-2 w-2 rounded-full shrink-0"
                          style={{ background: STATUS_COLOR[row.status] ?? "#64748b" }}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm text-slate-100">{row.template.title}</span>
                          <span className="block text-xs text-slate-400 truncate">
                            {formatWhen(row.scheduled_at)} · {row.template.theme}
                          </span>
                        </span>
                        <span
                          className="text-[10px] uppercase tracking-wide shrink-0"
                          style={{ color: STATUS_COLOR[row.status] }}
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
          {selected ? (
            <TeamMeetingRunbook
              key={selected.id}
              initial={selected}
              onChanged={() => setReloadKey(k => k + 1)}
            />
          ) : (
            <div
              className="rounded-xl p-8 text-sm text-slate-500"
              style={{ border: "1px solid rgba(255,255,255,0.08)", background: "rgba(15,23,42,0.4)" }}
            >
              Open a meeting to run the checklist and disposition the call.
            </div>
          )}
        </div>
      </div>
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

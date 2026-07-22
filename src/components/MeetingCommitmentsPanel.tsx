"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { MeetingCommitment } from "@/lib/meeting-commitments";
import { todayYmdInCallCenterTz } from "@/lib/time";
import { addDaysToYmd } from "@/lib/team-meetings";

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

type ClientOpt = { id: string; name: string };

type Mode = "edit" | "check" | "approve";

type Props = {
  mode: Mode;
  meetingId: string;
  locked?: boolean;
  onCountChange?: (count: number) => void;
};

const OWNER_OPTIONS = [
  { value: "client_success", label: "Client Success" },
  { value: "media_buyer", label: "Media Buyer" },
  { value: "ccm", label: "CCM" },
  { value: "ops", label: "Ops" },
  { value: "founder", label: "Founder" },
];

function defaultDueThursday(): string {
  const today = todayYmdInCallCenterTz();
  const [y, m, d] = today.split("-").map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d, 15, 0, 0));
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    weekday: "short",
  }).format(probe);
  const map: Record<string, number> = {
    Mon: 0,
    Tue: 1,
    Wed: 2,
    Thu: 3,
    Fri: 4,
    Sat: 5,
    Sun: 6,
  };
  const offset = map[weekday] ?? 0;
  const monday = addDaysToYmd(today, -offset);
  return addDaysToYmd(monday, 3);
}

const emptyForm = () => ({
  client_id: "",
  severity: "below" as const,
  why: "",
  constraint_type: "quality" as const,
  constraint_label: "",
  plan: "",
  owner_role: "client_success",
  due_date: defaultDueThursday(),
  needs_founder: false,
  founder_ask: "",
  success_signal: "",
});

export default function MeetingCommitmentsPanel({
  mode,
  meetingId,
  locked = false,
  onCountChange,
}: Props) {
  const [rows, setRows] = useState<MeetingCommitment[]>([]);
  const [clients, setClients] = useState<ClientOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [showFullWeek, setShowFullWeek] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [noteById, setNoteById] = useState<Record<string, string>>({});
  const [clickupById, setClickupById] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let url = `/api/meeting-commitments?meeting_id=${encodeURIComponent(meetingId)}`;
      if (mode === "approve") {
        url = showFullWeek
          ? `/api/meeting-commitments?view=open_week`
          : `/api/meeting-commitments?view=needs_founder`;
      } else if (mode === "check") {
        url = `/api/meeting-commitments?view=open_week`;
      } else if (mode === "edit") {
        // Show rows originated or touched in this meeting, plus open week for context
        const [histRes, weekRes] = await Promise.all([
          fetch(`/api/meeting-commitments?meeting_id=${encodeURIComponent(meetingId)}`),
          fetch(`/api/meeting-commitments?view=open_week`),
        ]);
        const hist = await histRes.json();
        const week = await weekRes.json();
        if (!histRes.ok) throw new Error(hist.error ?? "Failed to load");
        if (!weekRes.ok) throw new Error(week.error ?? "Failed to load");
        const byId = new Map<string, MeetingCommitment>();
        for (const r of [...(week.rows ?? []), ...(hist.rows ?? [])] as MeetingCommitment[]) {
          byId.set(r.id, r);
        }
        const merged = [...byId.values()];
        setRows(merged);
        onCountChange?.(merged.length);
        setLoading(false);
        return;
      }

      const res = await fetch(url);
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Failed to load");
      const list = (d.rows ?? []) as MeetingCommitment[];
      setRows(list);
      onCountChange?.(list.length);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [meetingId, mode, showFullWeek, onCountChange]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (mode !== "edit") return;
    fetch("/api/clients")
      .then(async r => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "clients");
        setClients((d.clients ?? []).map((c: { id: string; name: string }) => ({
          id: c.id,
          name: c.name,
        })));
      })
      .catch(() => setClients([]));
  }, [mode]);

  const title = useMemo(() => {
    if (mode === "approve") return showFullWeek ? "Week plan (all open)" : "Needs Founder";
    if (mode === "check") return "Open commitments";
    return "Commitments";
  }, [mode, showFullWeek]);

  async function createRow() {
    setSaving(true);
    setWarning(null);
    setError(null);
    try {
      const res = await fetch("/api/meeting-commitments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          meeting_id: meetingId,
          founder_ask: form.needs_founder ? form.founder_ask : null,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Create failed");
      if (d.warning) setWarning(d.warning);
      setForm(emptyForm());
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create failed");
    } finally {
      setSaving(false);
    }
  }

  async function patchStatus(
    id: string,
    status: string,
    extras?: { founder_note?: string; check_note?: string; clickup_url?: string },
  ) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/meeting-commitments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          meeting_id: meetingId,
          ...extras,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Update failed");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setSaving(false);
    }
  }

  async function saveClickup(id: string) {
    const url = clickupById[id]?.trim() ?? "";
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/meeting-commitments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clickup_url: url,
          status: "in_progress",
          meeting_id: meetingId,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Update failed");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          {title}
        </h4>
        {mode === "approve" && (
          <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
            <input
              type="checkbox"
              checked={showFullWeek}
              onChange={e => setShowFullWeek(e.target.checked)}
            />
            Show full week plan
          </label>
        )}
      </div>

      {loading && <p className="text-xs text-slate-500">Loading commitments…</p>}
      {error && <p className="text-sm text-red-300">{error}</p>}
      {warning && <p className="text-sm text-amber-300">{warning}</p>}

      {!loading && rows.length === 0 && mode === "approve" && !showFullWeek && (
        <p className="text-sm text-emerald-300/90">Nothing needs founder.</p>
      )}
      {!loading && rows.length === 0 && mode !== "approve" && (
        <p className="text-xs text-slate-500">No commitments yet.</p>
      )}

      <ul className="space-y-3">
        {rows.map(r => (
          <li
            key={r.id}
            className="rounded-lg p-3 space-y-2"
            style={{
              background: "rgba(15,32,64,0.6)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <div className="flex flex-wrap items-baseline gap-2 justify-between">
              <div>
                <span className="text-sm font-medium text-slate-100">
                  {r.client_name ?? r.client_id.slice(0, 8)}
                </span>
                <span className="text-[10px] uppercase ml-2 text-slate-500">
                  {r.severity} · {r.status.replace(/_/g, " ")}
                  {r.needs_founder ? " · needs founder" : ""}
                </span>
              </div>
              <span className="text-[10px] text-slate-500">due {r.due_date}</span>
            </div>
            <p className="text-xs text-slate-300">
              <span className="text-slate-500">Why:</span> {r.why}
            </p>
            <p className="text-xs text-slate-300">
              <span className="text-slate-500">Constraint:</span> {r.constraint_type} /{" "}
              {r.constraint_label}
            </p>
            <p className="text-xs text-slate-300">
              <span className="text-slate-500">Plan:</span> {r.plan}{" "}
              <span className="text-slate-500">({r.owner_role})</span>
            </p>
            {r.needs_founder && r.founder_ask && (
              <p className="text-xs text-amber-200/90">
                <span className="text-amber-400/80">Ask:</span> {r.founder_ask}
              </p>
            )}
            {r.founder_note && (
              <p className="text-xs text-slate-400">Founder note: {r.founder_note}</p>
            )}
            {r.clickup_url && (
              <p className="text-xs">
                <a
                  href={r.clickup_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sky-400 underline"
                >
                  ClickUp task
                </a>
              </p>
            )}

            {mode === "approve" &&
              r.needs_founder &&
              (r.status === "proposed" || r.status === "needs_clarification") &&
              !locked && (
                <div className="space-y-2 pt-1">
                  <input
                    style={fieldStyle}
                    placeholder="Note / question (required for reject / clarify)"
                    value={noteById[r.id] ?? ""}
                    onChange={e =>
                      setNoteById(prev => ({ ...prev, [r.id]: e.target.value }))
                    }
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => patchStatus(r.id, "approved")}
                      className="rounded-md px-3 py-1.5 text-xs font-medium text-slate-950"
                      style={{ background: "#34d399" }}
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() =>
                        patchStatus(r.id, "needs_clarification", {
                          founder_note: noteById[r.id] ?? "",
                        })
                      }
                      className="rounded-md px-3 py-1.5 text-xs text-slate-200"
                      style={{
                        background: "rgba(251,191,36,0.15)",
                        border: "1px solid rgba(251,191,36,0.35)",
                      }}
                    >
                      Needs clarification
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() =>
                        patchStatus(r.id, "rejected", {
                          founder_note: noteById[r.id] ?? "",
                        })
                      }
                      className="rounded-md px-3 py-1.5 text-xs text-red-200"
                      style={{
                        background: "rgba(248,113,113,0.12)",
                        border: "1px solid rgba(248,113,113,0.35)",
                      }}
                    >
                      Reject
                    </button>
                  </div>
                </div>
              )}

            {mode === "check" && !locked && !["landed", "rejected", "cancelled"].includes(r.status) && (
              <div className="space-y-2 pt-1">
                <input
                  style={fieldStyle}
                  placeholder="Check note (optional)"
                  value={noteById[r.id] ?? ""}
                  onChange={e =>
                    setNoteById(prev => ({ ...prev, [r.id]: e.target.value }))
                  }
                />
                <div className="flex flex-wrap gap-2">
                  {(["landed", "blocked", "missed"] as const).map(st => {
                    const canCheck =
                      r.status === "in_progress" ||
                      r.status === "blocked" ||
                      r.status === "approved" ||
                      (r.status === "proposed" && !r.needs_founder);
                    return (
                    <button
                      key={st}
                      type="button"
                      disabled={saving || !canCheck || (r.status === "blocked" && st === "landed")}
                      onClick={() => {
                        const run = async () => {
                          if (r.status === "proposed" && !r.needs_founder) {
                            await patchStatus(r.id, "in_progress");
                          } else if (r.status === "approved") {
                            await patchStatus(r.id, "in_progress");
                          } else if (r.status === "blocked" && st !== "missed") {
                            await patchStatus(r.id, "in_progress");
                          }
                          await patchStatus(r.id, st, {
                            check_note: noteById[r.id] ?? "",
                          });
                        };
                        void run();
                      }}
                      className="rounded-md px-3 py-1.5 text-xs text-slate-200 capitalize"
                      style={{
                        background: "rgba(96,165,250,0.12)",
                        border: "1px solid rgba(96,165,250,0.3)",
                      }}
                    >
                      {st}
                    </button>
                    );
                  })}
                </div>
              </div>
            )}

            {mode === "edit" &&
              !locked &&
              (r.status === "approved" || (r.status === "proposed" && !r.needs_founder)) && (
                <div className="space-y-2 pt-1">
                  <input
                    style={fieldStyle}
                    placeholder="Paste ClickUp URL"
                    value={clickupById[r.id] ?? r.clickup_url ?? ""}
                    onChange={e =>
                      setClickupById(prev => ({ ...prev, [r.id]: e.target.value }))
                    }
                  />
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => saveClickup(r.id)}
                    className="rounded-md px-3 py-1.5 text-xs text-slate-200"
                    style={{
                      background: "rgba(52,211,153,0.12)",
                      border: "1px solid rgba(52,211,153,0.35)",
                    }}
                  >
                    Save ClickUp + mark in progress
                  </button>
                </div>
              )}
          </li>
        ))}
      </ul>

      {mode === "edit" && !locked && (
        <div
          className="rounded-lg p-3 space-y-2"
          style={{ border: "1px dashed rgba(255,255,255,0.15)" }}
        >
          <p className="text-xs font-medium text-slate-300">Add commitment</p>
          <select
            style={fieldStyle}
            value={form.client_id}
            onChange={e => setForm(f => ({ ...f, client_id: e.target.value }))}
          >
            <option value="">Select client…</option>
            {clients.map(c => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <select
              style={fieldStyle}
              value={form.severity}
              onChange={e =>
                setForm(f => ({
                  ...f,
                  severity: e.target.value as "911" | "below",
                }))
              }
            >
              <option value="below">Below KPI</option>
              <option value="911">911 / Act now</option>
            </select>
            <select
              style={fieldStyle}
              value={form.constraint_type}
              onChange={e =>
                setForm(f => ({
                  ...f,
                  constraint_type: e.target.value as "system" | "quality" | "data",
                }))
              }
            >
              <option value="data">Data</option>
              <option value="system">System</option>
              <option value="quality">Quality</option>
            </select>
          </div>
          <input
            style={fieldStyle}
            placeholder="Constraint label (e.g. dial coverage)"
            value={form.constraint_label}
            onChange={e => setForm(f => ({ ...f, constraint_label: e.target.value }))}
          />
          <textarea
            rows={2}
            style={fieldStyle}
            placeholder="Why (one sentence)"
            value={form.why}
            onChange={e => setForm(f => ({ ...f, why: e.target.value }))}
          />
          <textarea
            rows={2}
            style={fieldStyle}
            placeholder="Plan"
            value={form.plan}
            onChange={e => setForm(f => ({ ...f, plan: e.target.value }))}
          />
          <div className="grid grid-cols-2 gap-2">
            <select
              style={fieldStyle}
              value={form.owner_role}
              onChange={e => setForm(f => ({ ...f, owner_role: e.target.value }))}
            >
              {OWNER_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <input
              type="date"
              style={fieldStyle}
              value={form.due_date}
              onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
            />
          </div>
          <input
            style={fieldStyle}
            placeholder="Success signal"
            value={form.success_signal}
            onChange={e => setForm(f => ({ ...f, success_signal: e.target.value }))}
          />
          <label className="flex items-center gap-2 text-xs text-slate-300">
            <input
              type="checkbox"
              checked={form.needs_founder}
              onChange={e => setForm(f => ({ ...f, needs_founder: e.target.checked }))}
            />
            Needs Founder
          </label>
          {form.needs_founder && (
            <textarea
              rows={2}
              style={fieldStyle}
              placeholder="Founder ask (required)"
              value={form.founder_ask}
              onChange={e => setForm(f => ({ ...f, founder_ask: e.target.value }))}
            />
          )}
          <button
            type="button"
            disabled={saving || !form.client_id}
            onClick={() => void createRow()}
            className="rounded-md px-4 py-2 text-sm font-medium text-slate-950"
            style={{ background: "#60a5fa" }}
          >
            {saving ? "Saving…" : "Add commitment"}
          </button>
        </div>
      )}
    </section>
  );
}

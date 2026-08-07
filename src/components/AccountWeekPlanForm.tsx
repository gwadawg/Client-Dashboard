"use client";

import { useCallback, useEffect, useState } from "react";
import type { AccountWeekPlanSeverity } from "@/lib/account-week-plans";
import { weekStartMondayContaining } from "@/lib/account-week-plans";
import { todayYmdInCallCenterTz } from "@/lib/time";

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
type AssigneeOpt = { id: string; name: string; email: string | null };

type TaskDraft = {
  key: string;
  title: string;
  notes: string;
  tactic_tag: string;
  assignee_user_id: string;
  scheduled_for: string;
  success_metric: string;
};

type Props = {
  originMeetingId?: string | null;
  defaultClientId?: string | null;
  onCreated?: (planId: string) => void;
  compact?: boolean;
};

const KPI_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Target KPI (optional)" },
  { value: "cpconv", label: "CPConv" },
  { value: "cpql", label: "CPQL" },
  { value: "cpl", label: "CPL" },
  { value: "show_rate", label: "Show Rate" },
  { value: "hand_raise_rate", label: "Hand-raise rate" },
  { value: "booking_rate", label: "Booking rate" },
  { value: "lead_booking_rate", label: "Lead booking rate" },
  { value: "lead_to_qual", label: "Lead → qualified" },
  { value: "conversation_yield", label: "Conversation yield" },
  { value: "optin_rate", label: "Opt-in rate" },
];

function emptyTask(): TaskDraft {
  return {
    key: Math.random().toString(36).slice(2),
    title: "",
    notes: "",
    tactic_tag: "",
    assignee_user_id: "",
    scheduled_for: "",
    success_metric: "",
  };
}

export default function AccountWeekPlanForm({
  originMeetingId = null,
  defaultClientId = null,
  onCreated,
  compact = false,
}: Props) {
  const [clients, setClients] = useState<ClientOpt[]>([]);
  const [assignees, setAssignees] = useState<AssigneeOpt[]>([]);
  const [clientId, setClientId] = useState(defaultClientId ?? "");
  const [why, setWhy] = useState("");
  const [severity, setSeverity] = useState<"" | AccountWeekPlanSeverity>("");
  const [weekStart, setWeekStart] = useState(() =>
    weekStartMondayContaining(todayYmdInCallCenterTz()),
  );
  const [successSignal, setSuccessSignal] = useState("");
  const [tasks, setTasks] = useState<TaskDraft[]>([emptyTask()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  useEffect(() => {
    if (defaultClientId) setClientId(defaultClientId);
  }, [defaultClientId]);

  useEffect(() => {
    fetch("/api/clients")
      .then(async r => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "clients");
        setClients(
          (d.clients ?? []).map((c: { id: string; name: string }) => ({
            id: c.id,
            name: c.name,
          })),
        );
      })
      .catch(() => setClients([]));
    fetch("/api/account-week-plans/assignees")
      .then(async r => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "assignees");
        setAssignees(d.assignees ?? []);
      })
      .catch(() => setAssignees([]));
  }, []);

  const updateTask = useCallback((key: string, patch: Partial<TaskDraft>) => {
    setTasks(prev => prev.map(t => (t.key === key ? { ...t, ...patch } : t)));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setWarning(null);
    setOk(null);
    try {
      const payloadTasks = tasks
        .filter(t => t.title.trim())
        .map((t, i) => ({
          title: t.title.trim(),
          notes: t.notes.trim() || null,
          tactic_tag: t.tactic_tag.trim() || null,
          assignee_user_id: t.assignee_user_id || null,
          scheduled_for: t.scheduled_for || null,
          success_metric: t.success_metric || null,
          sort_order: i,
        }));

      const res = await fetch("/api/account-week-plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: clientId,
          why,
          severity: severity || null,
          week_start: weekStart,
          success_signal: successSignal || null,
          origin_meeting_id: originMeetingId,
          tasks: payloadTasks,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Failed to save");
      if (d.duplicate_warning) {
        setWarning("A plan for this client already exists this week (saved anyway).");
      }
      setOk("Plan submitted for founder approval.");
      setWhy("");
      setSeverity("");
      setSuccessSignal("");
      setTasks([emptyTask()]);
      onCreated?.(d.plan?.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className={compact ? "space-y-3" : "space-y-4"}>
      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">
          Account week plan
        </h4>
        <p className="text-xs text-slate-500">
          Client + why this week, then the work. Founder approves before tasks are active.
        </p>
      </div>

      {error && <p className="text-xs text-rose-400">{error}</p>}
      {warning && <p className="text-xs text-amber-400">{warning}</p>}
      {ok && <p className="text-xs text-emerald-400">{ok}</p>}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1 sm:col-span-2">
          <span className="text-xs text-slate-400">Client</span>
          <select
            required
            value={clientId}
            onChange={e => setClientId(e.target.value)}
            style={fieldStyle}
          >
            <option value="">Select client…</option>
            {clients.map(c => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-1">
          <span className="text-xs text-slate-400">Week start (Monday)</span>
          <input
            type="date"
            required
            value={weekStart}
            onChange={e => setWeekStart(e.target.value)}
            style={fieldStyle}
          />
        </label>

        <label className="block space-y-1">
          <span className="text-xs text-slate-400">Severity (optional)</span>
          <select
            value={severity}
            onChange={e => setSeverity(e.target.value as "" | AccountWeekPlanSeverity)}
            style={fieldStyle}
          >
            <option value="">—</option>
            <option value="911">911</option>
            <option value="below">Below KPI</option>
            <option value="watch">Watch</option>
          </select>
        </label>

        <label className="block space-y-1 sm:col-span-2">
          <span className="text-xs text-slate-400">Why / what went wrong</span>
          <textarea
            required
            rows={2}
            value={why}
            onChange={e => setWhy(e.target.value)}
            style={fieldStyle}
            placeholder="One sentence diagnosis"
          />
        </label>

        <label className="block space-y-1 sm:col-span-2">
          <span className="text-xs text-slate-400">Success signal (optional)</span>
          <input
            value={successSignal}
            onChange={e => setSuccessSignal(e.target.value)}
            style={fieldStyle}
            placeholder="How we’ll know it worked"
          />
        </label>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Tasks
          </span>
          <button
            type="button"
            className="text-xs text-sky-400 hover:text-sky-300"
            onClick={() => setTasks(t => [...t, emptyTask()])}
          >
            + Add task
          </button>
        </div>

        {tasks.map((t, idx) => (
          <div
            key={t.key}
            className="rounded-lg p-3 space-y-2"
            style={{ border: "1px solid rgba(255,255,255,0.06)", background: "rgba(15,32,64,0.4)" }}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase text-slate-500">Task {idx + 1}</span>
              {tasks.length > 1 && (
                <button
                  type="button"
                  className="text-[10px] text-slate-500 hover:text-rose-400"
                  onClick={() => setTasks(prev => prev.filter(x => x.key !== t.key))}
                >
                  Remove
                </button>
              )}
            </div>
            <input
              required={idx === 0}
              placeholder="What to do"
              value={t.title}
              onChange={e => updateTask(t.key, { title: e.target.value })}
              style={fieldStyle}
            />
            <div className="grid gap-2 sm:grid-cols-3">
              <input
                placeholder="Tag (optional)"
                value={t.tactic_tag}
                onChange={e => updateTask(t.key, { tactic_tag: e.target.value })}
                style={fieldStyle}
              />
              <select
                value={t.assignee_user_id}
                onChange={e => updateTask(t.key, { assignee_user_id: e.target.value })}
                style={fieldStyle}
              >
                <option value="">Assignee…</option>
                {assignees.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
              <input
                type="date"
                value={t.scheduled_for}
                onChange={e => updateTask(t.key, { scheduled_for: e.target.value })}
                style={fieldStyle}
                title="Due / do-on day"
              />
            </div>
            <select
              value={t.success_metric}
              onChange={e => updateTask(t.key, { success_metric: e.target.value })}
              style={fieldStyle}
            >
              {KPI_OPTIONS.map(o => (
                <option key={o.value || "none"} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <input
              placeholder="Notes (optional)"
              value={t.notes}
              onChange={e => updateTask(t.key, { notes: e.target.value })}
              style={fieldStyle}
            />
          </div>
        ))}
      </div>

      <button
        type="submit"
        disabled={saving}
        className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        style={{ background: "#2563eb" }}
      >
        {saving ? "Saving…" : "Submit for approval"}
      </button>
    </form>
  );
}

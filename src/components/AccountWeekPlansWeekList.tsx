"use client";

import { useCallback, useEffect, useState } from "react";
import type { AccountPlanTask, AccountWeekPlan, AdhocWorkLog } from "@/lib/account-week-plans";
import { weekStartMondayContaining } from "@/lib/account-week-plans";
import { addDaysToYmd } from "@/lib/team-meetings";
import { todayYmdInCallCenterTz } from "@/lib/time";
import {
  BET_CATEGORIES,
  WORK_TYPE_META,
  WORK_TYPES,
  betCategoryLabel,
  isValidLoomUrl,
  parseBetCategory,
  parseWorkType,
  type BetCategoryId,
  type WorkType,
} from "@/lib/client-work-log";
import { SUCCESS_METRIC_META } from "@/lib/client-health";

type Props = {
  defaultWeekStart?: string;
  originMeetingId?: string | null;
};

const fieldStyle = {
  background: "#0f2040",
  border: "1px solid rgba(255,255,255,0.12)",
  color: "#e2e8f0",
  borderRadius: "0.5rem",
  padding: "0.4rem 0.6rem",
  fontSize: "0.75rem",
  outline: "none",
  width: "100%",
} as const;

export default function AccountWeekPlansWeekList({
  defaultWeekStart,
  originMeetingId,
}: Props) {
  const [weekStart, setWeekStart] = useState(
    () => defaultWeekStart || weekStartMondayContaining(todayYmdInCallCenterTz()),
  );
  const [plans, setPlans] = useState<AccountWeekPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [completeId, setCompleteId] = useState<string | null>(null);
  const [report, setReport] = useState("");
  const [completeType, setCompleteType] = useState<WorkType>("cadence");
  const [completeMetric, setCompleteMetric] = useState("");
  const [completeCategory, setCompleteCategory] = useState<BetCategoryId | "">("");
  const [completeLoom, setCompleteLoom] = useState("");
  const [completeHypothesis, setCompleteHypothesis] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reflectionDraft, setReflectionDraft] = useState<Record<string, string>>({});
  const [reflectBusy, setReflectBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let url = `/api/account-week-plans?week_start=${encodeURIComponent(weekStart)}&include_tasks=1`;
      if (originMeetingId) {
        url = `/api/account-week-plans?origin_meeting_id=${encodeURIComponent(originMeetingId)}&include_tasks=1`;
      }
      const res = await fetch(url);
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Failed");
      setPlans(d.plans ?? []);
      const drafts: Record<string, string> = {};
      for (const plan of (d.plans ?? []) as AccountWeekPlan[]) {
        drafts[plan.id] = plan.reflection ?? "";
      }
      setReflectionDraft(drafts);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }, [weekStart, originMeetingId]);

  useEffect(() => {
    load();
  }, [load]);

  async function patchTask(
    taskId: string,
    body: Record<string, unknown>,
  ): Promise<void> {
    setBusyId(taskId);
    setError(null);
    try {
      const res = await fetch(`/api/account-plan-tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Failed");
      setCompleteId(null);
      setReport("");
      setCompleteMetric("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusyId(null);
    }
  }

  async function saveReflection(plan: AccountWeekPlan) {
    setReflectBusy(plan.id);
    setError(null);
    try {
      const res = await fetch(`/api/account-week-plans/${plan.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reflection: reflectionDraft[plan.id] ?? "" }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Failed");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setReflectBusy(null);
    }
  }

  function statusColor(s: string) {
    if (s === "approved") return "#34d399";
    if (s === "pending") return "#fbbf24";
    if (s === "rejected") return "#f87171";
    return "#94a3b8";
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Week plans
          </h4>
          <p className="text-xs text-slate-500 mt-0.5">
            Review execution — planned tasks, ad-hoc logs, reflection.
          </p>
        </div>
        {!originMeetingId && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="text-xs text-sky-400"
              onClick={() => setWeekStart(addDaysToYmd(weekStart, -7))}
            >
              ← Last
            </button>
            <span className="text-xs text-slate-300 font-mono">{weekStart}</span>
            <button
              type="button"
              className="text-xs text-sky-400"
              onClick={() => setWeekStart(addDaysToYmd(weekStart, 7))}
            >
              Next →
            </button>
            <button
              type="button"
              className="text-xs text-slate-400"
              onClick={() =>
                setWeekStart(weekStartMondayContaining(todayYmdInCallCenterTz()))
              }
            >
              This week
            </button>
          </div>
        )}
      </div>

      {error && <p className="text-xs text-rose-400">{error}</p>}
      {loading && <p className="text-xs text-slate-500">Loading…</p>}
      {!loading && plans.length === 0 && (
        <p className="text-xs text-slate-500">No plans for this week.</p>
      )}

      {plans.map(p => (
        <div
          key={p.id}
          className="rounded-lg p-3 space-y-2"
          style={{ border: "1px solid rgba(255,255,255,0.08)", background: "rgba(15,32,64,0.5)" }}
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-slate-100">
              {p.client_name ?? "Client"}
            </span>
            <span
              className="text-[10px] uppercase tracking-wide"
              style={{ color: statusColor(p.status) }}
            >
              {p.status}
            </span>
            <span className="text-[10px] text-slate-500">{p.week_start}</span>
          </div>
          <p className="text-xs text-slate-400">{p.why}</p>

          {(p.adhoc_logs ?? []).length > 0 && (
            <div className="rounded-md px-2 py-2" style={{ background: "rgba(251,191,36,0.06)" }}>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-400/80 mb-1">
                Ad-hoc this week
              </p>
              <ul className="space-y-1">
                {(p.adhoc_logs ?? []).map((log: AdhocWorkLog) => (
                  <li key={log.id} className="text-[11px] text-slate-300">
                    <span className="text-slate-500">
                      {WORK_TYPE_META[parseWorkType(log.work_type, "cadence")].label}
                    </span>
                    {" · "}
                    {log.title}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {p.status !== "rejected" && (
            <div className="space-y-1.5">
              <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Thursday reflection
              </label>
              <textarea
                rows={2}
                placeholder="What we learned — keep / kill / change next week"
                value={reflectionDraft[p.id] ?? ""}
                onChange={e =>
                  setReflectionDraft(prev => ({ ...prev, [p.id]: e.target.value }))
                }
                style={fieldStyle}
              />
              <button
                type="button"
                disabled={reflectBusy === p.id}
                className="text-[10px] text-sky-400"
                onClick={() => saveReflection(p)}
              >
                {reflectBusy === p.id ? "Saving…" : "Save reflection"}
              </button>
            </div>
          )}

          <ul className="space-y-2">
            {(p.tasks ?? []).map((t: AccountPlanTask) => (
              <li
                key={t.id}
                className="rounded-md px-2 py-2 text-xs"
                style={{ background: "rgba(0,0,0,0.2)" }}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <span
                      className={
                        t.status === "done"
                          ? "text-emerald-400"
                          : t.status === "cancelled"
                            ? "text-slate-500 line-through"
                            : "text-slate-200"
                      }
                    >
                      {t.title}
                    </span>
                    <div className="text-[10px] text-slate-500 mt-0.5">
                      {t.status}
                      {t.scheduled_for ? ` · ${t.scheduled_for}` : ""}
                      {t.tactic_tag
                        ? ` · #${betCategoryLabel(t.tactic_tag) ?? t.tactic_tag}`
                        : ""}
                      {t.status === "done"
                        ? ` · ${WORK_TYPE_META[parseWorkType(t.work_type, "cadence")].label}`
                        : ""}
                      {t.client_action_log_id ? " · filed to work log" : ""}
                    </div>
                    {t.completion_report && (
                      <p className="text-slate-400 mt-1 whitespace-pre-wrap">
                        {t.completion_report}
                      </p>
                    )}
                  </div>
                  {p.status === "approved" && t.status === "open" && (
                    <div className="flex gap-1 shrink-0">
                      <button
                        type="button"
                        disabled={busyId === t.id}
                        className="text-[10px] text-emerald-400 px-2 py-0.5 rounded"
                        style={{ border: "1px solid rgba(52,211,153,0.35)" }}
                        onClick={() => {
                          setCompleteId(t.id);
                          setReport("");
                          setCompleteType("cadence");
                          setCompleteMetric("");
                          setCompleteCategory("");
                          setCompleteLoom("");
                          setCompleteHypothesis(t.notes ?? "");
                        }}
                      >
                        Done
                      </button>
                      <button
                        type="button"
                        disabled={busyId === t.id}
                        className="text-[10px] text-slate-400 px-2 py-0.5 rounded"
                        style={{ border: "1px solid rgba(148,163,184,0.3)" }}
                        onClick={() => patchTask(t.id, { status: "cancelled" })}
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>

                {completeId === t.id && (
                  <div className="mt-2 space-y-2">
                    <textarea
                      rows={2}
                      placeholder="How it went (optional)"
                      value={report}
                      onChange={e => setReport(e.target.value)}
                      style={fieldStyle}
                    />
                    <select
                      value={completeType}
                      onChange={e => setCompleteType(parseWorkType(e.target.value, "cadence"))}
                      style={fieldStyle}
                    >
                      {WORK_TYPES.map(type => (
                        <option key={type} value={type}>
                          File as {WORK_TYPE_META[type].label}
                        </option>
                      ))}
                    </select>
                    <p className="text-[10px] text-slate-500">
                      Cadence is the default diary row. Opt into Bet only if this shipped as a measured lever.
                    </p>
                    {completeType === "bet" && (
                      <>
                        <textarea
                          rows={2}
                          placeholder="Hypothesis (required)"
                          value={completeHypothesis}
                          onChange={e => setCompleteHypothesis(e.target.value)}
                          style={fieldStyle}
                        />
                        <select
                          value={completeCategory}
                          onChange={e => setCompleteCategory(e.target.value as BetCategoryId | "")}
                          style={fieldStyle}
                          required
                        >
                          <option value="">Action category (required)</option>
                          {BET_CATEGORIES.map(c => (
                            <option key={c.id} value={c.id}>
                              {c.group} · {c.label}
                            </option>
                          ))}
                        </select>
                        <select
                          value={completeMetric}
                          onChange={e => setCompleteMetric(e.target.value)}
                          style={fieldStyle}
                          required
                        >
                          <option value="">Success metric (required)</option>
                          {Object.entries(SUCCESS_METRIC_META).map(([key, meta]) => (
                            <option key={key} value={key}>
                              {meta.label}
                            </option>
                          ))}
                        </select>
                        <input
                          type="url"
                          value={completeLoom}
                          onChange={e => setCompleteLoom(e.target.value)}
                          placeholder="Loom URL (required)"
                          style={fieldStyle}
                        />
                        {completeLoom.trim() && !isValidLoomUrl(completeLoom) && (
                          <p className="text-[10px] text-rose-400">Must be a loom.com link.</p>
                        )}
                      </>
                    )}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={
                          busyId === t.id ||
                          (completeType === "bet" &&
                            (!completeMetric ||
                              !completeCategory ||
                              !completeHypothesis.trim() ||
                              !isValidLoomUrl(completeLoom)))
                        }
                        className="text-xs text-white px-3 py-1 rounded"
                        style={{ background: "#059669" }}
                        onClick={() =>
                          patchTask(t.id, {
                            status: "done",
                            completion_report: report || null,
                            work_type: completeType,
                            success_metric: completeType === "bet" ? completeMetric : t.success_metric,
                            bet_category: completeType === "bet" ? completeCategory : null,
                            loom_url: completeType === "bet" ? completeLoom.trim() : null,
                            hypothesis: completeType === "bet" ? completeHypothesis.trim() : null,
                          })
                        }
                      >
                        Confirm done
                      </button>
                      <button
                        type="button"
                        className="text-xs text-slate-400"
                        onClick={() => setCompleteId(null)}
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

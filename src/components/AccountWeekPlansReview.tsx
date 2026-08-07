"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  AccountPlanTask,
  AccountPlanTaskReviewVerdict,
} from "@/lib/account-week-plans";
import { ACCOUNT_PLAN_TASK_REVIEW_VERDICTS } from "@/lib/account-week-plans";
import { addDaysToYmd } from "@/lib/team-meetings";
import { todayYmdInCallCenterTz } from "@/lib/time";
import { SUCCESS_METRIC_META, type SuccessMetricKey } from "@/lib/client-health";

type DeployedTask = AccountPlanTask & {
  client_name: string | null;
  why: string;
  week_start: string | null;
  plan_status: string | null;
};

type KpiPayload = {
  success_metric: string;
  label: string;
  unit: "money" | "pct" | "ratio";
  lower_is_better: boolean;
  baseline_value: number | null;
  baseline_window: { start: string; end: string };
  outcome_value: number | null;
  outcome_window: { start: string; end: string };
  delta: number | null;
  direction: "better" | "worse" | "flat" | "unknown";
  change_date: string;
};

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

const VERDICT_LABEL: Record<AccountPlanTaskReviewVerdict, string> = {
  helped: "Helped",
  no_change: "No change",
  hurt: "Hurt",
  unclear: "Unclear",
  too_early: "Too early",
};

function formatMetric(unit: string, value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  if (unit === "money") return `$${Math.round(value)}`;
  if (unit === "pct") return `${value.toFixed(1)}%`;
  return value.toFixed(3);
}

export default function AccountWeekPlansReview() {
  const [date, setDate] = useState(() =>
    addDaysToYmd(todayYmdInCallCenterTz(), -1),
  );
  const [tasks, setTasks] = useState<DeployedTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [kpiById, setKpiById] = useState<Record<string, KpiPayload | null>>({});
  const [kpiLoading, setKpiLoading] = useState<string | null>(null);
  const [notesById, setNotesById] = useState<Record<string, string>>({});
  const [verdictById, setVerdictById] = useState<
    Record<string, AccountPlanTaskReviewVerdict | "">
  >({});
  const [metricById, setMetricById] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/account-week-plans?view=deployed&date=${encodeURIComponent(date)}`,
      );
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Failed");
      const rows = (d.tasks ?? []) as DeployedTask[];
      setTasks(rows);
      setActiveId(rows[0]?.id ?? null);
      const notes: Record<string, string> = {};
      const verdicts: Record<string, AccountPlanTaskReviewVerdict | ""> = {};
      const metrics: Record<string, string> = {};
      for (const t of rows) {
        notes[t.id] = t.review_notes ?? "";
        verdicts[t.id] = t.review_verdict ?? "";
        metrics[t.id] = t.success_metric ?? "";
      }
      setNotesById(notes);
      setVerdictById(verdicts);
      setMetricById(metrics);
      setKpiById({});
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    load();
  }, [load]);

  async function loadKpi(taskId: string, metricOverride?: string) {
    setKpiLoading(taskId);
    try {
      let url = `/api/account-plan-tasks/${taskId}?view=kpi`;
      const m = metricOverride ?? metricById[taskId];
      if (m) url += `&metric=${encodeURIComponent(m)}`;
      const res = await fetch(url);
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "KPI failed");
      setKpiById(prev => ({ ...prev, [taskId]: d.kpi ?? null }));
    } catch {
      setKpiById(prev => ({ ...prev, [taskId]: null }));
    } finally {
      setKpiLoading(null);
    }
  }

  useEffect(() => {
    if (!activeId) return;
    const t = tasks.find(x => x.id === activeId);
    if (!t) return;
    const metric = metricById[activeId] || t.success_metric;
    if (metric && !(activeId in kpiById)) {
      void loadKpi(activeId, metric);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per active
  }, [activeId, tasks]);

  async function saveReview(taskId: string) {
    setBusyId(taskId);
    setError(null);
    setSavedId(null);
    try {
      const metric = metricById[taskId];
      if (metric !== undefined) {
        await fetch(`/api/account-plan-tasks/${taskId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            success_metric: metric || null,
          }),
        });
      }

      const res = await fetch(`/api/account-plan-tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          review: true,
          review_notes: notesById[taskId] ?? "",
          review_verdict: verdictById[taskId] || null,
          recompute_kpi: Boolean(metricById[taskId] || tasks.find(t => t.id === taskId)?.success_metric),
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Failed to save review");
      setSavedId(taskId);
      await load();
      if (metricById[taskId]) await loadKpi(taskId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusyId(null);
    }
  }

  const active = tasks.find(t => t.id === activeId) ?? null;
  const kpi = active ? kpiById[active.id] : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Deployed review
          </h4>
          <p className="text-xs text-slate-500 mt-0.5">
            Circle back on work finished that day — KPI before/after + team thoughts.
            Does not auto-land on Client Success unless already promoted at complete.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="text-xs text-sky-400"
            onClick={() => setDate(addDaysToYmd(date, -1))}
          >
            ←
          </button>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            style={{ ...fieldStyle, width: "auto" }}
          />
          <button
            type="button"
            className="text-xs text-sky-400"
            onClick={() => setDate(addDaysToYmd(date, 1))}
          >
            →
          </button>
          <button
            type="button"
            className="text-xs text-slate-400"
            onClick={() => setDate(todayYmdInCallCenterTz())}
          >
            Today
          </button>
        </div>
      </div>

      {error && <p className="text-xs text-rose-400">{error}</p>}
      {loading && <p className="text-xs text-slate-500">Loading deployed work…</p>}

      {!loading && tasks.length === 0 && (
        <p className="text-xs text-slate-500">
          No tasks marked done on {date}. Pick another day or complete work from
          This week / Calendar first.
        </p>
      )}

      {tasks.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,14rem)_1fr]">
          <ul className="space-y-1 max-h-[28rem] overflow-y-auto">
            {tasks.map((t, i) => {
              const selected = t.id === activeId;
              const reviewed = Boolean(t.reviewed_at);
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => setActiveId(t.id)}
                    className="w-full text-left rounded-md px-2 py-2 text-xs"
                    style={{
                      background: selected
                        ? "rgba(37,99,235,0.25)"
                        : "rgba(15,32,64,0.5)",
                      border: selected
                        ? "1px solid rgba(96,165,250,0.5)"
                        : "1px solid rgba(255,255,255,0.06)",
                    }}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="text-slate-500">{i + 1}.</span>
                      <span className="font-medium text-slate-100 truncate">
                        {t.client_name ?? "Client"}
                      </span>
                      {reviewed && (
                        <span className="text-[9px] text-emerald-400 ml-auto">reviewed</span>
                      )}
                    </div>
                    <div className="text-slate-400 truncate pl-4">{t.title}</div>
                  </button>
                </li>
              );
            })}
          </ul>

          {active && (
            <div
              className="rounded-lg p-4 space-y-4"
              style={{
                border: "1px solid rgba(255,255,255,0.08)",
                background: "rgba(15,32,64,0.45)",
              }}
            >
              <div>
                <h5 className="text-sm font-semibold text-slate-100">
                  {active.client_name ?? "Client"}
                </h5>
                <p className="text-sm text-slate-200 mt-1">{active.title}</p>
                {active.completion_report && (
                  <p className="text-xs text-slate-400 mt-2 whitespace-pre-wrap">
                    <span className="text-slate-500">How it went: </span>
                    {active.completion_report}
                  </p>
                )}
                {active.why && (
                  <p className="text-xs text-slate-500 mt-1">Plan why: {active.why}</p>
                )}
              </div>

              <label className="block space-y-1">
                <span className="text-xs text-slate-400">
                  Target KPI (for before/after)
                </span>
                <select
                  value={metricById[active.id] ?? ""}
                  onChange={e => {
                    const v = e.target.value;
                    setMetricById(prev => ({ ...prev, [active.id]: v }));
                    if (v) void loadKpi(active.id, v);
                    else setKpiById(prev => ({ ...prev, [active.id]: null }));
                  }}
                  style={fieldStyle}
                >
                  <option value="">None</option>
                  {(Object.keys(SUCCESS_METRIC_META) as SuccessMetricKey[]).map(k => (
                    <option key={k} value={k}>
                      {SUCCESS_METRIC_META[k].label}
                    </option>
                  ))}
                </select>
              </label>

              <div
                className="rounded-md p-3 space-y-2"
                style={{ background: "rgba(0,0,0,0.25)" }}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase tracking-wide text-slate-500">
                    KPI check
                  </span>
                  <button
                    type="button"
                    className="text-[10px] text-sky-400"
                    disabled={!metricById[active.id] || kpiLoading === active.id}
                    onClick={() => loadKpi(active.id)}
                  >
                    {kpiLoading === active.id ? "Computing…" : "Refresh"}
                  </button>
                </div>
                {!metricById[active.id] && (
                  <p className="text-xs text-slate-500">
                    Pick a KPI to compare pre-complete baseline vs post window.
                  </p>
                )}
                {metricById[active.id] && kpi && (
                  <>
                    <p className="text-xs text-slate-300">{kpi.label}</p>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <div className="text-slate-500">Before</div>
                        <div className="text-slate-100 text-lg font-semibold">
                          {formatMetric(kpi.unit, kpi.baseline_value)}
                        </div>
                        <div className="text-[10px] text-slate-600">
                          {kpi.baseline_window.start} → {kpi.baseline_window.end}
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-500">After</div>
                        <div className="text-slate-100 text-lg font-semibold">
                          {formatMetric(kpi.unit, kpi.outcome_value)}
                        </div>
                        <div className="text-[10px] text-slate-600">
                          {kpi.outcome_window.start} → {kpi.outcome_window.end}
                        </div>
                      </div>
                    </div>
                    <p
                      className="text-xs font-medium"
                      style={{
                        color:
                          kpi.direction === "better"
                            ? "#34d399"
                            : kpi.direction === "worse"
                              ? "#f87171"
                              : "#94a3b8",
                      }}
                    >
                      {kpi.direction === "better" && "Looks better vs baseline"}
                      {kpi.direction === "worse" && "Looks worse vs baseline"}
                      {kpi.direction === "flat" && "Essentially flat"}
                      {kpi.direction === "unknown" &&
                        "Not enough data yet — use Too early if needed"}
                    </p>
                  </>
                )}
              </div>

              <label className="block space-y-1">
                <span className="text-xs text-slate-400">Team verdict</span>
                <select
                  value={verdictById[active.id] ?? ""}
                  onChange={e =>
                    setVerdictById(prev => ({
                      ...prev,
                      [active.id]: e.target.value as AccountPlanTaskReviewVerdict | "",
                    }))
                  }
                  style={fieldStyle}
                >
                  <option value="">—</option>
                  {ACCOUNT_PLAN_TASK_REVIEW_VERDICTS.map(v => (
                    <option key={v} value={v}>
                      {VERDICT_LABEL[v]}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block space-y-1">
                <span className="text-xs text-slate-400">Review notes / thoughts</span>
                <textarea
                  rows={4}
                  value={notesById[active.id] ?? ""}
                  onChange={e =>
                    setNotesById(prev => ({ ...prev, [active.id]: e.target.value }))
                  }
                  style={fieldStyle}
                  placeholder="What happened after we did this? Worth repeating?"
                />
              </label>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  disabled={busyId === active.id}
                  onClick={() => saveReview(active.id)}
                  className="rounded-md px-4 py-2 text-xs font-medium text-white disabled:opacity-50"
                  style={{ background: "#2563eb" }}
                >
                  {busyId === active.id ? "Saving…" : "Save review"}
                </button>
                {savedId === active.id && (
                  <span className="text-xs text-emerald-400">Saved</span>
                )}
                {active.reviewed_at && (
                  <span className="text-[10px] text-slate-500">
                    Last reviewed {active.reviewed_at.slice(0, 10)}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

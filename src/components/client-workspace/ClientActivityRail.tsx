"use client";

import { useEffect, useMemo, useState } from "react";
import { describeClientTenure } from "@/lib/client-tenure";
import { cachedJsonFetch, peekCachedJson } from "@/lib/client-fetch-cache";
import { SUCCESS_METRIC_META, type SuccessMetricKey } from "@/lib/client-health";
import { actionChangeDate } from "@/lib/client-health-interventions";
import { betCategoryLabel, parseWorkType, WORK_TYPE_META } from "@/lib/client-work-log";
import type { AccountPlanTask, AccountWeekPlan } from "@/lib/account-week-plans";
import type { DashboardClient } from "@/lib/use-dashboard-filters";

type Activity = {
  client_id: string;
  source_id: string;
  activity_type: string;
  occurred_at: string;
  subtype: string | null;
  summary: string | null;
  source_table: string;
};

type ActionDetail = {
  id: string;
  title: string;
  status: string;
  work_type?: string | null;
  bet_category?: string | null;
  success_metric: string | null;
  baseline_value: number | null;
  target_value: number | null;
  outcome_value: number | null;
  outcome_notes: string | null;
  change_description: string | null;
  hypothesis: string | null;
  constraint_label: string | null;
  layer?: string | null;
  loom_url?: string | null;
  change_date: string | null;
  planned_date?: string | null;
  review_date: string | null;
  created_at: string;
};

type FetchedActivity = {
  clientId: string;
  rows: Activity[];
  error: string;
};

type Props = {
  /** Null under All / Live scope, where there is no single history to show. */
  client: DashboardClient | null;
  todayYmd: string;
  onClose: () => void;
};

const cacheKeyFor = (clientId: string) => `activity|${clientId}`;

/** One accent per activity family, so the rail is scannable without reading it. */
const TYPE_STYLE: Record<string, { label: string; color: string }> = {
  lifecycle: { label: "Status", color: "#c084fc" },
  call: { label: "Call", color: "#38bdf8" },
  note: { label: "Note", color: "#94a3b8" },
  action: { label: "Action", color: "#fbbf24" },
  billing: { label: "Billing", color: "#34d399" },
  touchpoint: { label: "Touchpoint", color: "#2dd4bf" },
  commitment: { label: "Commitment", color: "#f472b6" },
  plan: { label: "Plan", color: "#a3e635" },
  task: { label: "Task", color: "#a3e635" },
  health: { label: "Health", color: "#fb923c" },
  mrr: { label: "MRR", color: "#34d399" },
};

function styleFor(type: string, subtype?: string | null) {
  if (type === "action") {
    if (subtype === "finding") return { label: "Finding", color: "#fbbf24" };
    if (subtype === "cadence") return { label: "Cadence", color: "#94a3b8" };
    if (subtype === "bet") return { label: "Bet", color: "#60a5fa" };
    return { label: "Work", color: "#fbbf24" };
  }
  return TYPE_STYLE[type] ?? { label: type, color: "#64748b" };
}

/** "Today" / "Yesterday" / "Mar 12, 2026" for the day dividers. */
function dayLabel(iso: string, todayYmd: string): string {
  const day = iso.slice(0, 10);
  if (day === todayYmd) return "Today";
  const [ty, tm, td] = todayYmd.split("-").map(Number);
  const yesterday = new Date(Date.UTC(ty, tm - 1, td - 1)).toISOString().slice(0, 10);
  if (day === yesterday) return "Yesterday";
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: y === ty ? undefined : "numeric",
  });
}

function timeLabel(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function activityKey(a: Activity): string {
  return `${a.source_table}-${a.source_id}`;
}

/** Title-first overview; the mashed timeline string stays for the expanded body. */
function overviewFor(a: Activity, action?: ActionDetail, task?: AccountPlanTask): string {
  if (action?.title) return action.title;
  if (task?.title) return task.title;
  const s = (a.summary ?? "").trim();
  if (!s) return "—";
  if (a.source_table === "client_action_logs" || a.source_table === "account_plan_tasks") {
    const parts = s.split(" · ");
    if (parts.length >= 2) return parts[1] ?? s;
  }
  return s;
}

function formatMetric(key: string | null, value: number | null): string {
  if (value == null) return "—";
  const meta = key ? SUCCESS_METRIC_META[key as SuccessMetricKey] : undefined;
  if (!meta) return String(Math.round(value * 100) / 100);
  if (meta.unit === "money") return `$${Math.round(value)}`;
  if (meta.unit === "pct") return `${value.toFixed(1)}%`;
  return value.toFixed(3);
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  if (children == null || children === "") return null;
  return (
    <div>
      <p
        className="text-[10px] uppercase tracking-wider font-semibold"
        style={{ color: "var(--color-ws-text-ghost)" }}
      >
        {label}
      </p>
      <div
        className="text-xs mt-0.5 leading-relaxed whitespace-pre-wrap break-words"
        style={{ color: "var(--color-ws-text-muted)" }}
      >
        {children}
      </div>
    </div>
  );
}

function ActionDetails({ action }: { action: ActionDetail }) {
  const type = parseWorkType(action.work_type, "cadence");
  const meta = action.success_metric
    ? SUCCESS_METRIC_META[action.success_metric as SuccessMetricKey]
    : undefined;
  const changeDate = action.change_date ?? (type === "bet" ? actionChangeDate(action) : null);
  const category = betCategoryLabel(action.bet_category);
  let delta: string | null = null;
  if (action.outcome_value != null && action.baseline_value != null && meta) {
    delta = `${formatMetric(action.success_metric, action.baseline_value)} → ${formatMetric(action.success_metric, action.outcome_value)}`;
  }

  return (
    <div className="mt-2 space-y-2 pt-2" style={{ borderTop: "1px solid var(--color-ws-hairline)" }}>
      <Field label="What">{action.title}</Field>
      <Field label="Type">{WORK_TYPE_META[type].label}</Field>
      <Field label="Status">{action.status.replaceAll("_", " ")}</Field>
      <Field label="Category">{category}</Field>
      <Field label="Layer">{action.layer}</Field>
      <Field label="Constraint">{action.constraint_label}</Field>
      <Field label={type === "finding" ? "Observed" : type === "bet" ? "Went live" : "Done"}>
        {changeDate}
      </Field>
      <Field label="Planned">{action.planned_date}</Field>
      <Field label="Review">{action.review_date}</Field>
      <Field label="Metric">
        {action.success_metric ? (
          <>
            {meta?.label ?? action.success_metric}
            {action.baseline_value != null
              ? ` · baseline ${formatMetric(action.success_metric, action.baseline_value)}`
              : ""}
            {action.target_value != null
              ? ` · target ${formatMetric(action.success_metric, action.target_value)}`
              : ""}
            {delta ? ` · ${delta}` : ""}
          </>
        ) : null}
      </Field>
      <Field label="What changed">{action.change_description}</Field>
      <Field label="Hypothesis">{action.hypothesis}</Field>
      <Field label="Outcome notes">{action.outcome_notes}</Field>
      <Field label="Loom">
        {action.loom_url ? (
          <a href={action.loom_url} target="_blank" rel="noreferrer" className="underline">
            Open recording
          </a>
        ) : null}
      </Field>
    </div>
  );
}

function TaskDetails({ task, plan }: { task: AccountPlanTask; plan?: AccountWeekPlan }) {
  return (
    <div className="mt-2 space-y-2 pt-2" style={{ borderTop: "1px solid var(--color-ws-hairline)" }}>
      <Field label="Task">{task.title}</Field>
      <Field label="Status">{task.status}</Field>
      <Field label="Work type">{task.work_type}</Field>
      <Field label="Scheduled">{task.scheduled_for}</Field>
      <Field label="Completed">{task.completed_at?.slice(0, 10)}</Field>
      <Field label="Tactic">{task.tactic_tag}</Field>
      <Field label="Notes">{task.notes}</Field>
      <Field label="Completion">{task.completion_report}</Field>
      <Field label="Metric">{task.success_metric}</Field>
      <Field label="Verdict">{task.review_verdict?.replaceAll("_", " ")}</Field>
      <Field label="Review notes">{task.review_notes}</Field>
      {plan ? (
        <>
          <Field label="Week of">{plan.week_start}</Field>
          <Field label="Plan why">{plan.why}</Field>
          <Field label="Success signal">{plan.success_signal}</Field>
        </>
      ) : null}
    </div>
  );
}

function PlanDetails({ plan }: { plan: AccountWeekPlan }) {
  return (
    <div className="mt-2 space-y-2 pt-2" style={{ borderTop: "1px solid var(--color-ws-hairline)" }}>
      <Field label="Week of">{plan.week_start}</Field>
      <Field label="Status">{plan.status}</Field>
      <Field label="Severity">{plan.severity}</Field>
      <Field label="Why">{plan.why}</Field>
      <Field label="Success signal">{plan.success_signal}</Field>
      <Field label="Founder note">{plan.founder_note}</Field>
      {plan.tasks?.length ? (
        <Field label="Tasks">
          {plan.tasks.map(t => `${t.status} · ${t.title}`).join("\n")}
        </Field>
      ) : null}
    </div>
  );
}

/**
 * Chronological account history for the selected client, beside the numbers.
 * The whole point is answering "what did we change, and when" without leaving
 * the KPIs you're trying to explain.
 */
export default function ClientActivityRail({ client, todayYmd, onClose }: Props) {
  // Keyed by client so a result never bleeds onto the next selection: anything
  // whose clientId doesn't match the current one is ignored rather than shown.
  const [fetched, setFetched] = useState<FetchedActivity | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [actionsById, setActionsById] = useState<Record<string, ActionDetail>>({});
  const [tasksById, setTasksById] = useState<Record<string, AccountPlanTask>>({});
  const [plansById, setPlansById] = useState<Record<string, AccountWeekPlan>>({});
  const [detailsLoading, setDetailsLoading] = useState(false);
  const clientId = client?.id ?? null;

  useEffect(() => {
    setExpanded(new Set());
    setActionsById({});
    setTasksById({});
    setPlansById({});
  }, [clientId]);

  useEffect(() => {
    // Nothing to fetch under All / Live scope — the empty state renders instead.
    if (!clientId) return;

    const ac = new AbortController();
    cachedJsonFetch<{ activities?: Activity[]; error?: string }>(
      cacheKeyFor(clientId),
      `/api/clients/${clientId}/activity?limit=200`,
      { signal: ac.signal, preferCache: false, staleTime: 30_000 },
    )
      .then(d => {
        if (ac.signal.aborted) return;
        setFetched({ clientId, rows: d.error ? [] : d.activities ?? [], error: d.error ?? "" });
      })
      .catch(() => {
        if (ac.signal.aborted) return;
        setFetched({ clientId, rows: [], error: "Couldn't load account history" });
      });

    return () => ac.abort();
  }, [clientId]);

  const settled = fetched?.clientId === clientId ? fetched : null;
  // Revisiting a client shows its cached rows immediately, dimmed, instead of
  // flashing a spinner over history that's already in memory.
  const cachedRows =
    settled || !clientId
      ? null
      : peekCachedJson<{ activities?: Activity[] }>(cacheKeyFor(clientId))?.activities ?? null;

  const activities = settled?.rows ?? cachedRows;
  const error = settled?.error ?? "";
  const loading = Boolean(clientId) && !settled;

  const grouped = useMemo(() => {
    const days = new Map<string, Activity[]>();
    for (const a of activities ?? []) {
      const day = a.occurred_at?.slice(0, 10) ?? "";
      if (!day) continue;
      const bucket = days.get(day);
      if (bucket) bucket.push(a);
      else days.set(day, [a]);
    }
    return [...days.entries()];
  }, [activities]);

  const tenure = client ? describeClientTenure(client, todayYmd) : null;

  function toggleExpanded(a: Activity) {
    const key = activityKey(a);
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

    if (!clientId) return;
    const needsAction = a.source_table === "client_action_logs" && !actionsById[a.source_id];
    const needsPlan =
      (a.source_table === "account_plan_tasks" || a.source_table === "account_week_plans") &&
      Object.keys(plansById).length === 0;
    if (!needsAction && !needsPlan) return;

    setDetailsLoading(true);
    const jobs: Promise<void>[] = [];
    if (needsAction) {
      jobs.push(
        fetch(`/api/client-actions?client_id=${encodeURIComponent(clientId)}`)
          .then(async r => {
            if (!r.ok) return;
            const d = await r.json();
            const map: Record<string, ActionDetail> = {};
            for (const row of d.actions ?? []) {
              if (row?.id) map[row.id] = row;
            }
            setActionsById(map);
          })
          .catch(() => undefined),
      );
    }
    if (needsPlan) {
      jobs.push(
        fetch(`/api/account-week-plans?client_id=${encodeURIComponent(clientId)}&include_tasks=1`)
          .then(async r => {
            if (!r.ok) return;
            const d = await r.json();
            const plans: Record<string, AccountWeekPlan> = {};
            const tasks: Record<string, AccountPlanTask> = {};
            for (const plan of d.plans ?? []) {
              plans[plan.id] = plan;
              for (const task of plan.tasks ?? []) tasks[task.id] = task;
            }
            setPlansById(plans);
            setTasksById(tasks);
          })
          .catch(() => undefined),
      );
    }
    Promise.all(jobs).finally(() => setDetailsLoading(false));
  }

  return (
    <aside
      className="hidden lg:flex shrink-0 flex-col w-96 rounded-2xl overflow-hidden self-start sticky top-28"
      style={{
        background: "var(--color-ws-panel)",
        border: "1px solid var(--color-ws-hairline)",
        maxHeight: "calc(100vh - 12rem)",
      }}
    >
      <header
        className="flex items-start gap-2 px-4 py-3 shrink-0"
        style={{ borderBottom: "1px solid var(--color-ws-hairline)" }}
      >
        <div className="min-w-0 flex-1">
          <p
            className="text-[10px] font-bold uppercase tracking-widest font-display"
            style={{ color: "var(--color-ws-text-ghost)" }}
          >
            Account history
          </p>
          <p className="text-sm font-semibold truncate mt-0.5" style={{ color: "var(--color-ws-text)" }}>
            {client?.name ?? "No client selected"}
          </p>
          {tenure && (
            <p className="text-[11px] mt-0.5" style={{ color: "var(--color-ws-text-faint)" }}>
              {tenure.liveLabel}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 p-1 rounded-md transition-colors"
          style={{ color: "var(--color-ws-text-faint)" }}
          aria-label="Hide account history"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3">
        {/* Stays mounted under All / Live scope so the rail doesn't appear to
            break when you widen the filter — it explains what it needs instead. */}
        {!client ? (
          <p className="text-xs py-6 text-center leading-relaxed" style={{ color: "var(--color-ws-text-ghost)" }}>
            Select a single client in the filter bar to see its account history — status changes, calls,
            notes, interventions, touchpoints and billing.
          </p>
        ) : loading && !activities ? (
          <p className="text-xs py-6 text-center" style={{ color: "var(--color-ws-text-ghost)" }}>
            Loading history…
          </p>
        ) : error ? (
          <p className="text-xs py-6 text-center" style={{ color: "var(--color-ws-text-faint)" }}>
            {error}
          </p>
        ) : grouped.length === 0 ? (
          <p className="text-xs py-6 text-center leading-relaxed" style={{ color: "var(--color-ws-text-ghost)" }}>
            Nothing logged yet. Status changes, calls, notes, interventions, touchpoints and billings show up here.
          </p>
        ) : (
          <div
            className="space-y-4 transition-opacity duration-200 ease-ws"
            style={{ opacity: loading ? 0.55 : 1 }}
            aria-busy={loading}
          >
            {grouped.map(([day, items]) => (
              <section key={day}>
                <p
                  className="text-[10px] font-semibold uppercase tracking-widest mb-1.5 font-data"
                  style={{ color: "var(--color-ws-text-ghost)" }}
                >
                  {dayLabel(day, todayYmd)}
                </p>
                <div className="space-y-1.5">
                  {items.map(a => {
                    const style = styleFor(a.activity_type, a.subtype);
                    const key = activityKey(a);
                    const open = expanded.has(key);
                    const action = a.source_table === "client_action_logs" ? actionsById[a.source_id] : undefined;
                    const task = a.source_table === "account_plan_tasks" ? tasksById[a.source_id] : undefined;
                    const plan = a.source_table === "account_week_plans" ? plansById[a.source_id] : undefined;
                    const taskPlan = task ? plansById[task.plan_id] : undefined;
                    return (
                      <article
                        key={key}
                        className="rounded-lg px-2.5 py-2"
                        style={{
                          background: "var(--color-ws-base)",
                          borderLeft: `2px solid ${style.color}`,
                        }}
                      >
                        <button
                          type="button"
                          className="w-full text-left"
                          aria-expanded={open}
                          onClick={() => toggleExpanded(a)}
                        >
                          <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-semibold">
                            <span style={{ color: style.color }}>{style.label}</span>
                            <span style={{ color: "var(--color-ws-text-ghost)" }}>
                              {timeLabel(a.occurred_at)}
                            </span>
                            <span
                              className="ml-auto normal-case tracking-normal font-medium"
                              style={{ color: "var(--color-ws-text-faint)" }}
                            >
                              {open ? "Hide" : "Details"}
                            </span>
                          </p>
                          <p
                            className={`text-xs mt-1 leading-relaxed break-words ${open ? "" : "line-clamp-2"}`}
                            style={{ color: "var(--color-ws-text-muted)" }}
                          >
                            {overviewFor(a, action, task)}
                          </p>
                        </button>
                        {open && action && <ActionDetails action={action} />}
                        {open && task && <TaskDetails task={task} plan={taskPlan} />}
                        {open && plan && <PlanDetails plan={plan} />}
                        {open && !action && !task && !plan && (
                          <p
                            className="text-xs mt-2 pt-2 leading-relaxed whitespace-pre-wrap break-words"
                            style={{
                              color: "var(--color-ws-text-muted)",
                              borderTop: "1px solid var(--color-ws-hairline)",
                            }}
                          >
                            {detailsLoading ? "Loading details…" : a.summary ?? "—"}
                          </p>
                        )}
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}

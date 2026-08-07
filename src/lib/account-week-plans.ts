/**
 * Account week plans — plan + task domain rules.
 * Spec: Wm-os docs/superpowers/specs/2026-08-06-account-week-plans-design.md
 */

import { CALL_CENTER_TIMEZONE } from '@/lib/time';
import { addDaysToYmd } from '@/lib/team-meetings';

export type AccountWeekPlanStatus = 'pending' | 'approved' | 'rejected';
export type AccountPlanTaskStatus = 'open' | 'done' | 'cancelled';
export type AccountWeekPlanSeverity = '911' | 'below' | 'watch';

export type AccountWeekPlan = {
  id: string;
  client_id: string;
  week_start: string;
  why: string;
  severity: AccountWeekPlanSeverity | null;
  status: AccountWeekPlanStatus;
  success_signal: string | null;
  origin_meeting_id: string | null;
  approved_by: string | null;
  approved_at: string | null;
  founder_note: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  client_name?: string | null;
  tasks?: AccountPlanTask[];
};

export type AccountPlanTaskReviewVerdict =
  | 'helped'
  | 'no_change'
  | 'hurt'
  | 'unclear'
  | 'too_early';

export type AccountPlanTask = {
  id: string;
  plan_id: string;
  client_id: string;
  title: string;
  notes: string | null;
  tactic_tag: string | null;
  assignee_user_id: string | null;
  scheduled_for: string | null;
  status: AccountPlanTaskStatus;
  completion_report: string | null;
  completed_at: string | null;
  completed_by: string | null;
  client_action_log_id: string | null;
  success_metric: string | null;
  baseline_value: number | null;
  outcome_value: number | null;
  review_notes: string | null;
  review_verdict: AccountPlanTaskReviewVerdict | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export const ACCOUNT_PLAN_TASK_REVIEW_VERDICTS: AccountPlanTaskReviewVerdict[] = [
  'helped',
  'no_change',
  'hurt',
  'unclear',
  'too_early',
];

export function isAccountPlanTaskReviewVerdict(
  v: unknown,
): v is AccountPlanTaskReviewVerdict {
  return (
    typeof v === 'string' &&
    (ACCOUNT_PLAN_TASK_REVIEW_VERDICTS as string[]).includes(v)
  );
}

export const ACCOUNT_WEEK_PLAN_STATUSES: AccountWeekPlanStatus[] = [
  'pending',
  'approved',
  'rejected',
];

export const ACCOUNT_PLAN_TASK_STATUSES: AccountPlanTaskStatus[] = [
  'open',
  'done',
  'cancelled',
];

export function isAccountWeekPlanStatus(v: unknown): v is AccountWeekPlanStatus {
  return typeof v === 'string' && (ACCOUNT_WEEK_PLAN_STATUSES as string[]).includes(v);
}

export function isAccountPlanTaskStatus(v: unknown): v is AccountPlanTaskStatus {
  return typeof v === 'string' && (ACCOUNT_PLAN_TASK_STATUSES as string[]).includes(v);
}

/** Monday of the calendar week containing `ymd` (America/Sao_Paulo weekday). */
export function weekStartMondayContaining(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d, 15, 0, 0));
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: CALL_CENTER_TIMEZONE,
    weekday: 'short',
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
  return addDaysToYmd(ymd, -offset);
}

export function canTransitionPlan(
  from: AccountWeekPlanStatus,
  to: AccountWeekPlanStatus,
): { ok: true } | { ok: false; error: string } {
  if (from === to) return { ok: false, error: `Already ${from}` };
  if (from === 'pending' && (to === 'approved' || to === 'rejected')) {
    return { ok: true };
  }
  return {
    ok: false,
    error: `Cannot move plan from ${from} to ${to}`,
  };
}

export function canCompleteTask(opts: {
  planStatus: AccountWeekPlanStatus;
  taskStatus: AccountPlanTaskStatus;
}): { ok: true } | { ok: false; error: string } {
  if (opts.planStatus !== 'approved') {
    return { ok: false, error: 'Plan must be approved before completing tasks' };
  }
  if (opts.taskStatus !== 'open') {
    return { ok: false, error: `Task is ${opts.taskStatus}, not open` };
  }
  return { ok: true };
}

/** Future dashboard: open tasks on approved plans for person/day. */
export function filterActiveWorkTasks<
  T extends {
    plan_status: AccountWeekPlanStatus;
    status: AccountPlanTaskStatus;
    assignee_user_id: string | null;
    scheduled_for: string | null;
  },
>(
  rows: T[],
  filters?: { assigneeUserId?: string; scheduledFor?: string },
): T[] {
  return rows.filter(r => {
    if (r.plan_status !== 'approved') return false;
    if (r.status !== 'open') return false;
    if (filters?.assigneeUserId && r.assignee_user_id !== filters.assigneeUserId) {
      return false;
    }
    if (filters?.scheduledFor && r.scheduled_for !== filters.scheduledFor) {
      return false;
    }
    return true;
  });
}

export function softDuplicatePlanWarn<
  T extends { client_id: string; week_start: string; status: AccountWeekPlanStatus },
>(rows: T[], clientId: string, weekStart: string): boolean {
  return rows.some(
    r =>
      r.client_id === clientId &&
      r.week_start === weekStart &&
      r.status !== 'rejected',
  );
}

export function weekPlanModeForTemplateSlug(
  slug: string,
): 'intake' | 'review' | null {
  if (slug === 'mon-kpi-week-plan') return 'intake';
  if (slug === 'thu-kpi-commitment-check') return 'review';
  return null;
}

export function canApprovePlans(opts: {
  isOwner: boolean;
  hasCeoPermission: boolean;
}): boolean {
  return opts.isOwner || opts.hasCeoPermission;
}

/** Open work past its scheduled day (call-center calendar). */
export function isTaskOverdue(opts: {
  planStatus: AccountWeekPlanStatus;
  taskStatus: AccountPlanTaskStatus;
  scheduledFor: string | null | undefined;
  todayYmd: string;
}): boolean {
  if (opts.planStatus !== 'approved') return false;
  if (opts.taskStatus !== 'open') return false;
  if (!opts.scheduledFor || !/^\d{4}-\d{2}-\d{2}/.test(opts.scheduledFor)) return false;
  return opts.scheduledFor.slice(0, 10) < opts.todayYmd;
}

export type CalendarTaskItem = AccountPlanTask & {
  plan_status: AccountWeekPlanStatus;
  client_name: string | null;
  why: string;
  overdue: boolean;
};

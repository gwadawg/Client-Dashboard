import type { AuthContext } from '@/lib/api-auth';
import { requireAnyPermission } from '@/lib/api-auth';
import type { AccountPlanTask, AccountWeekPlan } from '@/lib/account-week-plans';
import { hasPermission } from '@/lib/permissions';

export const PLAN_SELECT =
  'id, client_id, week_start, why, severity, status, success_signal, origin_meeting_id, approved_by, approved_at, founder_note, created_by, created_at, updated_at';

export const TASK_SELECT =
  'id, plan_id, client_id, title, notes, tactic_tag, assignee_user_id, scheduled_for, status, completion_report, completed_at, completed_by, client_action_log_id, success_metric, baseline_value, outcome_value, review_notes, review_verdict, reviewed_at, reviewed_by, work_type, sort_order, created_at, updated_at';

const PLAN_ACCESS = ['account_work', 'team_meetings', 'client_health', 'ceo'] as const;

export function requirePlanAccess(ctx: AuthContext) {
  return requireAnyPermission(ctx, [...PLAN_ACCESS]);
}

export function userCanApprovePlans(ctx: AuthContext): boolean {
  if (ctx.isOwner) return true;
  return hasPermission('ceo', {
    isOwner: ctx.isOwner,
    allowedPermissions: ctx.allowedPermissions,
  });
}

export async function loadTasksForPlans(
  service: AuthContext['service'],
  planIds: string[],
): Promise<AccountPlanTask[]> {
  if (!planIds.length) return [];
  const { data, error } = await service
    .from('account_plan_tasks')
    .select(TASK_SELECT)
    .in('plan_id', planIds)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as AccountPlanTask[];
}

export function nestTasks(
  plans: AccountWeekPlan[],
  tasks: AccountPlanTask[],
): AccountWeekPlan[] {
  const byPlan = new Map<string, AccountPlanTask[]>();
  for (const t of tasks) {
    const list = byPlan.get(t.plan_id) ?? [];
    list.push(t);
    byPlan.set(t.plan_id, list);
  }
  return plans.map(p => ({ ...p, tasks: byPlan.get(p.id) ?? [] }));
}

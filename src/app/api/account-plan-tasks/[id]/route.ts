import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError } from '@/lib/api-auth';
import {
  canCompleteTask,
  isAccountPlanTaskReviewVerdict,
  isAccountPlanTaskStatus,
  type AccountPlanTask,
  type AccountWeekPlan,
  type AccountWeekPlanStatus,
} from '@/lib/account-week-plans';
import {
  PLAN_SELECT,
  TASK_SELECT,
  requirePlanAccess,
} from '@/lib/account-week-plans-api';
import {
  compareTaskKpi,
  isSuccessMetricKey,
} from '@/lib/account-plan-task-kpi';
import { createClientActionLog } from '@/lib/client-action-log-write';
import { defaultReviewDateFromTimebox } from '@/lib/client-health-interventions';
import { isWorkType, parseWorkType } from '@/lib/client-work-log';
import { CALL_CENTER_TIMEZONE, todayYmdInCallCenterTz, ymdInTimeZone } from '@/lib/time';

function optionalText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  return t || null;
}

type RouteCtx = { params: Promise<{ id: string }> };

export async function GET(req: Request, routeCtx: RouteCtx) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requirePlanAccess(ctx);
  if (denied) return denied;

  const { id } = await routeCtx.params;
  const url = new URL(req.url);
  const view = url.searchParams.get('view');

  const { data: existing, error: loadErr } = await ctx.service
    .from('account_plan_tasks')
    .select(TASK_SELECT)
    .eq('id', id)
    .maybeSingle();

  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const task = existing as AccountPlanTask;

  if (view === 'kpi') {
    const metric =
      (typeof url.searchParams.get('metric') === 'string' &&
        url.searchParams.get('metric')) ||
      task.success_metric;
    if (!isSuccessMetricKey(metric)) {
      return NextResponse.json(
        { error: 'Task has no success_metric (or pass ?metric=)' },
        { status: 400 },
      );
    }
    const changeDate = task.completed_at
      ? ymdInTimeZone(new Date(task.completed_at), CALL_CENTER_TIMEZONE)
      : task.scheduled_for?.slice(0, 10) || todayYmdInCallCenterTz();

    try {
      const kpi = await compareTaskKpi(ctx.service, {
        clientId: task.client_id,
        successMetric: metric,
        changeDate,
        storedBaseline: task.baseline_value,
      });
      return NextResponse.json({ task, kpi });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : 'KPI compare failed' },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({ task });
}

export async function PATCH(req: Request, routeCtx: RouteCtx) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requirePlanAccess(ctx);
  if (denied) return denied;

  const { id } = await routeCtx.params;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { data: existing, error: loadErr } = await ctx.service
    .from('account_plan_tasks')
    .select(TASK_SELECT)
    .eq('id', id)
    .maybeSingle();

  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const task = existing as AccountPlanTask;

  const { data: planRow, error: planErr } = await ctx.service
    .from('account_week_plans')
    .select(PLAN_SELECT)
    .eq('id', task.plan_id)
    .maybeSingle();

  if (planErr) return NextResponse.json({ error: planErr.message }, { status: 500 });
  if (!planRow) return NextResponse.json({ error: 'Plan not found' }, { status: 404 });

  const plan = planRow as AccountWeekPlan;
  const now = new Date().toISOString();

  // Team review on done tasks
  if (body.review === true || body.review_notes != null || body.review_verdict != null) {
    if (task.status !== 'done') {
      return NextResponse.json(
        { error: 'Only done tasks can be reviewed' },
        { status: 400 },
      );
    }

    const patch: Record<string, unknown> = {
      updated_at: now,
      reviewed_at: now,
      reviewed_by: ctx.userId,
    };

    if (typeof body.review_notes === 'string') {
      patch.review_notes = body.review_notes.trim() || null;
    }
    if (body.review_verdict != null) {
      if (body.review_verdict === '' || body.review_verdict === null) {
        patch.review_verdict = null;
      } else if (!isAccountPlanTaskReviewVerdict(body.review_verdict)) {
        return NextResponse.json({ error: 'Invalid review_verdict' }, { status: 400 });
      } else {
        patch.review_verdict = body.review_verdict;
      }
    }

    if (body.recompute_kpi === true && task.success_metric && isSuccessMetricKey(task.success_metric)) {
      const changeDate = task.completed_at
        ? ymdInTimeZone(new Date(task.completed_at), CALL_CENTER_TIMEZONE)
        : todayYmdInCallCenterTz();
      try {
        const kpi = await compareTaskKpi(ctx.service, {
          clientId: task.client_id,
          successMetric: task.success_metric,
          changeDate,
          storedBaseline: task.baseline_value,
        });
        if (kpi.baseline_value != null) patch.baseline_value = kpi.baseline_value;
        if (kpi.outcome_value != null) patch.outcome_value = kpi.outcome_value;
      } catch {
        // keep review save even if KPI compute fails
      }
    } else if (body.outcome_value != null && Number.isFinite(Number(body.outcome_value))) {
      patch.outcome_value = Number(body.outcome_value);
    }

    const { data: updated, error: updErr } = await ctx.service
      .from('account_plan_tasks')
      .update(patch)
      .eq('id', id)
      .select(TASK_SELECT)
      .single();

    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });
    return NextResponse.json({ task: updated });
  }

  if (body.status != null) {
    if (!isAccountPlanTaskStatus(body.status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    if (body.status === 'done') {
      const check = canCompleteTask({
        planStatus: plan.status as AccountWeekPlanStatus,
        taskStatus: task.status,
      });
      if (!check.ok) {
        return NextResponse.json({ error: check.error }, { status: 400 });
      }

      const completion_report = optionalText(body.completion_report);
      let client_action_log_id: string | null = task.client_action_log_id;
      let success_metric = task.success_metric;
      if (body.success_metric != null) {
        if (body.success_metric === '' || body.success_metric === null) {
          success_metric = null;
        } else if (!isSuccessMetricKey(body.success_metric)) {
          return NextResponse.json({ error: 'Invalid success_metric' }, { status: 400 });
        } else {
          success_metric = body.success_metric;
        }
      }

      const work_type = isWorkType(body.work_type)
        ? body.work_type
        : parseWorkType(task.work_type, 'cadence');

      if (work_type === 'bet' && !success_metric) {
        return NextResponse.json(
          { error: 'Bet tasks require a success metric before they can be marked done' },
          { status: 400 },
        );
      }

      let baseline_value = task.baseline_value;
      const changeDate = todayYmdInCallCenterTz();

      if (!client_action_log_id) {
        try {
          const { action } = await createClientActionLog(ctx.service, ctx.userId, {
            client_id: task.client_id,
            title: task.title,
            work_type,
            change_description:
              completion_report || task.notes || `Completed plan task: ${task.title}`,
            hypothesis: work_type === 'bet' ? task.notes : null,
            constraint_label: task.tactic_tag,
            success_metric: work_type === 'bet' ? success_metric : null,
            status: work_type === 'bet' ? 'in_progress' : 'in_progress',
            change_date: changeDate,
            planned_date: task.scheduled_for,
            review_date: work_type === 'bet' ? defaultReviewDateFromTimebox('7 days') : null,
          });
          client_action_log_id = typeof action.id === 'string' ? action.id : null;
          if (typeof action.baseline_value === 'number') {
            baseline_value = action.baseline_value;
          }
        } catch (e) {
          return NextResponse.json(
            { error: e instanceof Error ? e.message : 'Failed to file work log' },
            { status: 500 },
          );
        }
      }

      const { data: updated, error: updErr } = await ctx.service
        .from('account_plan_tasks')
        .update({
          status: 'done',
          completion_report,
          completed_at: now,
          completed_by: ctx.userId,
          client_action_log_id,
          success_metric,
          baseline_value,
          work_type,
          updated_at: now,
        })
        .eq('id', id)
        .select(TASK_SELECT)
        .single();

      if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });
      return NextResponse.json({ task: updated });
    }

    if (body.status === 'cancelled') {
      if (task.status !== 'open') {
        return NextResponse.json(
          { error: 'Only open tasks can be cancelled' },
          { status: 400 },
        );
      }
      const { data: updated, error: updErr } = await ctx.service
        .from('account_plan_tasks')
        .update({ status: 'cancelled', updated_at: now })
        .eq('id', id)
        .select(TASK_SELECT)
        .single();
      if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });
      return NextResponse.json({ task: updated });
    }

    return NextResponse.json({ error: 'Unsupported status' }, { status: 400 });
  }

  // Field updates — open: full edit; done: success_metric only
  const patch: Record<string, unknown> = { updated_at: now };

  if (task.status === 'done') {
    if (body.success_metric != null) {
      if (body.success_metric === '' || body.success_metric === null) {
        patch.success_metric = null;
      } else if (!isSuccessMetricKey(body.success_metric)) {
        return NextResponse.json({ error: 'Invalid success_metric' }, { status: 400 });
      } else {
        patch.success_metric = body.success_metric;
      }
    } else {
      return NextResponse.json(
        { error: 'Done tasks only accept review or success_metric updates' },
        { status: 400 },
      );
    }
  } else if (task.status === 'open') {
    if (plan.status !== 'pending' && plan.status !== 'approved') {
      return NextResponse.json(
        { error: 'Cannot edit tasks on a rejected plan' },
        { status: 400 },
      );
    }
    if (typeof body.title === 'string') {
      if (!body.title.trim()) {
        return NextResponse.json({ error: 'title is required' }, { status: 400 });
      }
      patch.title = body.title.trim();
    }
    if (typeof body.notes === 'string') patch.notes = body.notes.trim() || null;
    if (typeof body.tactic_tag === 'string') patch.tactic_tag = body.tactic_tag.trim() || null;
    if (body.assignee_user_id === null) patch.assignee_user_id = null;
    else if (typeof body.assignee_user_id === 'string') {
      patch.assignee_user_id = body.assignee_user_id.trim() || null;
    }
    if (body.scheduled_for === null || body.scheduled_for === '') {
      patch.scheduled_for = null;
    } else if (
      typeof body.scheduled_for === 'string' &&
      /^\d{4}-\d{2}-\d{2}/.test(body.scheduled_for)
    ) {
      patch.scheduled_for = body.scheduled_for.slice(0, 10);
    }
    if (body.success_metric === null || body.success_metric === '') {
      patch.success_metric = null;
    } else if (typeof body.success_metric === 'string') {
      if (!isSuccessMetricKey(body.success_metric)) {
        return NextResponse.json({ error: 'Invalid success_metric' }, { status: 400 });
      }
      patch.success_metric = body.success_metric;
    }
    if (typeof body.sort_order === 'number') patch.sort_order = body.sort_order;
    if (body.work_type != null) {
      if (!isWorkType(body.work_type)) {
        return NextResponse.json({ error: 'Invalid work_type' }, { status: 400 });
      }
      patch.work_type = body.work_type;
    }
  } else {
    return NextResponse.json(
      { error: 'Only open tasks can be edited (or done for review)' },
      { status: 400 },
    );
  }

  const { data: updated, error: updErr } = await ctx.service
    .from('account_plan_tasks')
    .update(patch)
    .eq('id', id)
    .select(TASK_SELECT)
    .single();

  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });
  return NextResponse.json({ task: updated });
}

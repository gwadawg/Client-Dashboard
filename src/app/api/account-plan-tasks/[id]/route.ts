import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError } from '@/lib/api-auth';
import {
  canCompleteTask,
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
import { todayYmdInCallCenterTz } from '@/lib/time';

function optionalText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  return t || null;
}

type RouteCtx = { params: Promise<{ id: string }> };

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

      if (body.log_as_account_change === true) {
        const today = todayYmdInCallCenterTz();
        const { data: action, error: actErr } = await ctx.service
          .from('client_action_logs')
          .insert({
            client_id: task.client_id,
            title: task.title,
            change_description:
              completion_report || task.notes || `Completed plan task: ${task.title}`,
            hypothesis: task.notes,
            constraint_label: task.tactic_tag,
            status: 'in_progress',
            change_date: today,
            created_by: ctx.userId,
          })
          .select('id')
          .single();
        if (actErr) {
          return NextResponse.json({ error: actErr.message }, { status: 500 });
        }
        client_action_log_id = (action as { id: string }).id;
      }

      const { data: updated, error: updErr } = await ctx.service
        .from('account_plan_tasks')
        .update({
          status: 'done',
          completion_report,
          completed_at: now,
          completed_by: ctx.userId,
          client_action_log_id,
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

  // Field updates on open tasks
  if (task.status !== 'open') {
    return NextResponse.json(
      { error: 'Only open tasks can be edited' },
      { status: 400 },
    );
  }
  if (plan.status !== 'pending' && plan.status !== 'approved') {
    return NextResponse.json(
      { error: 'Cannot edit tasks on a rejected plan' },
      { status: 400 },
    );
  }

  const patch: Record<string, unknown> = { updated_at: now };
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
  if (typeof body.sort_order === 'number') patch.sort_order = body.sort_order;

  const { data: updated, error: updErr } = await ctx.service
    .from('account_plan_tasks')
    .update(patch)
    .eq('id', id)
    .select(TASK_SELECT)
    .single();

  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });
  return NextResponse.json({ task: updated });
}

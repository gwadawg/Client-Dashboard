import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError } from '@/lib/api-auth';
import {
  canTransitionPlan,
  isAccountWeekPlanStatus,
  type AccountWeekPlan,
  type AccountWeekPlanSeverity,
} from '@/lib/account-week-plans';
import {
  PLAN_SELECT,
  loadTasksForPlans,
  nestTasks,
  requirePlanAccess,
  userCanApprovePlans,
} from '@/lib/account-week-plans-api';
import { parseWorkType } from '@/lib/client-work-log';

const SEVERITIES: AccountWeekPlanSeverity[] = ['911', 'below', 'watch'];

function optionalText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  return t || null;
}

type RouteCtx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, routeCtx: RouteCtx) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requirePlanAccess(ctx);
  if (denied) return denied;

  const { id } = await routeCtx.params;
  const { data, error } = await ctx.service
    .from('account_week_plans')
    .select(PLAN_SELECT)
    .eq('id', id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const plan = data as AccountWeekPlan;
  const { data: client } = await ctx.service
    .from('clients')
    .select('id, name')
    .eq('id', plan.client_id)
    .maybeSingle();

  try {
    const tasks = await loadTasksForPlans(ctx.service, [plan.id]);
    return NextResponse.json({
      plan: {
        ...nestTasks(
          [{ ...plan, client_name: (client as { name?: string } | null)?.name ?? null }],
          tasks,
        )[0],
      },
      can_approve: userCanApprovePlans(ctx),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to load tasks' },
      { status: 500 },
    );
  }
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
    .from('account_week_plans')
    .select(PLAN_SELECT)
    .eq('id', id)
    .maybeSingle();

  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const row = existing as AccountWeekPlan;
  const now = new Date().toISOString();

  if (body.status != null) {
    if (!isAccountWeekPlanStatus(body.status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }
    if (body.status === 'approved' || body.status === 'rejected') {
      if (!userCanApprovePlans(ctx)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      const transition = canTransitionPlan(row.status, body.status);
      if (!transition.ok) {
        return NextResponse.json({ error: transition.error }, { status: 400 });
      }

      if (body.status === 'rejected') {
        const note = optionalText(body.founder_note);
        if (!note) {
          return NextResponse.json(
            { error: 'founder_note is required when rejecting' },
            { status: 400 },
          );
        }
      }

      if (body.status === 'approved') {
        const { data: openTasks } = await ctx.service
          .from('account_plan_tasks')
          .select('id')
          .eq('plan_id', id)
          .eq('status', 'open');
        if (!openTasks?.length) {
          return NextResponse.json(
            { error: 'Add at least one open task before approving' },
            { status: 400 },
          );
        }
      }

      const patch: Record<string, unknown> = {
        status: body.status,
        updated_at: now,
        founder_note: optionalText(body.founder_note) ?? row.founder_note,
      };

      if (body.status === 'approved') {
        patch.approved_by = ctx.userId;
        patch.approved_at = now;
      }

      if (body.status === 'rejected') {
        patch.founder_note = optionalText(body.founder_note);
      }

      const { data: updated, error: updErr } = await ctx.service
        .from('account_week_plans')
        .update(patch)
        .eq('id', id)
        .select(PLAN_SELECT)
        .single();

      if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

      if (body.status === 'rejected') {
        await ctx.service
          .from('account_plan_tasks')
          .update({ status: 'cancelled', updated_at: now })
          .eq('plan_id', id)
          .eq('status', 'open');
      }

      const tasks = await loadTasksForPlans(ctx.service, [id]);
      return NextResponse.json({
        plan: nestTasks([updated as AccountWeekPlan], tasks)[0],
      });
    }

    return NextResponse.json({ error: 'Invalid status transition' }, { status: 400 });
  }

  if (row.status !== 'pending') {
    return NextResponse.json(
      { error: 'Only pending plans can be edited' },
      { status: 400 },
    );
  }

  const patch: Record<string, unknown> = { updated_at: now };

  if (typeof body.why === 'string') {
    if (!body.why.trim()) {
      return NextResponse.json({ error: 'why is required' }, { status: 400 });
    }
    patch.why = body.why.trim();
  }
  if (typeof body.success_signal === 'string') {
    patch.success_signal = body.success_signal.trim() || null;
  }
  if (typeof body.week_start === 'string' && /^\d{4}-\d{2}-\d{2}/.test(body.week_start)) {
    patch.week_start = body.week_start.slice(0, 10);
  }
  if (body.severity === null || body.severity === '') {
    patch.severity = null;
  } else if (typeof body.severity === 'string') {
    if (!SEVERITIES.includes(body.severity as AccountWeekPlanSeverity)) {
      return NextResponse.json({ error: 'Invalid severity' }, { status: 400 });
    }
    patch.severity = body.severity;
  }

  if (Array.isArray(body.tasks)) {
    const { data: currentTasks } = await ctx.service
      .from('account_plan_tasks')
      .select('id, status')
      .eq('plan_id', id);
    if ((currentTasks ?? []).some(t => t.status === 'done')) {
      return NextResponse.json(
        { error: 'Cannot replace tasks after a completion' },
        { status: 400 },
      );
    }

    const { error: delErr } = await ctx.service
      .from('account_plan_tasks')
      .delete()
      .eq('plan_id', id);
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

    for (let i = 0; i < body.tasks.length; i++) {
      const item = body.tasks[i] as Record<string, unknown>;
      const title = typeof item.title === 'string' ? item.title.trim() : '';
      if (!title) {
        return NextResponse.json({ error: `tasks[${i}].title is required` }, { status: 400 });
      }
      const scheduled =
        typeof item.scheduled_for === 'string' && /^\d{4}-\d{2}-\d{2}/.test(item.scheduled_for)
          ? item.scheduled_for.slice(0, 10)
          : null;
      const { error: insErr } = await ctx.service.from('account_plan_tasks').insert({
        plan_id: id,
        client_id: row.client_id,
        title,
        notes: optionalText(item.notes),
        tactic_tag: optionalText(item.tactic_tag),
        assignee_user_id: optionalText(item.assignee_user_id),
        scheduled_for: scheduled,
        success_metric:
          typeof item.success_metric === 'string' && item.success_metric.trim()
            ? item.success_metric.trim()
            : null,
        work_type: parseWorkType(item.work_type, 'cadence'),
        status: 'open',
        sort_order: typeof item.sort_order === 'number' ? item.sort_order : i,
      });
      if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
    }
  }

  const { data: updated, error: updErr } = await ctx.service
    .from('account_week_plans')
    .update(patch)
    .eq('id', id)
    .select(PLAN_SELECT)
    .single();

  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  const tasks = await loadTasksForPlans(ctx.service, [id]);
  return NextResponse.json({
    plan: nestTasks([updated as AccountWeekPlan], tasks)[0],
  });
}

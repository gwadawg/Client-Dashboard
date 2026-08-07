import { NextResponse } from 'next/server';
import {
  getAuthContext,
  isAuthError,
} from '@/lib/api-auth';
import {
  softDuplicatePlanWarn,
  weekStartMondayContaining,
  type AccountPlanTask,
  type AccountWeekPlan,
  type AccountWeekPlanSeverity,
  type AccountWeekPlanStatus,
} from '@/lib/account-week-plans';
import {
  PLAN_SELECT,
  TASK_SELECT,
  loadTasksForPlans,
  nestTasks,
  requirePlanAccess,
  userCanApprovePlans,
} from '@/lib/account-week-plans-api';
import { todayYmdInCallCenterTz } from '@/lib/time';

const SEVERITIES: AccountWeekPlanSeverity[] = ['911', 'below', 'watch'];

function optionalText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  return t || null;
}

function requiredText(value: unknown, field: string): string | NextResponse {
  if (typeof value !== 'string' || !value.trim()) {
    return NextResponse.json({ error: `${field} is required` }, { status: 400 });
  }
  return value.trim();
}

function attachClientNames(
  rows: AccountWeekPlan[],
  clients: { id: string; name: string }[],
): AccountWeekPlan[] {
  const map = new Map(clients.map(c => [c.id, c.name]));
  return rows.map(r => ({ ...r, client_name: map.get(r.client_id) ?? null }));
}

type TaskInput = {
  title: string;
  notes: string | null;
  tactic_tag: string | null;
  assignee_user_id: string | null;
  scheduled_for: string | null;
  sort_order: number;
};

function parseTasks(raw: unknown): TaskInput[] | NextResponse {
  if (raw == null) return [];
  if (!Array.isArray(raw)) {
    return NextResponse.json({ error: 'tasks must be an array' }, { status: 400 });
  }
  const out: TaskInput[] = [];
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i];
    if (!item || typeof item !== 'object') {
      return NextResponse.json({ error: `tasks[${i}] invalid` }, { status: 400 });
    }
    const row = item as Record<string, unknown>;
    const title = typeof row.title === 'string' ? row.title.trim() : '';
    if (!title) {
      return NextResponse.json({ error: `tasks[${i}].title is required` }, { status: 400 });
    }
    const scheduled =
      typeof row.scheduled_for === 'string' && /^\d{4}-\d{2}-\d{2}/.test(row.scheduled_for)
        ? row.scheduled_for.slice(0, 10)
        : null;
    out.push({
      title,
      notes: optionalText(row.notes),
      tactic_tag: optionalText(row.tactic_tag),
      assignee_user_id: optionalText(row.assignee_user_id),
      scheduled_for: scheduled,
      sort_order: typeof row.sort_order === 'number' ? row.sort_order : i,
    });
  }
  return out;
}

export async function GET(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requirePlanAccess(ctx);
  if (denied) return denied;

  const url = new URL(req.url);
  const view = url.searchParams.get('view');
  const weekStart = url.searchParams.get('week_start');
  const clientId = url.searchParams.get('client_id');
  const originMeetingId = url.searchParams.get('origin_meeting_id');
  const includeTasks = url.searchParams.get('include_tasks') !== '0';

  let query = ctx.service
    .from('account_week_plans')
    .select(PLAN_SELECT)
    .order('week_start', { ascending: false })
    .order('created_at', { ascending: false });

  if (view === 'pending_approval') {
    query = query.eq('status', 'pending');
  }
  if (weekStart) {
    query = query.eq('week_start', weekStart.slice(0, 10));
  }
  if (clientId) {
    query = query.eq('client_id', clientId);
  }
  if (originMeetingId) {
    query = query.eq('origin_meeting_id', originMeetingId);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let rows = (data ?? []) as AccountWeekPlan[];

  const clientIds = [...new Set(rows.map(r => r.client_id))];
  let clients: { id: string; name: string }[] = [];
  if (clientIds.length) {
    const { data: clientRows } = await ctx.service
      .from('clients')
      .select('id, name')
      .in('id', clientIds);
    clients = (clientRows ?? []) as { id: string; name: string }[];
  }

  rows = attachClientNames(rows, clients);

  if (includeTasks) {
    try {
      const tasks = await loadTasksForPlans(
        ctx.service,
        rows.map(r => r.id),
      );
      rows = nestTasks(rows, tasks);
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : 'Failed to load tasks' },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({
    plans: rows,
    can_approve: userCanApprovePlans(ctx),
  });
}

export async function POST(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requirePlanAccess(ctx);
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const clientId = requiredText(body.client_id, 'client_id');
  if (clientId instanceof NextResponse) return clientId;

  const why = requiredText(body.why, 'why');
  if (why instanceof NextResponse) return why;

  let weekStart =
    typeof body.week_start === 'string' && /^\d{4}-\d{2}-\d{2}/.test(body.week_start)
      ? body.week_start.slice(0, 10)
      : weekStartMondayContaining(todayYmdInCallCenterTz());
  weekStart = weekStartMondayContaining(weekStart);

  let severity: AccountWeekPlanSeverity | null = null;
  if (body.severity != null && body.severity !== '') {
    if (
      typeof body.severity !== 'string' ||
      !SEVERITIES.includes(body.severity as AccountWeekPlanSeverity)
    ) {
      return NextResponse.json(
        { error: 'severity must be 911, below, or watch' },
        { status: 400 },
      );
    }
    severity = body.severity as AccountWeekPlanSeverity;
  }

  const tasks = parseTasks(body.tasks);
  if (tasks instanceof NextResponse) return tasks;

  const { data: existing } = await ctx.service
    .from('account_week_plans')
    .select('client_id, week_start, status')
    .eq('client_id', clientId)
    .eq('week_start', weekStart);

  const duplicate_warning = softDuplicatePlanWarn(
    (existing ?? []) as {
      client_id: string;
      week_start: string;
      status: AccountWeekPlanStatus;
    }[],
    clientId,
    weekStart,
  );

  const insert = {
    client_id: clientId,
    week_start: weekStart,
    why,
    severity,
    status: 'pending' as const,
    success_signal: optionalText(body.success_signal),
    origin_meeting_id: optionalText(body.origin_meeting_id),
    created_by: ctx.userId,
  };

  const { data: plan, error: planErr } = await ctx.service
    .from('account_week_plans')
    .insert(insert)
    .select(PLAN_SELECT)
    .single();

  if (planErr || !plan) {
    return NextResponse.json(
      { error: planErr?.message ?? 'Failed to create plan' },
      { status: 500 },
    );
  }

  let insertedTasks: AccountPlanTask[] = [];
  if (tasks.length) {
    const taskRows = tasks.map(t => ({
      plan_id: (plan as AccountWeekPlan).id,
      client_id: clientId,
      title: t.title,
      notes: t.notes,
      tactic_tag: t.tactic_tag,
      assignee_user_id: t.assignee_user_id,
      scheduled_for: t.scheduled_for,
      status: 'open' as const,
      sort_order: t.sort_order,
    }));
    const { data: taskData, error: taskErr } = await ctx.service
      .from('account_plan_tasks')
      .insert(taskRows)
      .select(TASK_SELECT);
    if (taskErr) {
      return NextResponse.json({ error: taskErr.message }, { status: 500 });
    }
    insertedTasks = (taskData ?? []) as AccountPlanTask[];
  }

  const { data: client } = await ctx.service
    .from('clients')
    .select('id, name')
    .eq('id', clientId)
    .maybeSingle();

  return NextResponse.json({
    plan: {
      ...(plan as AccountWeekPlan),
      client_name: (client as { name?: string } | null)?.name ?? null,
      tasks: insertedTasks,
    },
    duplicate_warning,
  });
}

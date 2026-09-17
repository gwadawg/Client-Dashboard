import { NextResponse } from 'next/server';
import {
  getAuthContext,
  isAuthError,
} from '@/lib/api-auth';
import {
  isTaskOverdue,
  softDuplicatePlanWarn,
  weekStartMondayContaining,
  type AccountPlanTask,
  type AccountWeekPlan,
  type AccountWeekPlanSeverity,
  type AccountWeekPlanStatus,
  type CalendarTaskItem,
} from '@/lib/account-week-plans';
import {
  PLAN_SELECT,
  TASK_SELECT,
  attachAdhocLogsForPlans,
  loadTasksForPlans,
  nestTasks,
  requirePlanAccess,
  userCanApprovePlans,
} from '@/lib/account-week-plans-api';
import { CALL_CENTER_TIMEZONE, todayYmdInCallCenterTz, ymdInTimeZone } from '@/lib/time';
import { addDaysToYmd } from '@/lib/team-meetings';

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

/** Flat schedule tasks for calendar / overdue board. */
async function loadCalendarTasks(
  service: Parameters<typeof loadTasksForPlans>[0],
  opts: {
    fromYmd?: string | null;
    toYmd?: string | null;
    overdueOnly?: boolean;
  },
): Promise<CalendarTaskItem[]> {
  const today = todayYmdInCallCenterTz();

  let taskQ = service
    .from('account_plan_tasks')
    .select(TASK_SELECT)
    .not('scheduled_for', 'is', null)
    .order('scheduled_for', { ascending: true })
    .order('sort_order', { ascending: true });

  if (opts.overdueOnly) {
    taskQ = taskQ.eq('status', 'open').lt('scheduled_for', today);
  } else {
    if (opts.fromYmd) taskQ = taskQ.gte('scheduled_for', opts.fromYmd);
    if (opts.toYmd) taskQ = taskQ.lte('scheduled_for', opts.toYmd);
  }

  const { data: taskRows, error: taskErr } = await taskQ;
  if (taskErr) throw new Error(taskErr.message);
  const tasks = (taskRows ?? []) as AccountPlanTask[];
  if (!tasks.length) return [];

  const planIds = [...new Set(tasks.map(t => t.plan_id))];
  const { data: planRows, error: planErr } = await service
    .from('account_week_plans')
    .select(PLAN_SELECT)
    .in('id', planIds);
  if (planErr) throw new Error(planErr.message);
  const plans = (planRows ?? []) as AccountWeekPlan[];
  const planById = new Map(plans.map(p => [p.id, p]));

  const clientIds = [...new Set(tasks.map(t => t.client_id))];
  const { data: clientRows } = await service
    .from('clients')
    .select('id, name')
    .in('id', clientIds);
  const nameById = new Map(
    ((clientRows ?? []) as { id: string; name: string }[]).map(c => [c.id, c.name]),
  );

  const items: CalendarTaskItem[] = [];
  for (const t of tasks) {
    const plan = planById.get(t.plan_id);
    if (!plan) continue;
    // Draft plans only show when not overdue-only (calendar can show pending for context)
    if (opts.overdueOnly && plan.status !== 'approved') continue;
    if (plan.status === 'rejected') continue;

    const overdue = isTaskOverdue({
      planStatus: plan.status,
      taskStatus: t.status,
      scheduledFor: t.scheduled_for,
      todayYmd: today,
    });
    if (opts.overdueOnly && !overdue) continue;

    items.push({
      ...t,
      plan_status: plan.status,
      client_name: nameById.get(t.client_id) ?? null,
      why: plan.why,
      overdue,
    });
  }

  return items;
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
  const fromYmd = url.searchParams.get('from');
  const toYmd = url.searchParams.get('to');

  // Calendar / schedule: flat tasks for a date range
  if (view === 'calendar') {
    if (!fromYmd || !toYmd) {
      return NextResponse.json(
        { error: 'from and to (YYYY-MM-DD) are required for view=calendar' },
        { status: 400 },
      );
    }
    try {
      const tasks = await loadCalendarTasks(ctx.service, {
        fromYmd: fromYmd.slice(0, 10),
        toYmd: toYmd.slice(0, 10),
      });
      const overdue = await loadCalendarTasks(ctx.service, { overdueOnly: true });
      return NextResponse.json({
        tasks,
        overdue,
        today: todayYmdInCallCenterTz(),
        from: fromYmd.slice(0, 10),
        to: toYmd.slice(0, 10),
      });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : 'Failed to load calendar' },
        { status: 500 },
      );
    }
  }

  if (view === 'overdue') {
    try {
      const overdue = await loadCalendarTasks(ctx.service, { overdueOnly: true });
      return NextResponse.json({
        tasks: overdue,
        overdue,
        today: todayYmdInCallCenterTz(),
      });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : 'Failed to load overdue' },
        { status: 500 },
      );
    }
  }

  /** Team review: tasks marked done on a call-center calendar day. */
  if (view === 'deployed') {
    const date =
      typeof url.searchParams.get('date') === 'string' &&
      /^\d{4}-\d{2}-\d{2}/.test(url.searchParams.get('date')!)
        ? url.searchParams.get('date')!.slice(0, 10)
        : todayYmdInCallCenterTz();

    // Pull a padded UTC range; filter in app to America/Sao_Paulo day
    const padStart = addDaysToYmd(date, -1);
    const padEnd = addDaysToYmd(date, 1);

    const { data: taskRows, error: taskErr } = await ctx.service
      .from('account_plan_tasks')
      .select(TASK_SELECT)
      .eq('status', 'done')
      .not('completed_at', 'is', null)
      .gte('completed_at', `${padStart}T00:00:00.000Z`)
      .lte('completed_at', `${padEnd}T23:59:59.999Z`)
      .order('completed_at', { ascending: true });

    if (taskErr) return NextResponse.json({ error: taskErr.message }, { status: 500 });

    const allTasks = (taskRows ?? []) as AccountPlanTask[];
    const tasks = allTasks.filter(t => {
      if (!t.completed_at) return false;
      return ymdInTimeZone(new Date(t.completed_at), CALL_CENTER_TIMEZONE) === date;
    });

    if (!tasks.length) {
      return NextResponse.json({ date, tasks: [], today: todayYmdInCallCenterTz() });
    }

    const planIds = [...new Set(tasks.map(t => t.plan_id))];
    const clientIds = [...new Set(tasks.map(t => t.client_id))];
    const [{ data: planRows }, { data: clientRows }] = await Promise.all([
      ctx.service.from('account_week_plans').select(PLAN_SELECT).in('id', planIds),
      ctx.service.from('clients').select('id, name').in('id', clientIds),
    ]);
    const planById = new Map(
      ((planRows ?? []) as AccountWeekPlan[]).map(p => [p.id, p]),
    );
    const nameById = new Map(
      ((clientRows ?? []) as { id: string; name: string }[]).map(c => [c.id, c.name]),
    );

    const enriched = tasks.map(t => {
      const plan = planById.get(t.plan_id);
      return {
        ...t,
        plan_status: plan?.status ?? null,
        client_name: nameById.get(t.client_id) ?? null,
        why: plan?.why ?? '',
        week_start: plan?.week_start ?? null,
      };
    });

    return NextResponse.json({
      date,
      tasks: enriched,
      today: todayYmdInCallCenterTz(),
    });
  }

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
      rows = await attachAdhocLogsForPlans(ctx.service, rows);
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

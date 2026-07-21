import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requireAnyPermission } from '@/lib/api-auth';
import { validateFocusCreate } from '@/lib/focus-schedule';

const SCHEDULE_PERMS = ['agents', 'schedule'] as const;

const SELECT =
  'id, client_id, agent_id, scheduled_date, time_start, time_end, status, notes, created_at, clients(name), agents(name)';

export async function GET(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requireAnyPermission(ctx, [...SCHEDULE_PERMS]);
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const week_start = searchParams.get('week_start');
  if (!week_start) return NextResponse.json({ error: 'week_start required' }, { status: 400 });

  const weekEnd = new Date(week_start + 'T12:00:00Z');
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
  const week_end = weekEnd.toISOString().split('T')[0];

  const { data, error } = await ctx.service
    .from('focus_schedule')
    .select(SELECT)
    .gte('scheduled_date', week_start)
    .lte('scheduled_date', week_end)
    .order('scheduled_date')
    .order('time_start');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rows: data });
}

export async function POST(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requireAnyPermission(ctx, [...SCHEDULE_PERMS]);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = validateFocusCreate(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const { data, error } = await ctx.service
    .from('focus_schedule')
    .insert(parsed.value)
    .select(SELECT)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ row: data });
}

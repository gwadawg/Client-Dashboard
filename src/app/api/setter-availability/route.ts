import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requireAnyPermission } from '@/lib/api-auth';
import { notifyMrWaizLogged } from '@/lib/mr-waiz-activity-notify';

export async function GET() {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requireAnyPermission(ctx, ['agents', 'schedule']);
  if (denied) return denied;

  const { data, error } = await ctx.service
    .from('setter_availability')
    .select('id, agent_id, weekday, time_start, time_end, is_live, agents(name)')
    .order('weekday')
    .order('time_start');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rows: data });
}

export async function POST(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requireAnyPermission(ctx, ['agents', 'schedule']);
  if (denied) return denied;

  const { agent_id, weekday, time_start, time_end, is_live } = await req.json();
  if (!agent_id || !weekday || !time_start || !time_end)
    return NextResponse.json({ error: 'agent_id, weekday, time_start, time_end required' }, { status: 400 });

  const { data, error } = await ctx.service
    .from('setter_availability')
    .insert({ agent_id, weekday, time_start, time_end, is_live: is_live ?? true })
    .select('id, agent_id, weekday, time_start, time_end, is_live, agents(name)')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const agentName =
    data.agents &&
    typeof data.agents === 'object' &&
    'name' in data.agents
      ? String((data.agents as { name: string }).name)
      : null;
  void notifyMrWaizLogged(ctx.service, { userId: ctx.userId }, 'Setter availability added', {
    agent_name: agentName,
    item: `${data.weekday} ${data.time_start}–${data.time_end}`,
    status: data.is_live ? 'live' : 'off',
  });
  return NextResponse.json({ row: data });
}

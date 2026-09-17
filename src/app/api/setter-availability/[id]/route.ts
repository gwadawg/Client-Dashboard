import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requireAnyPermission } from '@/lib/api-auth';
import { notifyMrWaizLogged, summarizeChangedFields } from '@/lib/mr-waiz-activity-notify';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requireAnyPermission(ctx, ['agents', 'schedule']);
  if (denied) return denied;

  const { id } = await params;
  const body = await req.json();
  const allowed = ['weekday', 'time_start', 'time_end', 'is_live'];
  const updates: Record<string, unknown> = {};
  for (const k of allowed) if (k in body) updates[k] = body[k];

  const { data, error } = await ctx.service
    .from('setter_availability')
    .update(updates)
    .eq('id', id)
    .select('id, agent_id, weekday, time_start, time_end, is_live, agents(name)')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const agentName =
    data.agents &&
    typeof data.agents === 'object' &&
    'name' in data.agents
      ? String((data.agents as { name: string }).name)
      : null;
  void notifyMrWaizLogged(ctx.service, { userId: ctx.userId }, 'Setter availability updated', {
    agent_name: agentName,
    item: `${data.weekday} ${data.time_start}–${data.time_end}`,
    status: data.is_live ? 'live' : 'off',
    changed_fields: summarizeChangedFields(Object.keys(updates)),
  });
  return NextResponse.json({ row: data });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requireAnyPermission(ctx, ['agents', 'schedule']);
  if (denied) return denied;

  const { id } = await params;
  const { data: existing } = await ctx.service
    .from('setter_availability')
    .select('weekday, time_start, time_end, is_live, agents(name)')
    .eq('id', id)
    .maybeSingle();
  const { error } = await ctx.service.from('setter_availability').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const agentName =
    existing?.agents &&
    typeof existing.agents === 'object' &&
    'name' in existing.agents
      ? String((existing.agents as { name: string }).name)
      : null;
  void notifyMrWaizLogged(ctx.service, { userId: ctx.userId }, 'Setter availability removed', {
    agent_name: agentName,
    item: existing
      ? `${existing.weekday} ${existing.time_start}–${existing.time_end}`
      : null,
    status: existing?.is_live ? 'live' : 'off',
  });
  return NextResponse.json({ success: true });
}

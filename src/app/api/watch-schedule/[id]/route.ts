import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requireAnyPermission } from '@/lib/api-auth';
import { notifyMrWaizLogged } from '@/lib/mr-waiz-activity-notify';

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requireAnyPermission(ctx, ['agents', 'schedule']);
  if (denied) return denied;

  const { id } = await params;
  const { data: existing } = await ctx.service
    .from('watch_schedule')
    .select('scheduled_date, slot_hour, agents(name)')
    .eq('id', id)
    .maybeSingle();
  const { error } = await ctx.service.from('watch_schedule').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const agentName =
    existing?.agents &&
    typeof existing.agents === 'object' &&
    'name' in existing.agents
      ? String((existing.agents as { name: string }).name)
      : null;
  void notifyMrWaizLogged(ctx.service, { userId: ctx.userId }, 'Watch schedule slot removed', {
    agent_name: agentName,
    item: existing
      ? `${existing.scheduled_date} (${existing.slot_hour}h)`
      : null,
  });
  return NextResponse.json({ success: true });
}

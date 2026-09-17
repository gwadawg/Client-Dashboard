import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requirePermission } from '@/lib/api-auth';
import { notifyMrWaizLogged, resolveClientName } from '@/lib/mr-waiz-activity-notify';

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requirePermission(ctx, 'agents');
  if (denied) return denied;

  const { id } = await params;
  const { data: goal } = await ctx.service.from('goals').select('*').eq('id', id).maybeSingle();
  const { error } = await ctx.service.from('goals').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const clientName = goal?.client_id
    ? await resolveClientName(ctx.service, String(goal.client_id))
    : null;
  void notifyMrWaizLogged(ctx.service, { userId: ctx.userId }, 'Goal deleted', {
    item: goal?.metric ? String(goal.metric) : null,
    client_name: clientName,
    agent_name: goal?.agent_name ? String(goal.agent_name) : null,
    status: goal?.period ? String(goal.period) : null,
  });
  return NextResponse.json({ success: true });
}

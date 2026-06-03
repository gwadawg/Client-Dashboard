import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requireAnyPermission, requirePermission } from '@/lib/api-auth';

export async function GET(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  // Read by both the Goal Tracker and the Scorecards view.
  const denied = requireAnyPermission(ctx, ['goals', 'agent_scorecards']);
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const clientId = searchParams.get('clientId');

  let query = ctx.service.from('goals').select('*').order('metric');
  if (clientId) query = query.eq('client_id', clientId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ goals: data });
}

export async function POST(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requirePermission(ctx, 'goals');
  if (denied) return denied;

  const { client_id, agent_name, metric, target, period = 'monthly' } = await req.json();
  if (!client_id || !metric || target == null) {
    return NextResponse.json({ error: 'client_id, metric, and target are required' }, { status: 400 });
  }
  const { data, error } = await ctx.service
    .from('goals')
    .upsert({ client_id, agent_name: agent_name ?? null, metric, target: Number(target), period },
      { onConflict: 'client_id,agent_name,metric,period' })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ goal: data });
}

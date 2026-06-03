import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requirePermission } from '@/lib/api-auth';

const CREDITABLE_EVENT_TYPES = ['appointment_booked', 'live_transfer', 'callback_booked'];

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(req: Request, { params }: RouteContext) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requirePermission(ctx, 'agent_credit_queue');
  if (denied) return denied;

  const { id } = await params;
  const { agent_name } = await req.json();

  if (agent_name !== null && typeof agent_name !== 'string') {
    return NextResponse.json({ error: 'agent_name must be a string or null' }, { status: 400 });
  }

  const nextAgentName = typeof agent_name === 'string' ? agent_name.trim() : null;
  if (nextAgentName === '') {
    return NextResponse.json({ error: 'agent_name cannot be empty' }, { status: 400 });
  }

  const { data, error } = await ctx.service
    .from('events')
    .update({ agent_name: nextAgentName })
    .eq('id', id)
    .in('event_type', CREDITABLE_EVENT_TYPES)
    .select('id, agent_name')
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Creditable event not found' }, { status: 404 });

  return NextResponse.json({ success: true, event: data });
}

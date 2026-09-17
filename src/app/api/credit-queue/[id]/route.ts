import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requirePermission } from '@/lib/api-auth';
import { isCreditQueueEligibleEvent } from '@/lib/credit-queue-eligibility';

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

  const { data: existing, error: existingError } = await ctx.service
    .from('events')
    .select('id, event_type, calendar_name, agent_name')
    .eq('id', id)
    .maybeSingle();

  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });
  if (!existing || !isCreditQueueEligibleEvent(existing.event_type, existing.calendar_name, existing.agent_name)) {
    return NextResponse.json({ error: 'Creditable event not found' }, { status: 404 });
  }

  const { data, error } = await ctx.service
    .from('events')
    .update({ agent_name: nextAgentName })
    .eq('id', id)
    .select('id, agent_name')
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Creditable event not found' }, { status: 404 });

  return NextResponse.json({ success: true, event: data });
}

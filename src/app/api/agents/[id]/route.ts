import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requireAnyPermission, requirePermission } from '@/lib/api-auth';
import { parseTeamInsert, TEAM_ROSTER_SELECT } from '@/lib/team-roster-api';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requireAnyPermission(ctx, ['admin_agents', 'admin_agent_payroll']);
  if (denied) return denied;

  const { id } = await params;
  const body = await req.json();
  const updates = parseTeamInsert(body);

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'no fields to update' }, { status: 400 });
  }

  const { data, error } = await ctx.service
    .from('agents')
    .update(updates)
    .eq('id', id)
    .select(TEAM_ROSTER_SELECT)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ agent: data });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requirePermission(ctx, 'admin_agents');
  if (denied) return denied;

  const { id } = await params;
  // Soft-deactivate so historical payroll / pay history stay attributed.
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await ctx.service
    .from('agents')
    .update({ active: false, ended_on: today })
    .eq('id', id)
    .select(TEAM_ROSTER_SELECT)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, agent: data });
}

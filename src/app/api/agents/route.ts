import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requireAnyPermission, requirePermission } from '@/lib/api-auth';
import {
  enrichTeamRoster,
  loadAuthUserEmailMap,
  parseTeamInsert,
  TEAM_ROSTER_SELECT,
} from '@/lib/team-roster-api';
export async function GET(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requireAnyPermission(ctx, ['admin_agents', 'schedule', 'admin_agent_payroll', 'admin_users']);
  if (denied) return denied;

  const status = new URL(req.url).searchParams.get('status') ?? 'all';
  let query = ctx.service.from('agents').select(TEAM_ROSTER_SELECT).order('name');
  if (status === 'active') query = query.eq('active', true);
  else if (status === 'alumni') query = query.eq('active', false);

  const [{ data, error }, userEmails] = await Promise.all([
    query,
    loadAuthUserEmailMap(ctx),
  ]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const agents = enrichTeamRoster(data ?? [], userEmails);
  const linkedUserIds = new Set(agents.map(a => a.user_id).filter(Boolean));

  return NextResponse.json({
    agents,
    available_users: [...userEmails.entries()]
      .filter(([id]) => !linkedUserIds.has(id))
      .map(([id, email]) => ({ id, email })),
  });
}

export async function POST(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requirePermission(ctx, 'admin_agents');
  if (denied) return denied;

  const body = await req.json();
  const { phone, name } = body;
  if (!phone || !name) return NextResponse.json({ error: 'phone and name are required' }, { status: 400 });

  const insert = parseTeamInsert(body);
  if (!insert.pay_type) insert.pay_type = 'call_rep';
  if (insert.active === undefined) insert.active = true;

  const { data, error } = await ctx.service.from('agents').insert(insert).select(TEAM_ROSTER_SELECT).single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ agent: data });
}

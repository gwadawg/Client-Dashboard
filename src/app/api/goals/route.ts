import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requireAnyPermission, requirePermission } from '@/lib/api-auth';

type GoalInput = {
  client_id?: string;
  agent_name?: string | null;
  metric?: string;
  target?: number | string;
  period?: string;
  month?: string | null;
};

function normalizeGoal(raw: GoalInput): {
  client_id: string;
  agent_name: string | null;
  metric: string;
  target: number;
  period: string;
  month: string | null;
} | { error: string } {
  const client_id = typeof raw.client_id === 'string' ? raw.client_id.trim() : '';
  const metric = typeof raw.metric === 'string' ? raw.metric.trim() : '';
  const period = typeof raw.period === 'string' ? raw.period.trim() : 'monthly';
  const agent_name =
    typeof raw.agent_name === 'string' && raw.agent_name.trim()
      ? raw.agent_name.trim()
      : null;
  const target = Number(raw.target);
  const monthRaw =
    typeof raw.month === 'string' && raw.month.trim() ? raw.month.trim() : null;

  if (!client_id || !metric || !Number.isFinite(target) || target <= 0) {
    return { error: 'client_id, metric, and a positive target are required' };
  }
  if (period !== 'daily' && period !== 'monthly') {
    return { error: 'period must be daily or monthly' };
  }
  if (period === 'monthly') {
    if (!monthRaw || !/^\d{4}-\d{2}$/.test(monthRaw)) {
      return { error: 'month (YYYY-MM) is required for monthly goals' };
    }
    return { client_id, agent_name, metric, target, period, month: monthRaw };
  }
  return { client_id, agent_name, metric, target, period, month: null };
}

export async function GET(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requireAnyPermission(ctx, ['agents', 'agent_scorecards', 'goals']);
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const clientId = searchParams.get('clientId');
  const month = searchParams.get('month');
  const period = searchParams.get('period');

  let query = ctx.service.from('goals').select('*').order('metric');
  if (clientId) query = query.eq('client_id', clientId);
  if (period) query = query.eq('period', period);
  if (month) {
    // Monthly rows for this month plus all daily rows (month is null)
    query = query.or(`month.eq.${month},month.is.null`);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ goals: data });
}

export async function POST(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requirePermission(ctx, 'agents');
  if (denied) return denied;

  const body = await req.json();
  const rawItems: GoalInput[] = Array.isArray(body)
    ? body
    : Array.isArray(body?.goals)
      ? body.goals
      : [body];

  if (rawItems.length === 0) {
    return NextResponse.json({ error: 'No goals provided' }, { status: 400 });
  }

  const rows = [];
  for (const item of rawItems) {
    const normalized = normalizeGoal(item);
    if ('error' in normalized) {
      return NextResponse.json({ error: normalized.error }, { status: 400 });
    }
    rows.push({
      ...normalized,
      updated_at: new Date().toISOString(),
    });
  }

  const { data, error } = await ctx.service
    .from('goals')
    .upsert(rows, { onConflict: 'client_id,agent_name,metric,period,month' })
    .select();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (rows.length === 1) {
    return NextResponse.json({ goal: data?.[0] ?? null, goals: data ?? [] });
  }
  return NextResponse.json({ goals: data ?? [] });
}

import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requireAnyPermission, requirePermission } from '@/lib/api-auth';

const ROSTER_SELECT =
  'id, phone, name, pay_type, base_salary, monthly_bonus, base_salary_prorate_days, pay_per_booking, pay_per_show, pay_per_live_transfer, pay_per_qualified_demo, pay_per_close, created_at';

const PAY_FIELDS = [
  'base_salary',
  'monthly_bonus',
  'base_salary_prorate_days',
  'pay_per_booking',
  'pay_per_show',
  'pay_per_live_transfer',
  'pay_per_qualified_demo',
  'pay_per_close',
] as const;

export async function GET() {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requireAnyPermission(ctx, ['admin_agents', 'schedule', 'admin_agent_payroll']);
  if (denied) return denied;

  const { data, error } = await ctx.service.from('agents').select(ROSTER_SELECT).order('name');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ agents: data });
}

export async function POST(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requirePermission(ctx, 'admin_agents');
  if (denied) return denied;

  const body = await req.json();
  const { phone, name } = body;
  if (!phone || !name) return NextResponse.json({ error: 'phone and name are required' }, { status: 400 });

  const insert: Record<string, unknown> = {
    phone: phone.trim(),
    name: name.trim(),
    pay_type: body.pay_type === 'b2b_setter' ? 'b2b_setter' : 'call_rep',
  };

  for (const key of PAY_FIELDS) {
    if (body[key] != null && body[key] !== '') insert[key] = Number(body[key]) || 0;
  }

  const { data, error } = await ctx.service.from('agents').insert(insert).select(ROSTER_SELECT).single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ agent: data });
}

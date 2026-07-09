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

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requireAnyPermission(ctx, ['admin_agents', 'admin_agent_payroll']);
  if (denied) return denied;

  const { id } = await params;
  const body = await req.json();
  const { phone, name } = body;
  const updates: Record<string, string | number> = {};
  if (phone) updates.phone = phone.trim();
  if (name) updates.name = name.trim();
  if (body.pay_type === 'call_rep' || body.pay_type === 'b2b_setter') updates.pay_type = body.pay_type;
  for (const key of PAY_FIELDS) {
    if (body[key] != null && body[key] !== '') updates[key] = Number(body[key]) || 0;
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'no fields to update' }, { status: 400 });
  }

  const { data, error } = await ctx.service
    .from('agents')
    .update(updates)
    .eq('id', id)
    .select(ROSTER_SELECT)
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
  const { error } = await ctx.service.from('agents').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

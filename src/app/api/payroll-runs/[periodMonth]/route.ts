import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requirePermission } from '@/lib/api-auth';
import { isValidPeriodMonth } from '@/lib/payroll-period';

type Params = { params: Promise<{ periodMonth: string }> };

export async function GET(_req: Request, { params }: Params) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requirePermission(ctx, 'admin_agent_payroll');
  if (denied) return denied;

  const { periodMonth: raw } = await params;
  const periodMonth = decodeURIComponent(raw);
  if (!isValidPeriodMonth(periodMonth)) {
    return NextResponse.json({ error: 'periodMonth must be YYYY-MM' }, { status: 400 });
  }

  const { data, error } = await ctx.service
    .from('payroll_runs')
    .select('id, period_month, start_date, end_date, summary, report, finalized_at, finalized_by, notes')
    .eq('period_month', `${periodMonth}-01`)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let finalized_by_email: string | null = null;
  if (data.finalized_by) {
    const { data: users } = await ctx.service.auth.admin.listUsers();
    finalized_by_email = users?.users?.find(u => u.id === data.finalized_by)?.email ?? null;
  }

  return NextResponse.json({
    run: {
      ...data,
      period_month: String(data.period_month).slice(0, 10),
      start_date: String(data.start_date).slice(0, 10),
      end_date: String(data.end_date).slice(0, 10),
      finalized_by_email,
    },
  });
}

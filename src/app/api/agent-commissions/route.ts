import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requirePermission } from '@/lib/api-auth';
import { buildUnifiedPayrollReport } from '@/lib/payroll-report-builder';

export async function GET(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requirePermission(ctx, 'admin_agent_payroll');
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');

  if (!startDate || !endDate) {
    return NextResponse.json({ error: 'startDate and endDate are required' }, { status: 400 });
  }

  const built = await buildUnifiedPayrollReport(ctx.service, startDate, endDate);
  if ('error' in built) {
    return NextResponse.json({ error: built.error }, { status: 500 });
  }

  return NextResponse.json(built.report);
}

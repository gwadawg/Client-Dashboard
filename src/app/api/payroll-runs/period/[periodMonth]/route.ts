import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requirePermission } from '@/lib/api-auth';
import { isValidPeriodMonth } from '@/lib/payroll-period';
import { mergeReportWithSubmissions } from '@/lib/payroll-runs';
import { loadPeriodPayrollState } from '@/lib/payroll-submit-server';

type Params = { params: Promise<{ periodMonth: string }> };

/** Live payroll for a month, merged with any submitted employee snapshots. */
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

  try {
    const state = await loadPeriodPayrollState(ctx.service, periodMonth);

    let finalized_by_email: string | null = null;
    if (state.status !== 'none' && state.run.finalized_by) {
      const { data: users } = await ctx.service.auth.admin.listUsers();
      finalized_by_email = users?.users?.find(u => u.id === state.run.finalized_by)?.email ?? null;
    }

    if (state.status === 'none') {
      return NextResponse.json({
        period_status: 'none',
        report: state.live,
        submitted_employees: [],
        run: null,
      });
    }

    const report =
      state.status === 'open' && state.live
        ? mergeReportWithSubmissions(state.live, state.submitted)
        : state.run.report;

    return NextResponse.json({
      period_status: state.status,
      report,
      submitted_employees: state.submitted,
      run: {
        ...state.run,
        report,
        finalized_by_email,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to load payroll period' },
      { status: 500 },
    );
  }
}

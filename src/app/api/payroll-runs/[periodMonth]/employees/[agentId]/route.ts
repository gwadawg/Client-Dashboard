import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requirePermission } from '@/lib/api-auth';
import { isValidPeriodMonth } from '@/lib/payroll-period';
import { loadPeriodPayrollState, submitEmployeePayroll } from '@/lib/payroll-submit-server';

type Params = { params: Promise<{ periodMonth: string; agentId: string }> };

export async function POST(req: Request, { params }: Params) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requirePermission(ctx, 'admin_agent_payroll');
  if (denied) return denied;

  const { periodMonth: rawPeriod, agentId } = await params;
  const periodMonth = decodeURIComponent(rawPeriod);
  if (!isValidPeriodMonth(periodMonth)) {
    return NextResponse.json({ error: 'periodMonth must be YYYY-MM' }, { status: 400 });
  }

  let body: {
    section?: 'call_rep' | 'b2b_setter' | 'salaried';
    line_item_exclusions?: { event_id: string; reason: string }[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.section || !['call_rep', 'b2b_setter', 'salaried'].includes(body.section)) {
    return NextResponse.json({ error: 'section is required' }, { status: 400 });
  }

  try {
    const result = await submitEmployeePayroll(
      ctx.service,
      periodMonth,
      agentId,
      body.section,
      ctx.userId,
      body.line_item_exclusions ?? [],
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to submit employee payroll';
    const status = message.includes('already') ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function GET(_req: Request, { params }: Params) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requirePermission(ctx, 'admin_agent_payroll');
  if (denied) return denied;

  const { periodMonth: rawPeriod, agentId } = await params;
  const periodMonth = decodeURIComponent(rawPeriod);
  if (!isValidPeriodMonth(periodMonth)) {
    return NextResponse.json({ error: 'periodMonth must be YYYY-MM' }, { status: 400 });
  }

  try {
    const state = await loadPeriodPayrollState(ctx.service, periodMonth);
    const submitted = state.submitted.find(s => s.agent_id === agentId);
    if (!submitted) {
      return NextResponse.json({ submitted: false });
    }
    return NextResponse.json({ submitted: true, employee: submitted });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to load employee payroll state' },
      { status: 500 },
    );
  }
}

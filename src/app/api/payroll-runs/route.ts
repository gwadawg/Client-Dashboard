import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requirePermission } from '@/lib/api-auth';
import { monthBounds, isValidPeriodMonth } from '@/lib/payroll-period';
import { buildUnifiedPayrollReport } from '@/lib/payroll-report-builder';
import { buildRunSummary, extractEmployeeSnapshots } from '@/lib/payroll-runs';
import type { AgentCommissionRow } from '@/lib/agent-commissions';
import type { B2BSetterCommissionRow } from '@/lib/b2b-setter-commissions';
import type { SalariedCommissionRow } from '@/lib/salaried-commissions';

export async function GET() {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requirePermission(ctx, 'admin_agent_payroll');
  if (denied) return denied;

  const { data, error } = await ctx.service
    .from('payroll_runs')
    .select('id, period_month, start_date, end_date, summary, status, finalized_at, finalized_by, notes')
    .order('period_month', { ascending: false });

  if (error) {
    if (error.message.includes('payroll_runs')) {
      return NextResponse.json({ runs: [], migration_pending: true });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const userIds = [...new Set((data ?? []).map(r => r.finalized_by).filter(Boolean))] as string[];
  let emailById = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: users } = await ctx.service.auth.admin.listUsers();
    if (users?.users) {
      emailById = new Map(users.users.filter(u => userIds.includes(u.id)).map(u => [u.id, u.email ?? '']));
    }
  }

  const runs = (data ?? []).map(r => ({
    ...r,
    period_month: String(r.period_month).slice(0, 10),
    start_date: String(r.start_date).slice(0, 10),
    end_date: String(r.end_date).slice(0, 10),
    finalized_by_email: r.finalized_by ? emailById.get(r.finalized_by) ?? null : null,
  }));

  return NextResponse.json({ runs });
}

export async function POST(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requirePermission(ctx, 'admin_agent_payroll');
  if (denied) return denied;

  let body: { periodMonth?: string; notes?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const periodMonth = body.periodMonth;
  if (!periodMonth || !isValidPeriodMonth(periodMonth)) {
    return NextResponse.json({ error: 'periodMonth must be YYYY-MM' }, { status: 400 });
  }

  const { startDate, endDate } = monthBounds(periodMonth);

  const { data: existing } = await ctx.service
    .from('payroll_runs')
    .select('id')
    .eq('period_month', `${periodMonth}-01`)
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      { error: `Payroll for ${periodMonth} is already finalized` },
      { status: 409 },
    );
  }

  const built = await buildUnifiedPayrollReport(ctx.service, startDate, endDate);
  if ('error' in built) {
    return NextResponse.json({ error: built.error }, { status: 500 });
  }

  const report = built.report;
  const summary = buildRunSummary(report);

  const { data: run, error: insertError } = await ctx.service
    .from('payroll_runs')
    .insert({
      period_month: `${periodMonth}-01`,
      start_date: startDate,
      end_date: endDate,
      summary,
      report,
      finalized_by: ctx.userId,
      notes: body.notes?.trim() || null,
    })
    .select('id, period_month, start_date, end_date, summary, finalized_at, finalized_by, notes')
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  const employeeRows = extractEmployeeSnapshots(report).map(({ section, row }) => ({
    payroll_run_id: run.id,
    period_month: `${periodMonth}-01`,
    agent_id: row.agent_id,
    agent_name: row.agent_name,
    pay_type: payTypeForSection(section, row),
    section,
    total_pay: row.amounts.total,
    amounts: row.amounts,
    counts: 'counts' in row ? row.counts : {},
    rates: row.rates,
    line_items: 'line_items' in row ? row.line_items : [],
    pending_disposition: row.pending_disposition ?? null,
  }));

  if (employeeRows.length > 0) {
    const { error: empError } = await ctx.service.from('payroll_run_employees').insert(employeeRows);
    if (empError) {
      await ctx.service.from('payroll_runs').delete().eq('id', run.id);
      return NextResponse.json({ error: empError.message }, { status: 500 });
    }
  }

  return NextResponse.json({
    run: {
      ...run,
      period_month: String(run.period_month).slice(0, 10),
      start_date: String(run.start_date).slice(0, 10),
      end_date: String(run.end_date).slice(0, 10),
      report,
    },
  });
}

function payTypeForSection(
  section: 'call_rep' | 'b2b_setter' | 'salaried',
  row: AgentCommissionRow | B2BSetterCommissionRow | SalariedCommissionRow,
): string {
  if (section === 'salaried') return (row as SalariedCommissionRow).position;
  if (section === 'b2b_setter') return 'b2b_setter';
  return 'call_rep';
}

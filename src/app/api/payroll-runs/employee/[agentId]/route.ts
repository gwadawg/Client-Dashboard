import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requirePermission } from '@/lib/api-auth';

type Params = { params: Promise<{ agentId: string }> };

export async function GET(_req: Request, { params }: Params) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requirePermission(ctx, 'admin_agent_payroll');
  if (denied) return denied;

  const { agentId } = await params;

  const { data, error } = await ctx.service
    .from('payroll_run_employees')
    .select(
      'payroll_run_id, period_month, agent_id, agent_name, pay_type, section, total_pay, amounts, counts, rates, line_items, pending_disposition, payroll_runs!inner(start_date, end_date, finalized_at)',
    )
    .eq('agent_id', agentId)
    .order('period_month', { ascending: false });

  if (error) {
    if (error.message.includes('payroll_run_employees')) {
      return NextResponse.json({ history: [], migration_pending: true });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const history = (data ?? []).map(row => {
    const runRaw = row.payroll_runs as
      | { start_date: string; end_date: string; finalized_at: string }
      | { start_date: string; end_date: string; finalized_at: string }[]
      | null;
    const run = Array.isArray(runRaw) ? runRaw[0] : runRaw;
    if (!run) return null;
    return {
      payroll_run_id: row.payroll_run_id,
      period_month: String(row.period_month).slice(0, 10),
      start_date: String(run.start_date).slice(0, 10),
      end_date: String(run.end_date).slice(0, 10),
      agent_id: row.agent_id,
      agent_name: row.agent_name,
      pay_type: row.pay_type,
      section: row.section,
      total_pay: Number(row.total_pay),
      amounts: row.amounts,
      counts: row.counts,
      rates: row.rates,
      line_items: row.line_items,
      pending_disposition: row.pending_disposition,
      finalized_at: run.finalized_at,
    };
  }).filter((row): row is NonNullable<typeof row> => row !== null);

  return NextResponse.json({ history });
}

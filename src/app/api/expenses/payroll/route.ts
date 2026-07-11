import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requirePermission } from '@/lib/api-auth';
import { requireExpenseAccess } from '@/lib/expense-auth';
import { buildCommissionReport, type RosterAgentWithPay } from '@/lib/agent-commissions';
import {
  PAYROLL_ROLE_BUCKETS,
  expenseDedupeHash,
  normalizeMerchant,
  type CeoBucket,
} from '@/lib/expenses';

const EVENT_FIELDS =
  'id, client_id, event_type, agent_name, occurred_at, scheduled_at, lead_name, lead_phone, raw';

const EXPENSE_FIELDS =
  'id, occurred_on, amount, merchant_raw, ceo_bucket, subcategory, payroll_run_id, exclude_from_pnl, source';

/**
 * POST /api/expenses/payroll
 * Body: { startDate, endDate, account_id?, role_bucket?: "setter"|"fulfillment"|"ops"|"founder", dryRun? }
 *
 * Posts each agent's total pay for the period as a business_expenses row
 * (source=payroll, default bucket=cac for setters).
 */
export async function POST(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;

  // Either payroll admin or expenses/ceo access
  const payrollDenied = requirePermission(ctx, 'admin_agent_payroll');
  const expenseDenied = requireExpenseAccess(ctx);
  if (payrollDenied && expenseDenied) {
    return payrollDenied;
  }

  const body = await req.json().catch(() => null);
  const startDate = typeof body?.startDate === 'string' ? body.startDate : null;
  const endDate = typeof body?.endDate === 'string' ? body.endDate : null;
  const dryRun = body?.dryRun !== false;
  const accountId = typeof body?.account_id === 'string' && body.account_id ? body.account_id : null;
  const roleKey =
    body?.role_bucket === 'fulfillment' ||
    body?.role_bucket === 'ops' ||
    body?.role_bucket === 'founder'
      ? body.role_bucket
      : 'setter';
  const ceoBucket: CeoBucket = PAYROLL_ROLE_BUCKETS[roleKey as keyof typeof PAYROLL_ROLE_BUCKETS];
  const excludeFromPnl = ceoBucket === 'owner_draw';

  if (!startDate || !endDate) {
    return NextResponse.json({ error: 'startDate and endDate are required' }, { status: 400 });
  }

  const [
    { data: roster, error: rosterError },
    { data: clients, error: clientsError },
    { data: bookingTransferEvents, error: btError },
    { data: showEvents, error: showError },
  ] = await Promise.all([
    ctx.service
      .from('agents')
      .select('id, name, phone, base_salary, pay_per_booking, pay_per_show, pay_per_live_transfer')
      .order('name'),
    ctx.service.from('clients').select('id, name'),
    ctx.service
      .from('events')
      .select(EVENT_FIELDS)
      .in('event_type', ['appointment_booked', 'live_transfer'])
      .gte('occurred_at', `${startDate}T00:00:00.000Z`)
      .lte('occurred_at', `${endDate}T23:59:59.999Z`),
    ctx.service
      .from('events')
      .select(EVENT_FIELDS)
      .eq('event_type', 'show')
      .or(
        `and(scheduled_at.gte.${startDate}T00:00:00.000Z,scheduled_at.lte.${endDate}T23:59:59.999Z),scheduled_at.is.null`,
      ),
  ]);

  if (rosterError) return NextResponse.json({ error: rosterError.message }, { status: 500 });
  if (clientsError) return NextResponse.json({ error: clientsError.message }, { status: 500 });
  if (btError) return NextResponse.json({ error: btError.message }, { status: 500 });
  if (showError) return NextResponse.json({ error: showError.message }, { status: 500 });

  const report = buildCommissionReport(
    (roster ?? []) as RosterAgentWithPay[],
    clients ?? [],
    bookingTransferEvents ?? [],
    showEvents ?? [],
    startDate,
    endDate,
  );

  const runPrefix = `${startDate}_to_${endDate}`;
  const { data: existing } = await ctx.service
    .from('business_expenses')
    .select('payroll_run_id')
    .like('payroll_run_id', `${runPrefix}%`);
  const existingRuns = new Set((existing ?? []).map(e => e.payroll_run_id as string));

  const now = new Date().toISOString();
  const rows = [];
  let skippedZero = 0;
  let skippedDuplicate = 0;

  for (const agent of report.agents) {
    const total = Number(agent.amounts.total) || 0;
    if (total <= 0) {
      skippedZero++;
      continue;
    }
    const payrollRunId = `${runPrefix}:${agent.agent_id}`;
    if (existingRuns.has(payrollRunId)) {
      skippedDuplicate++;
      continue;
    }

    const merchant = `Payroll — ${agent.agent_name}`;
    const externalId = expenseDedupeHash({
      account_id: accountId,
      occurred_on: endDate,
      amount: total,
      merchant_raw: merchant,
    });

    rows.push({
      occurred_on: endDate,
      amount: total,
      currency: 'USD',
      account_id: accountId,
      source: 'payroll' as const,
      merchant_raw: merchant,
      merchant_normalized: normalizeMerchant(merchant),
      memo: `Agent payroll ${startDate} → ${endDate} (base + commissions)`,
      external_id: externalId,
      ceo_bucket: ceoBucket,
      subcategory: 'payroll',
      exclude_from_pnl: excludeFromPnl,
      categorized_by: 'user' as const,
      rule_id: null,
      payroll_run_id: payrollRunId,
      client_id: null,
      created_by: ctx.userId,
      updated_at: now,
    });
  }

  if (dryRun) {
    return NextResponse.json({
      dryRun: true,
      would_insert: rows.length,
      skipped_zero: skippedZero,
      skipped_duplicate: skippedDuplicate,
      ceo_bucket: ceoBucket,
      period: { startDate, endDate },
      sample: rows.slice(0, 10).map(r => ({
        merchant_raw: r.merchant_raw,
        amount: r.amount,
        ceo_bucket: r.ceo_bucket,
        payroll_run_id: r.payroll_run_id,
      })),
      grand_total: rows.reduce((s, r) => s + r.amount, 0),
    });
  }

  if (rows.length === 0) {
    return NextResponse.json({
      dryRun: false,
      inserted: 0,
      skipped_zero: skippedZero,
      skipped_duplicate: skippedDuplicate,
      ceo_bucket: ceoBucket,
    });
  }

  const { data, error } = await ctx.service.from('business_expenses').insert(rows).select(EXPENSE_FIELDS);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    dryRun: false,
    inserted: data?.length ?? 0,
    skipped_zero: skippedZero,
    skipped_duplicate: skippedDuplicate,
    ceo_bucket: ceoBucket,
    expenses: data,
    grand_total: rows.reduce((s, r) => s + r.amount, 0),
  });
}

import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requirePermission } from '@/lib/api-auth';
import { requireExpenseAccess } from '@/lib/expense-auth';
import { buildCommissionReport, type RosterAgentWithPay } from '@/lib/agent-commissions';
import {
  PAYROLL_ROLE_BUCKETS,
  PAYROLL_ROLE_FULFILLMENT_LINES,
  expenseDedupeHash,
  normalizeMerchant,
  resolveAcquisitionCostChannel,
  type CeoBucket,
  type FulfillmentLine,
} from '@/lib/expenses';
import { rollupExpenseDates } from '@/lib/expense-rollup';

const EVENT_FIELDS =
  'id, client_id, event_type, agent_name, occurred_at, scheduled_at, lead_name, lead_phone, raw';

const EXPENSE_FIELDS =
  'id, occurred_on, amount, merchant_raw, ceo_bucket, subcategory, fulfillment_line, payroll_run_id, exclude_from_pnl, source';

/** Team Payroll posts call-rep pay; default to fulfillment COGS (not CAC). */
const DEFAULT_PAYROLL_ROLE_BUCKET: keyof typeof PAYROLL_ROLE_BUCKETS = 'fulfillment';

/**
 * GET /api/expenses/payroll?startDate=&endDate=&month=YYYY-MM
 * Lists source=payroll expense rows for the period (sheet backfill + posted runs).
 */
export async function GET(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const payrollDenied = requirePermission(ctx, 'admin_agent_payroll');
  const expenseDenied = requireExpenseAccess(ctx);
  if (payrollDenied && expenseDenied) return payrollDenied;

  const sp = new URL(req.url).searchParams;
  let startDate = sp.get('startDate');
  let endDate = sp.get('endDate');
  const month = sp.get('month');
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [y, m] = month.split('-').map(Number);
    startDate = `${month}-01`;
    endDate =
      m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
    // endDate exclusive for month helper — use last day inclusive below
    const last = new Date(Date.UTC(y, m, 0));
    endDate = last.toISOString().slice(0, 10);
  }
  if (!startDate || !endDate) {
    return NextResponse.json({ error: 'startDate and endDate (or month) required' }, { status: 400 });
  }

  const { data, error } = await ctx.service
    .from('business_expenses')
    .select('id, occurred_on, amount, merchant_raw, ceo_bucket, subcategory, payroll_run_id, exclude_from_pnl, source, memo, external_id')
    .eq('source', 'payroll')
    .gte('occurred_on', startDate)
    .lte('occurred_on', endDate)
    .order('occurred_on', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const expenses = data ?? [];
  const grandTotal = expenses.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  return NextResponse.json({
    period: { startDate, endDate },
    count: expenses.length,
    grand_total: grandTotal,
    expenses,
  });
}

/**
 * POST /api/expenses/payroll
 * Body: { startDate, endDate, account_id?, role_bucket?: "setter"|"fulfillment"|"ops"|"founder", dryRun? }
 *
 * Posts each agent's total pay for the period as a business_expenses row
 * (source=payroll). Default role_bucket=fulfillment → call_center COGS for B2C team payroll.
 * Use role_bucket=setter only for acquisition / B2B labor into CAC.
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
  const roleKey: keyof typeof PAYROLL_ROLE_BUCKETS =
    body?.role_bucket === 'setter' ||
    body?.role_bucket === 'fulfillment' ||
    body?.role_bucket === 'ops' ||
    body?.role_bucket === 'founder'
      ? body.role_bucket
      : DEFAULT_PAYROLL_ROLE_BUCKET;
  const ceoBucket: CeoBucket = PAYROLL_ROLE_BUCKETS[roleKey];
  const fulfillmentLine: FulfillmentLine | null =
    ceoBucket === 'fulfillment' ? (PAYROLL_ROLE_FULFILLMENT_LINES[roleKey] ?? 'call_center') : null;
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
      memo:
        ceoBucket === 'fulfillment'
          ? `Team payroll ${startDate} → ${endDate} (call center / booking COGS)`
          : `Agent payroll ${startDate} → ${endDate} (base + commissions)`,
      external_id: externalId,
      ceo_bucket: ceoBucket,
      subcategory: 'payroll',
      fulfillment_line: fulfillmentLine,
      acquisition_cost_channel:
        ceoBucket === 'cac'
          ? resolveAcquisitionCostChannel({
              ceo_bucket: 'cac',
              subcategory: 'payroll',
              merchant_raw: merchant,
              source: 'payroll',
            })
          : null,
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
      fulfillment_line: fulfillmentLine,
      role_bucket: roleKey,
      period: { startDate, endDate },
      sample: rows.slice(0, 10).map(r => ({
        merchant_raw: r.merchant_raw,
        amount: r.amount,
        ceo_bucket: r.ceo_bucket,
        fulfillment_line: r.fulfillment_line,
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

  let rollups = null;
  let warning: string | undefined;
  try {
    rollups = await rollupExpenseDates(
      ctx.service,
      rows.map(r => r.occurred_on),
      ctx.userId,
    );
  } catch (e) {
    warning = e instanceof Error ? e.message : 'Payroll posted but KPI rollup failed';
  }

  return NextResponse.json({
    dryRun: false,
    inserted: data?.length ?? 0,
    skipped_zero: skippedZero,
    skipped_duplicate: skippedDuplicate,
    ceo_bucket: ceoBucket,
    fulfillment_line: fulfillmentLine,
    role_bucket: roleKey,
    expenses: data,
    grand_total: rows.reduce((s, r) => s + r.amount, 0),
    rollups,
    ...(warning ? { warning } : {}),
  });
}

/**
 * DELETE /api/expenses/payroll
 * Body: { id: string }
 *
 * Reverses a row posted from Team Payroll → Post to Expenses.
 * Only allows source=payroll rows whose payroll_run_id is the app post pattern
 * `{start}_to_{end}:{agent_id}`. Wise / HR / sheet backfill are never deleted here.
 */
export async function DELETE(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const payrollDenied = requirePermission(ctx, 'admin_agent_payroll');
  const expenseDenied = requireExpenseAccess(ctx);
  if (payrollDenied && expenseDenied) return payrollDenied;

  const body = await req.json().catch(() => null);
  const id = typeof body?.id === 'string' ? body.id.trim() : '';
  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  const { data: row, error: findErr } = await ctx.service
    .from('business_expenses')
    .select('id, amount, merchant_raw, source, payroll_run_id, external_id, occurred_on')
    .eq('id', id)
    .maybeSingle();

  if (findErr) return NextResponse.json({ error: findErr.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: 'Expense not found' }, { status: 404 });
  if (row.source !== 'payroll') {
    return NextResponse.json({ error: 'Only payroll expense rows can be reversed here' }, { status: 400 });
  }

  const runId = String(row.payroll_run_id ?? '');
  // App posts: "2026-07-01_to_2026-07-31:{uuid}"
  const isAppPost = /^\d{4}-\d{2}-\d{2}_to_\d{4}-\d{2}-\d{2}:/.test(runId);
  const isBackfill =
    String(row.external_id ?? '').startsWith('wise-payroll:') ||
    String(row.external_id ?? '').startsWith('hr-payroll:') ||
    String(row.external_id ?? '').startsWith('sheet-payroll:') ||
    runId.startsWith('wise:') ||
    runId.startsWith('hr:') ||
    runId.startsWith('sheet:');

  if (!isAppPost || isBackfill) {
    return NextResponse.json(
      {
        error:
          'This row is Wise/HR/sheet cash backfill, not a post from this screen. Reverse the calculator submit instead (or edit Finance → Expenses).',
      },
      { status: 400 },
    );
  }

  const { error: delErr } = await ctx.service.from('business_expenses').delete().eq('id', id);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  let rollups = null;
  let warning: string | undefined;
  try {
    if (row.occurred_on) {
      rollups = await rollupExpenseDates(ctx.service, [String(row.occurred_on).slice(0, 10)], ctx.userId);
    }
  } catch (e) {
    warning = e instanceof Error ? e.message : 'Row removed but KPI rollup failed';
  }

  return NextResponse.json({
    ok: true,
    deleted_id: id,
    amount: Number(row.amount) || 0,
    merchant_raw: row.merchant_raw,
    rollups,
    ...(warning ? { warning } : {}),
  });
}

import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, type AuthContext } from '@/lib/api-auth';
import { requireExpenseAccess } from '@/lib/expense-auth';
import {
  periodDateFromMonth,
  rollupExpensesForMonth,
  type BusinessExpense,
  type CeoBucket,
} from '@/lib/expenses';

const METRIC_NOTES = 'Rolled up from business_expenses ledger';

async function upsertMetric(
  ctx: AuthContext,
  metricKey: string,
  periodDate: string,
  value: number,
) {
  const { data: found, error: findErr } = await ctx.service
    .from('business_metrics')
    .select('id')
    .eq('metric_key', metricKey)
    .eq('period_date', periodDate)
    .is('dimension', null)
    .maybeSingle();
  if (findErr) throw new Error(findErr.message);

  if (found) {
    const { error } = await ctx.service
      .from('business_metrics')
      .update({ value_numeric: value, notes: METRIC_NOTES })
      .eq('id', found.id);
    if (error) throw new Error(error.message);
    return;
  }

  const { error } = await ctx.service.from('business_metrics').insert({
    metric_key: metricKey,
    period_date: periodDate,
    value_numeric: value,
    dimension: null,
    notes: METRIC_NOTES,
    created_by: ctx.userId,
  });
  if (error) throw new Error(error.message);
}

// POST /api/expenses/rollup  body: { month: "YYYY-MM" } or { months: ["YYYY-MM", ...] }
export async function POST(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const blocked = requireExpenseAccess(ctx);
  if (blocked) return blocked;

  const body = await req.json().catch(() => ({}));
  const months: string[] = [];
  if (typeof body.month === 'string') months.push(body.month);
  if (Array.isArray(body.months)) {
    for (const m of body.months) if (typeof m === 'string') months.push(m);
  }
  if (months.length === 0) {
    const now = new Date();
    months.push(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  }

  for (const m of months) {
    if (!/^\d{4}-\d{2}$/.test(m)) {
      return NextResponse.json({ error: `Invalid month: ${m}` }, { status: 400 });
    }
  }

  const sorted = months.slice().sort();
  const minMonth = sorted[0];
  const maxMonth = sorted[sorted.length - 1];
  const rangeStart = `${minMonth}-01`;
  const [maxY, maxM] = maxMonth.split('-').map(Number);
  const rangeEndExclusive =
    maxM === 12 ? `${maxY + 1}-01-01` : `${maxY}-${String(maxM + 1).padStart(2, '0')}-01`;

  const { data: expenses, error } = await ctx.service
    .from('business_expenses')
    .select('occurred_on, amount, ceo_bucket, exclude_from_pnl')
    .gte('occurred_on', rangeStart)
    .lt('occurred_on', rangeEndExclusive);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const results = [];
  for (const month of months) {
    const pd = periodDateFromMonth(month)!;
    const rollup = rollupExpensesForMonth(
      (expenses ?? []) as Pick<
        BusinessExpense,
        'occurred_on' | 'amount' | 'ceo_bucket' | 'exclude_from_pnl'
      >[],
      month,
    );

    try {
      await upsertMetric(ctx, 'marketing_spend', pd, rollup.marketing_spend);
      await upsertMetric(ctx, 'delivery_costs', pd, rollup.delivery_costs);
      await upsertMetric(ctx, 'operating_expenses', pd, rollup.operating_expenses);
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : 'Failed to write business_metrics' },
        { status: 500 },
      );
    }

    results.push({
      month,
      marketing_spend: rollup.marketing_spend,
      delivery_costs: rollup.delivery_costs,
      operating_expenses: rollup.operating_expenses,
      by_bucket: rollup.by_bucket as Record<CeoBucket, number>,
      excluded_total: rollup.excluded_total,
      transaction_count: rollup.transaction_count,
    });
  }

  return NextResponse.json({ rollups: results });
}

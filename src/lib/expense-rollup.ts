// Server-side expense → business_metrics rollup.
// Call after ledger mutations so CEO / Finance Overview KPIs stay current.
// marketing_spend = Meta Graph media + non-media CAC ledger (creative, labor, …).

import type { createServiceClient } from './supabase';
import {
  periodDateFromMonth,
  rollupExpensesForMonth,
  type BusinessExpense,
  type CeoBucket,
  type MonthRollup,
} from './expenses';

type ServiceClient = ReturnType<typeof createServiceClient>;

const METRIC_NOTES =
  'Rolled up from Meta insights + non-media CAC ledger (meta_media reconcile excluded)';

export type ExpenseRollupResult = MonthRollup & {
  by_bucket: Record<CeoBucket, number>;
};

/** YYYY-MM from an occurred_on date (or already a month key). */
export function monthKeyFromDate(value: string | null | undefined): string | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}$/.test(value)) return value;
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 7);
  return null;
}

/** Unique sorted YYYY-MM keys from occurred_on values. */
export function uniqueMonthsFromDates(
  dates: Array<string | null | undefined>,
): string[] {
  const set = new Set<string>();
  for (const d of dates) {
    const m = monthKeyFromDate(d);
    if (m) set.add(m);
  }
  return [...set].sort();
}

async function upsertMetric(
  service: ServiceClient,
  metricKey: string,
  periodDate: string,
  value: number,
  createdBy: string | null,
) {
  const { data: found, error: findErr } = await service
    .from('business_metrics')
    .select('id')
    .eq('metric_key', metricKey)
    .eq('period_date', periodDate)
    .is('dimension', null)
    .maybeSingle();
  if (findErr) throw new Error(findErr.message);

  if (found) {
    const { error } = await service
      .from('business_metrics')
      .update({ value_numeric: value, notes: METRIC_NOTES })
      .eq('id', found.id);
    if (error) throw new Error(error.message);
    return;
  }

  const { error } = await service.from('business_metrics').insert({
    metric_key: metricKey,
    period_date: periodDate,
    value_numeric: value,
    dimension: null,
    notes: METRIC_NOTES,
    created_by: createdBy,
  });
  if (error) throw new Error(error.message);
}

/** Sum acquisition_meta_ad_insights.spend by YYYY-MM for the given months. */
export async function fetchMetaMediaSpendByMonth(
  service: ServiceClient,
  months: string[],
): Promise<Record<string, number>> {
  const normalized = [...new Set(months.filter(m => /^\d{4}-\d{2}$/.test(m)))].sort();
  const out: Record<string, number> = {};
  for (const m of normalized) out[m] = 0;
  if (normalized.length === 0) return out;

  const minMonth = normalized[0];
  const maxMonth = normalized[normalized.length - 1];
  const rangeStart = `${minMonth}-01`;
  const [maxY, maxM] = maxMonth.split('-').map(Number);
  const rangeEndExclusive =
    maxM === 12 ? `${maxY + 1}-01-01` : `${maxY}-${String(maxM + 1).padStart(2, '0')}-01`;

  const { data, error } = await service
    .from('acquisition_meta_ad_insights')
    .select('insight_date, spend')
    .gte('insight_date', rangeStart)
    .lt('insight_date', rangeEndExclusive);
  if (error) throw new Error(error.message);

  for (const row of data ?? []) {
    const m = monthKeyFromDate(row.insight_date as string);
    if (!m || !(m in out)) continue;
    out[m] += Number(row.spend) || 0;
  }
  return out;
}

/**
 * Recompute marketing_spend / delivery_costs / operating_expenses for each month
 * from Meta Graph media + live business_expenses non-media CAC.
 */
export async function rollupExpenseMonths(
  service: ServiceClient,
  months: string[],
  createdBy: string | null = null,
): Promise<ExpenseRollupResult[]> {
  const normalized = [...new Set(months.filter(m => /^\d{4}-\d{2}$/.test(m)))].sort();
  if (normalized.length === 0) return [];

  const minMonth = normalized[0];
  const maxMonth = normalized[normalized.length - 1];
  const rangeStart = `${minMonth}-01`;
  const [maxY, maxM] = maxMonth.split('-').map(Number);
  const rangeEndExclusive =
    maxM === 12 ? `${maxY + 1}-01-01` : `${maxY}-${String(maxM + 1).padStart(2, '0')}-01`;

  const [expensesRes, metaByMonth] = await Promise.all([
    service
      .from('business_expenses')
      .select(
        'occurred_on, amount, ceo_bucket, exclude_from_pnl, acquisition_cost_channel, subcategory, merchant_raw, merchant_normalized, source',
      )
      .gte('occurred_on', rangeStart)
      .lt('occurred_on', rangeEndExclusive),
    fetchMetaMediaSpendByMonth(service, normalized),
  ]);
  if (expensesRes.error) throw new Error(expensesRes.error.message);

  const rows = (expensesRes.data ?? []) as Pick<
    BusinessExpense,
    | 'occurred_on'
    | 'amount'
    | 'ceo_bucket'
    | 'exclude_from_pnl'
    | 'acquisition_cost_channel'
    | 'subcategory'
    | 'merchant_raw'
    | 'merchant_normalized'
    | 'source'
  >[];

  const results: ExpenseRollupResult[] = [];
  for (const month of normalized) {
    const pd = periodDateFromMonth(month)!;
    const rollup = rollupExpensesForMonth(rows, month, {
      metaMediaSpend: metaByMonth[month] ?? 0,
    });
    await upsertMetric(service, 'marketing_spend', pd, rollup.marketing_spend, createdBy);
    await upsertMetric(service, 'delivery_costs', pd, rollup.delivery_costs, createdBy);
    await upsertMetric(service, 'operating_expenses', pd, rollup.operating_expenses, createdBy);
    results.push({
      ...rollup,
      by_bucket: rollup.by_bucket as Record<CeoBucket, number>,
    });
  }
  return results;
}

/** Convenience: roll up every month touched by the given occurred_on dates. */
export async function rollupExpenseDates(
  service: ServiceClient,
  dates: Array<string | null | undefined>,
  createdBy: string | null = null,
): Promise<ExpenseRollupResult[]> {
  return rollupExpenseMonths(service, uniqueMonthsFromDates(dates), createdBy);
}

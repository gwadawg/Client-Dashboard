import type { SupabaseClient } from '@supabase/supabase-js';
import type { SpendRow, TrendSpendRow } from '@/lib/metrics';

export type SpendQueryFilters = {
  client_id?: string | null;
  client_ids?: string[] | null;
  start_date?: string | null;
  end_date?: string | null;
};

/** Aggregate ad-level rows to daily totals (fallback when view is unavailable). */
async function fetchDailyMetaSpendFromTable(
  service: SupabaseClient,
  filters: SpendQueryFilters,
): Promise<TrendSpendRow[]> {
  const pageSize = 1000;
  let offset = 0;
  const byDate = new Map<string, number>();

  while (true) {
    let q = service
      .from('meta_ad_insights')
      .select('insight_date, spend')
      .range(offset, offset + pageSize - 1);

    if (filters.client_id) q = q.eq('client_id', filters.client_id);
    else if (filters.client_ids?.length) q = q.in('client_id', filters.client_ids);
    if (filters.start_date) q = q.gte('insight_date', filters.start_date);
    if (filters.end_date) q = q.lte('insight_date', filters.end_date);

    const { data, error } = await q;
    if (error) throw error;

    const batch = data ?? [];
    for (const row of batch) {
      const date = String(row.insight_date);
      byDate.set(date, (byDate.get(date) ?? 0) + Number(row.spend));
    }
    if (batch.length < pageSize) break;
    offset += pageSize;
  }

  return [...byDate.entries()]
    .map(([spend_date, amount]) => ({ spend_date, amount }))
    .sort((a, b) => a.spend_date.localeCompare(b.spend_date));
}

/** Daily Meta totals from meta_ad_insights (via daily_meta_spend view). */
export async function fetchDailyMetaSpend(
  service: SupabaseClient,
  filters: SpendQueryFilters,
): Promise<TrendSpendRow[]> {
  let q = service.from('daily_meta_spend').select('spend_date, amount');

  if (filters.client_id) q = q.eq('client_id', filters.client_id);
  else if (filters.client_ids?.length) q = q.in('client_id', filters.client_ids);
  if (filters.start_date) q = q.gte('spend_date', filters.start_date);
  if (filters.end_date) q = q.lte('spend_date', filters.end_date);

  const { data, error } = await q;
  if (error) {
    return fetchDailyMetaSpendFromTable(service, filters);
  }

  return (data ?? []).map((r) => ({
    spend_date: String(r.spend_date),
    amount: Number(r.amount),
  }));
}

/** Meta spend rows for calculateMetrics (source of truth for ad spend KPIs). */
export async function fetchCombinedSpendForMetrics(
  service: SupabaseClient,
  filters: SpendQueryFilters,
): Promise<SpendRow[]> {
  const metaDaily = await fetchDailyMetaSpend(service, filters);
  return metaDaily.map(day => ({ amount: day.amount, platform: 'meta' }));
}

/** Daily Meta spend series for cost trends. */
export async function fetchCombinedTrendSpend(
  service: SupabaseClient,
  filters: SpendQueryFilters,
): Promise<TrendSpendRow[]> {
  return fetchDailyMetaSpend(service, filters);
}

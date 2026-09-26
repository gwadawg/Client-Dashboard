/**
 * Exact dashboard_kpi_counts cache for closed UTC calendar windows.
 * Unique-lead rates stay correct (unlike summing day-local unique_*).
 */

import { createHash } from 'node:crypto';
import type { createServiceClient } from '@/lib/supabase';
import { parseSqlKpiCounts, type SqlKpiCounts } from '@/lib/metrics-from-sql';

type ServiceClient = ReturnType<typeof createServiceClient>;

function todayUtcYmd(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** Closed = end date is strictly before today UTC (yesterday and earlier). */
export function isClosedUtcRange(startDate: string, endDate: string, now = new Date()): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    return false;
  }
  if (endDate < startDate) return false;
  return endDate < todayUtcYmd(now);
}

export function metricsRangeCacheKey(
  clientIds: string[] | null,
  startDate: string,
  endDate: string,
): string {
  const scope = clientIds?.length ? [...clientIds].sort().join(',') : '';
  const hash = createHash('sha256').update(scope).digest('hex').slice(0, 24);
  return `${startDate}|${endDate}|${hash}`;
}

export async function readMetricsRangeCache(
  service: ServiceClient,
  clientIds: string[] | null,
  startDate: string,
  endDate: string,
): Promise<SqlKpiCounts | null> {
  if (!isClosedUtcRange(startDate, endDate)) return null;
  const cache_key = metricsRangeCacheKey(clientIds, startDate, endDate);
  const { data, error } = await service
    .from('metrics_range_cache')
    .select('counts')
    .eq('cache_key', cache_key)
    .maybeSingle();
  if (error || !data) return null;
  return parseSqlKpiCounts(data.counts);
}

export async function writeMetricsRangeCache(
  service: ServiceClient,
  clientIds: string[] | null,
  startDate: string,
  endDate: string,
  counts: SqlKpiCounts,
): Promise<void> {
  if (!isClosedUtcRange(startDate, endDate)) return;
  const cache_key = metricsRangeCacheKey(clientIds, startDate, endDate);
  const scope = clientIds?.length ? [...clientIds].sort().join(',') : '';
  await service.from('metrics_range_cache').upsert(
    {
      cache_key,
      start_date: startDate,
      end_date: endDate,
      client_scope: scope,
      counts,
      refreshed_at: new Date().toISOString(),
    },
    { onConflict: 'cache_key' },
  );
}

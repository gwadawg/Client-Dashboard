/**
 * Shared dashboard metrics loader.
 * Prefer Postgres dashboard_kpi_* RPCs (counts + timeline); fall back to
 * shipping event rows only if the RPC is unavailable.
 * Speed-to-lead still needs a slim lead/dial pull (pairing + availability).
 */

import {
  buildClientKpiTimeline,
  buildDailyCostSeries,
  calculateMetrics,
  daysInRange,
  rollupCostSeriesToWeeks,
  toCostTrendPoints,
  type CostTrendPoint,
  type EventRow,
  type KpiTimelineBucket,
  type MetricsResult,
} from '@/lib/metrics';
import {
  metricsFromSqlCounts,
  parseSqlKpiCounts,
  parseSqlTimelineRows,
  trendsFromSqlTimeline,
} from '@/lib/metrics-from-sql';
import { fetchCombinedSpendForMetrics, fetchCombinedTrendSpend } from '@/lib/spend';
import {
  getClientIdsByReportingType,
  getLiveClientIds,
  intersectClientFilters,
  liveClientFilter,
} from '@/lib/db-helpers';
import { createTtlCache } from '@/lib/ttl-cache';
import {
  computeSpeedToLead,
  type AvailabilityWindow,
  type SpeedToLeadEventRow,
} from '@/lib/speed-to-lead';
import type { createServiceClient } from '@/lib/supabase';

type ServiceClient = ReturnType<typeof createServiceClient>;

/** Fallback select when SQL RPCs are unavailable. */
export const METRICS_EVENT_SELECT =
  'client_id, event_type, ghl_contact_id, lead_phone, lead_email, lead_name, phone_number_used, agent_name, occurred_at, occurred_at_has_time, lead_created_at, is_pickup, is_conversation, is_qualified, is_hot, is_out_of_state, speed_to_lead_seconds';

const STL_EVENT_SELECT =
  'event_type, client_id, ghl_contact_id, lead_phone, phone_number_used, agent_name, occurred_at, occurred_at_has_time, lead_created_at';

export type TrendsPayload = {
  granularity: 'day' | 'week';
  series: CostTrendPoint[];
  kpiSeries: KpiTimelineBucket[];
};

export type MetricsBundleFilters = {
  client_id?: string | null;
  live_only?: boolean;
  reporting_type?: string | null;
  start_date?: string | null;
  end_date?: string | null;
};

export type MetricsBundleResult = {
  metrics: MetricsResult;
  trends: TrendsPayload | null;
};

type ScopedIds = string[] | null;

const bundleCache = createTtlCache<MetricsBundleResult>(30_000);
const availabilityCache = createTtlCache<AvailabilityWindow[]>(60_000);

const CACHE_HEADERS = { 'Cache-Control': 'private, max-age=15' } as const;

export function metricsCacheHeaders(): Record<string, string> {
  return { ...CACHE_HEADERS };
}

function filterKey(filters: MetricsBundleFilters, includeTrends: boolean, granularity: string): string {
  return [
    filters.client_id ?? '',
    filters.live_only ? '1' : '0',
    filters.reporting_type ?? '',
    filters.start_date ?? '',
    filters.end_date ?? '',
    includeTrends ? '1' : '0',
    granularity,
  ].join('|');
}

async function resolveScopedClientIds(
  service: ServiceClient,
  filters: MetricsBundleFilters,
): Promise<ScopedIds> {
  let scoped: ScopedIds = null;
  if (filters.live_only && !filters.client_id) {
    scoped = await getLiveClientIds(service);
  }
  if (filters.reporting_type && !filters.client_id) {
    const offerIds = await getClientIdsByReportingType(service, filters.reporting_type);
    scoped = intersectClientFilters(scoped, offerIds);
  }
  return scoped;
}

async function loadAvailability(
  service: ServiceClient,
): Promise<{ data: AvailabilityWindow[]; error: string | null }> {
  const cached = availabilityCache.get('all');
  if (cached) return { data: cached, error: null };

  const { data, error } = await service
    .from('setter_availability')
    .select('weekday, time_start, time_end, is_live');
  if (error) return { data: [], error: error.message };
  const rows = (data ?? []) as AvailabilityWindow[];
  availabilityCache.set('all', rows);
  return { data: rows, error: null };
}

function resolveGranularity(
  start: string,
  end: string,
  granularityParam?: string | null,
): 'day' | 'week' {
  const dayCount = daysInRange(start, end);
  if (granularityParam === 'week' || granularityParam === 'day') return granularityParam;
  return dayCount > 90 ? 'week' : 'day';
}

function rpcClientIds(
  filters: MetricsBundleFilters,
  scopedClientIds: ScopedIds,
): string[] | null {
  if (filters.client_id) return [filters.client_id];
  if (scopedClientIds) return liveClientFilter(scopedClientIds);
  return null;
}

function rangeBounds(filters: MetricsBundleFilters): {
  startIso: string | null;
  endIso: string | null;
} {
  return {
    startIso: filters.start_date ? `${filters.start_date}T00:00:00.000Z` : null,
    endIso: filters.end_date ? `${filters.end_date}T23:59:59.999Z` : null,
  };
}

async function fetchSpeedToLeadEvents(
  service: ServiceClient,
  filters: MetricsBundleFilters,
  scopedClientIds: ScopedIds,
): Promise<SpeedToLeadEventRow[]> {
  let q = service
    .from('events')
    .select(STL_EVENT_SELECT)
    .in('event_type', ['lead', 'dial']);
  if (filters.client_id) q = q.eq('client_id', filters.client_id);
  else if (scopedClientIds) q = q.in('client_id', liveClientFilter(scopedClientIds));
  if (filters.start_date) q = q.gte('occurred_at', `${filters.start_date}T00:00:00.000Z`);
  if (filters.end_date) q = q.lte('occurred_at', `${filters.end_date}T23:59:59.999Z`);
  q = q.limit(100000);

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as SpeedToLeadEventRow[];
}

async function loadViaSql(
  service: ServiceClient,
  filters: MetricsBundleFilters,
  scopedClientIds: ScopedIds,
  opts: { includeTrends: boolean; granularity: 'day' | 'week' },
): Promise<MetricsBundleResult | null> {
  const clientIds = rpcClientIds(filters, scopedClientIds);
  const { startIso, endIso } = rangeBounds(filters);
  const spendFilters = {
    client_id: filters.client_id ?? undefined,
    client_ids: scopedClientIds,
    start_date: filters.start_date ?? undefined,
    end_date: filters.end_date ?? undefined,
  };

  const countsPromise = service.rpc('dashboard_kpi_counts', {
    p_client_ids: clientIds,
    p_start: startIso,
    p_end: endIso,
  });

  const timelinePromise =
    opts.includeTrends && filters.start_date && filters.end_date
      ? service.rpc('dashboard_kpi_timeline', {
          p_client_ids: clientIds,
          p_start: filters.start_date,
          p_end: filters.end_date,
          p_granularity: opts.granularity,
        })
      : Promise.resolve({ data: null, error: null });

  const [
    countsRes,
    timelineRes,
    spendRows,
    trendSpend,
    availability,
    stlEvents,
  ] = await Promise.all([
    countsPromise,
    timelinePromise,
    fetchCombinedSpendForMetrics(service, spendFilters),
    opts.includeTrends
      ? fetchCombinedTrendSpend(service, spendFilters)
      : Promise.resolve([]),
    loadAvailability(service),
    fetchSpeedToLeadEvents(service, filters, scopedClientIds),
  ]);

  if (countsRes.error) {
    // Function missing / permission — signal fallback.
    if (
      /dashboard_kpi_counts|Could not find the function|schema cache/i.test(
        countsRes.error.message,
      )
    ) {
      return null;
    }
    throw new Error(countsRes.error.message);
  }
  if (availability.error) throw new Error(availability.error);

  const counts = parseSqlKpiCounts(countsRes.data);
  if (!counts) throw new Error('dashboard_kpi_counts returned empty payload');

  const speed = computeSpeedToLead(stlEvents, availability.data);
  const metrics = metricsFromSqlCounts(counts, spendRows, speed);

  let trends: TrendsPayload | null = null;
  if (opts.includeTrends && filters.start_date && filters.end_date) {
    if (timelineRes.error) {
      if (
        /dashboard_kpi_timeline|Could not find the function|schema cache/i.test(
          timelineRes.error.message,
        )
      ) {
        return null;
      }
      throw new Error(timelineRes.error.message);
    }
    const rows = parseSqlTimelineRows(timelineRes.data);
    const built = trendsFromSqlTimeline(rows, trendSpend, opts.granularity);
    trends = {
      granularity: opts.granularity,
      series: built.series,
      kpiSeries: built.kpiSeries,
    };
  }

  return { metrics, trends };
}

async function loadViaEventsFallback(
  service: ServiceClient,
  filters: MetricsBundleFilters,
  scopedClientIds: ScopedIds,
  opts: { includeTrends: boolean; granularity: 'day' | 'week' },
): Promise<MetricsBundleResult> {
  let eventsQuery = service.from('events').select(METRICS_EVENT_SELECT);
  if (filters.client_id) eventsQuery = eventsQuery.eq('client_id', filters.client_id);
  else if (scopedClientIds) {
    eventsQuery = eventsQuery.in('client_id', liveClientFilter(scopedClientIds));
  }
  if (filters.start_date) {
    eventsQuery = eventsQuery.gte('occurred_at', `${filters.start_date}T00:00:00.000Z`);
  }
  if (filters.end_date) {
    eventsQuery = eventsQuery.lte('occurred_at', `${filters.end_date}T23:59:59.999Z`);
  }
  eventsQuery = eventsQuery.limit(100000);

  const spendFilters = {
    client_id: filters.client_id ?? undefined,
    client_ids: scopedClientIds,
    start_date: filters.start_date ?? undefined,
    end_date: filters.end_date ?? undefined,
  };

  const [{ data: events, error: eventsError }, spendRows, trendSpend, availability] =
    await Promise.all([
      eventsQuery,
      fetchCombinedSpendForMetrics(service, spendFilters),
      opts.includeTrends
        ? fetchCombinedTrendSpend(service, spendFilters)
        : Promise.resolve([]),
      loadAvailability(service),
    ]);

  if (eventsError) throw new Error(eventsError.message);
  if (availability.error) throw new Error(availability.error);

  const eventRows = (events ?? []) as EventRow[];
  const metrics = calculateMetrics(eventRows, spendRows, availability.data);

  let trends: TrendsPayload | null = null;
  if (opts.includeTrends && filters.start_date && filters.end_date) {
    const trendEvents = eventRows.filter(
      (e): e is EventRow & { occurred_at: string } => Boolean(e.occurred_at),
    );
    const daily = buildDailyCostSeries(
      trendEvents,
      trendSpend,
      filters.start_date,
      filters.end_date,
    );
    const buckets =
      opts.granularity === 'week' ? rollupCostSeriesToWeeks(daily) : daily;
    trends = {
      granularity: opts.granularity,
      series: toCostTrendPoints(buckets),
      kpiSeries: buildClientKpiTimeline(
        trendEvents,
        trendSpend,
        filters.start_date,
        filters.end_date,
        opts.granularity,
      ),
    };
  }

  return { metrics, trends };
}

export async function loadMetricsBundle(
  service: ServiceClient,
  filters: MetricsBundleFilters,
  opts: {
    includeTrends?: boolean;
    granularity?: string | null;
  } = {},
): Promise<{ data: MetricsBundleResult | null; error: string | null }> {
  const includeTrends = Boolean(
    opts.includeTrends && filters.start_date && filters.end_date,
  );
  const granularity =
    includeTrends && filters.start_date && filters.end_date
      ? resolveGranularity(filters.start_date, filters.end_date, opts.granularity)
      : 'day';

  const cacheKey = filterKey(filters, includeTrends, granularity);
  const cached = bundleCache.get(cacheKey);
  if (cached) return { data: cached, error: null };

  if (!includeTrends && filters.start_date && filters.end_date) {
    const g = resolveGranularity(filters.start_date, filters.end_date, opts.granularity);
    const hit = bundleCache.get(filterKey(filters, true, g));
    if (hit) {
      const slim: MetricsBundleResult = { metrics: hit.metrics, trends: null };
      bundleCache.set(cacheKey, slim);
      return { data: slim, error: null };
    }
  }

  try {
    const scopedClientIds = await resolveScopedClientIds(service, filters);
    const loadOpts = { includeTrends, granularity };

    let result = await loadViaSql(service, filters, scopedClientIds, loadOpts);
    if (!result) {
      result = await loadViaEventsFallback(service, filters, scopedClientIds, loadOpts);
    }

    bundleCache.set(cacheKey, result);
    return { data: result, error: null };
  } catch (e) {
    return {
      data: null,
      error: e instanceof Error ? e.message : 'Metrics load failed',
    };
  }
}

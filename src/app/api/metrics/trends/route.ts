import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requirePermission } from '@/lib/api-auth';
import {
  buildClientKpiTimeline,
  buildDailyCostSeries,
  daysInRange,
  rollupCostSeriesToWeeks,
  toCostTrendPoints,
} from '@/lib/metrics';
import { fetchCombinedTrendSpend } from '@/lib/spend';
import {
  getClientIdsByReportingType,
  getLiveClientIds,
  intersectClientFilters,
  liveClientFilter,
} from '@/lib/db-helpers';

export async function GET(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requirePermission(ctx, 'dashboard');
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const client_id = searchParams.get('client_id');
  const live_only = searchParams.get('live_only') === 'true';
  const reporting_type = searchParams.get('reporting_type');
  const start_date = searchParams.get('start_date');
  const end_date = searchParams.get('end_date');
  const granularityParam = searchParams.get('granularity');

  if (!start_date || !end_date) {
    return NextResponse.json({ error: 'start_date and end_date are required' }, { status: 400 });
  }

  const dayCount = daysInRange(start_date, end_date);
  const granularity =
    granularityParam === 'week' || granularityParam === 'day'
      ? granularityParam
      : dayCount > 90
        ? 'week'
        : 'day';

  let scopedClientIds: string[] | null = null;
  if (live_only && !client_id) {
    scopedClientIds = await getLiveClientIds(ctx.service);
  }
  if (reporting_type && !client_id) {
    const offerIds = await getClientIdsByReportingType(ctx.service, reporting_type);
    scopedClientIds = intersectClientFilters(scopedClientIds, offerIds);
  }

  let eventsQuery = ctx.service
    .from('events')
    .select('event_type, occurred_at, is_qualified');

  if (client_id) eventsQuery = eventsQuery.eq('client_id', client_id);
  else if (scopedClientIds) eventsQuery = eventsQuery.in('client_id', liveClientFilter(scopedClientIds));
  eventsQuery = eventsQuery.gte('occurred_at', `${start_date}T00:00:00.000Z`);
  eventsQuery = eventsQuery.lte('occurred_at', `${end_date}T23:59:59.999Z`);
  eventsQuery = eventsQuery.limit(100000);

  try {
    const [{ data: events, error: eventsError }, spendRows] = await Promise.all([
      eventsQuery,
      fetchCombinedTrendSpend(ctx.service, {
        client_id,
        client_ids: scopedClientIds,
        start_date,
        end_date,
      }),
    ]);

    if (eventsError) {
      return NextResponse.json({ error: eventsError.message }, { status: 500 });
    }

    const daily = buildDailyCostSeries(events ?? [], spendRows, start_date, end_date);
    const buckets = granularity === 'week' ? rollupCostSeriesToWeeks(daily) : daily;

    return NextResponse.json({
      granularity,
      series: toCostTrendPoints(buckets),
      kpiSeries: buildClientKpiTimeline(events ?? [], spendRows, start_date, end_date, granularity),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Spend fetch failed' },
      { status: 500 },
    );
  }
}

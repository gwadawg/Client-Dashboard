import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError } from '@/lib/api-auth';
import {
  buildDailyCostSeries,
  daysInRange,
  rollupCostSeriesToWeeks,
  toCostTrendPoints,
} from '@/lib/metrics';
import { getLiveClientIds, liveClientFilter } from '@/lib/db-helpers';

export async function GET(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;

  const { searchParams } = new URL(req.url);
  const client_id = searchParams.get('client_id');
  const live_only = searchParams.get('live_only') === 'true';
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

  let liveClientIds: string[] | null = null;
  if (live_only && !client_id) {
    liveClientIds = await getLiveClientIds(ctx.service);
  }

  let eventsQuery = ctx.service
    .from('events')
    .select('event_type, occurred_at, is_qualified, is_conversation');

  if (client_id) eventsQuery = eventsQuery.eq('client_id', client_id);
  else if (liveClientIds) eventsQuery = eventsQuery.in('client_id', liveClientFilter(liveClientIds));
  eventsQuery = eventsQuery.gte('occurred_at', `${start_date}T00:00:00.000Z`);
  eventsQuery = eventsQuery.lte('occurred_at', `${end_date}T23:59:59.999Z`);
  eventsQuery = eventsQuery.limit(100000);

  let spendQuery = ctx.service.from('ad_spend').select('spend_date, amount');

  if (client_id) spendQuery = spendQuery.eq('client_id', client_id);
  else if (liveClientIds) spendQuery = spendQuery.in('client_id', liveClientFilter(liveClientIds));
  spendQuery = spendQuery.gte('spend_date', start_date);
  spendQuery = spendQuery.lte('spend_date', end_date);

  const [{ data: events, error: eventsError }, { data: spendRows, error: spendError }] =
    await Promise.all([eventsQuery, spendQuery]);

  if (eventsError || spendError) {
    return NextResponse.json({ error: eventsError?.message ?? spendError?.message }, { status: 500 });
  }

  const daily = buildDailyCostSeries(events ?? [], spendRows ?? [], start_date, end_date);
  const buckets = granularity === 'week' ? rollupCostSeriesToWeeks(daily) : daily;

  return NextResponse.json({
    granularity,
    series: toCostTrendPoints(buckets),
  });
}

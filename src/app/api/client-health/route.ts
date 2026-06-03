import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requirePermission } from '@/lib/api-auth';
import {
  buildClientHealthSnapshot,
  compareHealthTrend,
  getPriorPeriod,
  groupEventsByClient,
  groupSpendByClient,
  type ClientEventWithDate,
  type ClientHealthRow,
} from '@/lib/client-health';
import { getLiveClientIds, liveClientFilter } from '@/lib/db-helpers';

const EVENT_SELECT =
  'client_id, occurred_at, event_type, is_pickup, is_conversation, speed_to_lead_seconds, is_qualified, is_hot, is_out_of_state';

type SpendByClientRow = {
  client_id: string;
  spend_date: string;
  amount: number;
  platform?: string;
};

export async function GET(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requirePermission(ctx, 'client_health');
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const start_date = searchParams.get('start_date');
  const end_date = searchParams.get('end_date');
  const live_only = searchParams.get('live_only') === 'true';

  if (!start_date || !end_date) {
    return NextResponse.json({ error: 'start_date and end_date are required' }, { status: 400 });
  }

  const prior = getPriorPeriod(start_date, end_date);

  let clientQuery = ctx.service
    .from('clients')
    .select('id, name, is_live')
    .order('name');

  if (live_only) clientQuery = clientQuery.eq('is_live', true);

  let liveClientIds: string[] | null = null;
  if (live_only) {
    liveClientIds = await getLiveClientIds(ctx.service);
  }

  const rangeStart = prior?.start ?? start_date;
  const rangeEnd = end_date;

  let eventsQuery = ctx.service.from('events').select(EVENT_SELECT);
  if (liveClientIds) eventsQuery = eventsQuery.in('client_id', liveClientFilter(liveClientIds));
  eventsQuery = eventsQuery.gte('occurred_at', `${rangeStart}T00:00:00.000Z`);
  eventsQuery = eventsQuery.lte('occurred_at', `${rangeEnd}T23:59:59.999Z`);
  eventsQuery = eventsQuery.limit(200000);

  const spendFilters = {
    start_date: rangeStart,
    end_date: rangeEnd,
    client_ids: liveClientIds,
  };

  const [
    { data: clients, error: clientsError },
    { data: events, error: eventsError },
    metaSpend,
    nonMetaSpend,
  ] = await Promise.all([
    clientQuery,
    eventsQuery,
    fetchMetaSpendByClient(ctx, spendFilters),
    fetchNonMetaSpendByClient(ctx, spendFilters),
  ]);

  if (clientsError || eventsError) {
    return NextResponse.json(
      { error: clientsError?.message ?? eventsError?.message },
      { status: 500 },
    );
  }

  const allEvents = (events ?? []) as ClientEventWithDate[];
  const currentEvents = allEvents.filter(
    e => e.occurred_at >= `${start_date}T00:00:00.000Z` && e.occurred_at <= `${end_date}T23:59:59.999Z`,
  );
  const priorEvents =
    prior != null
      ? allEvents.filter(
          e =>
            e.occurred_at >= `${prior.start}T00:00:00.000Z` &&
            e.occurred_at <= `${prior.end}T23:59:59.999Z`,
        )
      : [];

  const spendRows = [...metaSpend, ...nonMetaSpend];
  const currentSpend = spendRows.filter(
    r => r.spend_date >= start_date && r.spend_date <= end_date,
  );
  const priorSpend =
    prior != null
      ? spendRows.filter(r => r.spend_date >= prior.start && r.spend_date <= prior.end)
      : [];

  const currentByClient = groupEventsByClient(currentEvents);
  const priorByClient = groupEventsByClient(priorEvents);
  const currentSpendByClient = groupSpendByClient(
    currentSpend.map(({ client_id, amount, platform }) => ({ client_id, amount, platform })),
  );
  const priorSpendByClient = groupSpendByClient(
    priorSpend.map(({ client_id, amount, platform }) => ({ client_id, amount, platform })),
  );

  const rows: ClientHealthRow[] = (clients ?? []).map(c => {
    const current = buildClientHealthSnapshot(
      currentByClient.get(c.id) ?? [],
      currentSpendByClient.get(c.id) ?? [],
    );
    const priorSnapshot =
      prior != null
        ? buildClientHealthSnapshot(
            priorByClient.get(c.id) ?? [],
            priorSpendByClient.get(c.id) ?? [],
          )
        : null;
    const { trend, trend_delta_score } = compareHealthTrend(current, priorSnapshot);
    const has_activity =
      current.metrics.new_leads > 0 ||
      current.metrics.booked_appointments > 0 ||
      current.metrics.ad_spend > 0;

    return {
      client_id: c.id,
      client_name: c.name,
      is_live: c.is_live !== false,
      current,
      prior: priorSnapshot,
      trend,
      trend_delta_score,
      has_activity,
    };
  });

  return NextResponse.json({
    period: { start: start_date, end: end_date },
    prior_period: prior,
    clients: rows,
  });
}

async function fetchMetaSpendByClient(
  ctx: { service: ReturnType<typeof import('@/lib/supabase').createServiceClient> },
  filters: { start_date: string; end_date: string; client_ids: string[] | null },
): Promise<SpendByClientRow[]> {
  let q = ctx.service.from('daily_meta_spend').select('client_id, spend_date, amount');
  if (filters.client_ids?.length) q = q.in('client_id', liveClientFilter(filters.client_ids));
  q = q.gte('spend_date', filters.start_date);
  q = q.lte('spend_date', filters.end_date);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map(r => ({
    client_id: String(r.client_id),
    spend_date: String(r.spend_date),
    amount: Number(r.amount),
    platform: 'meta',
  }));
}

async function fetchNonMetaSpendByClient(
  ctx: { service: ReturnType<typeof import('@/lib/supabase').createServiceClient> },
  filters: { start_date: string; end_date: string; client_ids: string[] | null },
): Promise<SpendByClientRow[]> {
  let q = ctx.service
    .from('ad_spend')
    .select('client_id, spend_date, amount, platform')
    .neq('platform', 'meta');
  if (filters.client_ids?.length) q = q.in('client_id', liveClientFilter(filters.client_ids));
  q = q.gte('spend_date', filters.start_date);
  q = q.lte('spend_date', filters.end_date);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map(r => ({
    client_id: String(r.client_id),
    spend_date: String(r.spend_date),
    amount: Number(r.amount),
    platform: r.platform as string,
  }));
}

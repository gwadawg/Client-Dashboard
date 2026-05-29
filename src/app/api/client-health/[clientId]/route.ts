import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError } from '@/lib/api-auth';
import {
  buildClientHealthSnapshot,
  buildConstraintGuidance,
  compareHealthTrend,
  getPriorPeriod,
  type ClientHealthSnapshot,
} from '@/lib/client-health';
import { fetchCombinedSpendForMetrics } from '@/lib/spend';
import type { EventRow } from '@/lib/metrics';

const EVENT_SELECT =
  'occurred_at, event_type, ghl_contact_id, lead_phone, lead_email, lead_name, is_pickup, is_conversation, speed_to_lead_seconds, is_qualified, is_hot, is_out_of_state';

type DatedEventRow = EventRow & { occurred_at: string };

export async function GET(
  req: Request,
  { params }: { params: Promise<{ clientId: string }> },
) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;

  const { clientId } = await params;
  const { searchParams } = new URL(req.url);
  const start_date = searchParams.get('start_date');
  const end_date = searchParams.get('end_date');

  if (!start_date || !end_date) {
    return NextResponse.json({ error: 'start_date and end_date are required' }, { status: 400 });
  }

  const prior = getPriorPeriod(start_date, end_date);
  const rangeStart = prior?.start ?? start_date;

  const [{ data: client, error: clientError }, { data: events, error: eventsError }, currentSpend, priorSpend] =
    await Promise.all([
      ctx.service.from('clients').select('id, name, is_live').eq('id', clientId).single(),
      ctx.service
        .from('events')
        .select(EVENT_SELECT)
        .eq('client_id', clientId)
        .gte('occurred_at', `${rangeStart}T00:00:00.000Z`)
        .lte('occurred_at', `${end_date}T23:59:59.999Z`)
        .limit(200000),
      fetchCombinedSpendForMetrics(ctx.service, { client_id: clientId, start_date, end_date }),
      prior
        ? fetchCombinedSpendForMetrics(ctx.service, {
            client_id: clientId,
            start_date: prior.start,
            end_date: prior.end,
          })
        : Promise.resolve([]),
    ]);

  if (clientError || !client) {
    return NextResponse.json({ error: clientError?.message ?? 'Client not found' }, { status: 404 });
  }
  if (eventsError) {
    return NextResponse.json({ error: eventsError.message }, { status: 500 });
  }

  const allEvents = (events ?? []) as DatedEventRow[];
  const currentEvents = allEvents.filter(
    e => e.occurred_at >= `${start_date}T00:00:00.000Z` && e.occurred_at <= `${end_date}T23:59:59.999Z`,
  );
  const priorEvents = prior
    ? allEvents.filter(
        e => e.occurred_at >= `${prior.start}T00:00:00.000Z` && e.occurred_at <= `${prior.end}T23:59:59.999Z`,
      )
    : [];

  const current = buildClientHealthSnapshot(currentEvents, currentSpend);
  const priorSnapshot: ClientHealthSnapshot | null = prior
    ? buildClientHealthSnapshot(priorEvents, priorSpend)
    : null;
  const { trend, trend_delta_score } = compareHealthTrend(current, priorSnapshot);
  const guidance = buildConstraintGuidance(current);

  return NextResponse.json({
    client_id: client.id,
    client_name: client.name,
    is_live: client.is_live !== false,
    period: { start: start_date, end: end_date },
    prior_period: prior,
    current,
    prior: priorSnapshot,
    trend,
    trend_delta_score,
    guidance,
  });
}

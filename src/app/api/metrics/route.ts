import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requireAnyPermission } from '@/lib/api-auth';
import { calculateMetrics } from '@/lib/metrics';
import { fetchCombinedSpendForMetrics } from '@/lib/spend';
import { getLiveClientIds, liveClientFilter } from '@/lib/db-helpers';

export async function GET(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  // Shared by the Dashboard and the Goal Tracker (progress vs. targets).
  const denied = requireAnyPermission(ctx, ['dashboard', 'agents']);
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const client_id = searchParams.get('client_id');
  const live_only = searchParams.get('live_only') === 'true';
  const start_date = searchParams.get('start_date');
  const end_date = searchParams.get('end_date');

  let liveClientIds: string[] | null = null;
  if (live_only && !client_id) {
    liveClientIds = await getLiveClientIds(ctx.service);
  }

  let eventsQuery = ctx.service
    .from('events')
    .select('client_id, event_type, ghl_contact_id, lead_phone, lead_email, lead_name, phone_number_used, agent_name, occurred_at, occurred_at_has_time, lead_created_at, is_pickup, is_conversation, speed_to_lead_seconds, is_qualified, is_hot, is_out_of_state');

  if (client_id) eventsQuery = eventsQuery.eq('client_id', client_id);
  else if (liveClientIds) eventsQuery = eventsQuery.in('client_id', liveClientFilter(liveClientIds));
  if (start_date) eventsQuery = eventsQuery.gte('occurred_at', `${start_date}T00:00:00.000Z`);
  if (end_date)   eventsQuery = eventsQuery.lte('occurred_at', `${end_date}T23:59:59.999Z`);
  eventsQuery = eventsQuery.limit(100000);

  const [{ data: events, error: eventsError }, spendRows, { data: availability, error: availabilityError }] =
    await Promise.all([
      eventsQuery,
      fetchCombinedSpendForMetrics(ctx.service, {
        client_id,
        client_ids: liveClientIds,
        start_date,
        end_date,
      }).then(
        (rows) => ({ data: rows, error: null }),
        (error: Error) => ({ data: null, error }),
      ),
      ctx.service.from('setter_availability').select('weekday, time_start, time_end, is_live'),
    ]);

  if (eventsError || spendRows.error || availabilityError)
    return NextResponse.json(
      { error: eventsError?.message ?? spendRows.error?.message ?? availabilityError?.message },
      { status: 500 },
    );

  return NextResponse.json(
    calculateMetrics(events ?? [], spendRows.data ?? [], availability ?? []),
  );
}

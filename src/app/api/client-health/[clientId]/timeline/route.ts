import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError } from '@/lib/api-auth';
import { buildClientKpiTimeline, type KpiTimelineEventRow } from '@/lib/metrics';
import { fetchCombinedTrendSpend } from '@/lib/spend';

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
  const granularity = searchParams.get('granularity') === 'day' ? 'day' : 'week';

  if (!start_date || !end_date) {
    return NextResponse.json({ error: 'start_date and end_date are required' }, { status: 400 });
  }

  const [{ data: events, error: eventsError }, spendRows] = await Promise.all([
    ctx.service
      .from('events')
      .select('event_type, occurred_at, is_qualified')
      .eq('client_id', clientId)
      .gte('occurred_at', `${start_date}T00:00:00.000Z`)
      .lte('occurred_at', `${end_date}T23:59:59.999Z`)
      .limit(200000),
    fetchCombinedTrendSpend(ctx.service, { client_id: clientId, start_date, end_date }),
  ]);

  if (eventsError) {
    return NextResponse.json({ error: eventsError.message }, { status: 500 });
  }

  const timeline = buildClientKpiTimeline(
    (events ?? []) as KpiTimelineEventRow[],
    spendRows,
    start_date,
    end_date,
    granularity,
  );

  return NextResponse.json({ client_id: clientId, granularity, timeline });
}

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { calculateMetrics } from '@/lib/metrics';
import { normalizeReportingType } from '@/lib/kpi-layouts';
import { fetchCombinedSpendForMetrics } from '@/lib/spend';

// Public endpoint — authenticated by share_token, no user session required.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get('token');
  const start_date = searchParams.get('start_date');
  const end_date = searchParams.get('end_date');

  if (!token) return NextResponse.json({ error: 'token is required' }, { status: 400 });

  const service = createServiceClient();

  const { data: client } = await service
    .from('clients')
    .select('id, name, reporting_type')
    .eq('share_token', token)
    .single();

  if (!client) return NextResponse.json({ error: 'Invalid token' }, { status: 404 });

  let eventsQuery = service
    .from('events')
    .select('client_id, event_type, ghl_contact_id, lead_phone, lead_email, lead_name, is_pickup, is_conversation, speed_to_lead_seconds, is_qualified, is_hot, is_out_of_state')
    .eq('client_id', client.id);

  if (start_date) eventsQuery = eventsQuery.gte('occurred_at', `${start_date}T00:00:00.000Z`);
  if (end_date)   eventsQuery = eventsQuery.lte('occurred_at', `${end_date}T23:59:59.999Z`);

  const [{ data: events }, spendRows] = await Promise.all([
    eventsQuery,
    fetchCombinedSpendForMetrics(service, {
      client_id: client.id,
      start_date,
      end_date,
    }),
  ]);

  return NextResponse.json({
    client_name: client.name,
    reporting_type: normalizeReportingType(client.reporting_type),
    ...calculateMetrics(events ?? [], spendRows),
  });
}

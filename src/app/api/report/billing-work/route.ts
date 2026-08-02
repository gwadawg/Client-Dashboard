import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { isYmd, loadBillingWorkReport } from '@/lib/billing-work-report';

// Public endpoint — authenticated by share_token, no user session required.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get('token');
  const start_date = searchParams.get('start_date');
  const end_date = searchParams.get('end_date');
  const cycle_id = searchParams.get('cycle_id');

  if (!token) return NextResponse.json({ error: 'token is required' }, { status: 400 });
  if (!isYmd(start_date) || !isYmd(end_date)) {
    return NextResponse.json({ error: 'start_date and end_date (YYYY-MM-DD) are required' }, { status: 400 });
  }
  if (start_date > end_date) {
    return NextResponse.json({ error: 'start_date must be on or before end_date' }, { status: 400 });
  }

  const service = createServiceClient();

  const { data: client, error: clientErr } = await service
    .from('clients')
    .select('id, name')
    .eq('share_token', token)
    .single();

  if (clientErr || !client) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 404 });
  }

  try {
    const report = await loadBillingWorkReport(service, {
      clientId: client.id,
      clientName: client.name,
      periodStart: start_date,
      periodEnd: end_date,
      cycleId: cycle_id,
    });
    return NextResponse.json(report);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to load billing work report';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import {
  buildClientLogActivity,
  parseActivityRange,
  type ActivityDealInput,
  type ActivityEventInput,
} from '@/lib/client-log-activity';
import { resolveLoanLogToken } from '@/lib/loan-log-form';
import { createServiceClient } from '@/lib/supabase';

const INVALID = 'This link isn’t valid. Ask your Waiz contact for a new one.';

const DEAL_SELECT =
  'id, ghl_contact_id, lead_name, lead_phone, stage, submitted_at, funded_at, loan_size, transaction_label';

const EVENT_SELECT =
  'id, event_type, ghl_contact_id, lead_name, lead_phone, occurred_at, dq_reason, raw';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const service = createServiceClient();
  const client = await resolveLoanLogToken(service, decodeURIComponent(token));
  if (!client) {
    return NextResponse.json({ error: INVALID }, { status: 404 });
  }

  const url = new URL(req.url);
  const range = parseActivityRange(url.searchParams.get('range'));

  try {
    const [dealsResult, eventsResult] = await Promise.all([
      service
        .from('loan_deals')
        .select(DEAL_SELECT)
        .eq('client_id', client.client_id)
        .eq('source', 'loan_log_form')
        .order('submitted_at', { ascending: false })
        .limit(500),
      service
        .from('events')
        .select(EVENT_SELECT)
        .eq('client_id', client.client_id)
        .in('event_type', ['proposal_made', 'proposal_sent', 'manual_dq'])
        .order('occurred_at', { ascending: false })
        .limit(2000),
    ]);

    if (dealsResult.error) throw new Error(dealsResult.error.message);
    if (eventsResult.error) throw new Error(eventsResult.error.message);

    const payload = buildClientLogActivity(
      client.client_id,
      (dealsResult.data ?? []) as ActivityDealInput[],
      (eventsResult.data ?? []) as ActivityEventInput[],
      range,
    );

    return NextResponse.json(payload);
  } catch {
    return NextResponse.json({ error: "Couldn't load activity." }, { status: 500 });
  }
}

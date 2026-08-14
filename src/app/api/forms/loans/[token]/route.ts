import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { normalizePhone } from '@/lib/contact-key';
import {
  isLoanLogStage,
  parseLoanLogDate,
  parseMoney,
  planLoanLogEvents,
  resolveLoanLogToken,
  type LoanLogExistingEvent,
} from '@/lib/loan-log-form';

const INVALID = 'This link isn’t valid. Ask your Waiz contact for a new one.';

type LeadHit = {
  lead_name: string | null;
  lead_phone: string | null;
  ghl_contact_id: string | null;
};

async function loadExistingEvents(
  service: ReturnType<typeof createServiceClient>,
  clientId: string,
  ghlContactId: string | null,
  phone: string,
): Promise<LoanLogExistingEvent[]> {
  const digits = normalizePhone(phone);
  const ghl = ghlContactId?.trim() || null;
  const merged = new Map<string, LoanLogExistingEvent>();

  const take = (
    rows: (LoanLogExistingEvent & { id?: string; ghl_contact_id?: string | null; lead_phone?: string | null })[],
  ) => {
    for (const row of rows) {
      const key = `${row.event_type}:${row.occurred_at}:${row.ghl_contact_id ?? ''}:${row.lead_phone ?? ''}`;
      merged.set(key, { event_type: row.event_type, occurred_at: row.occurred_at });
    }
  };

  if (ghl) {
    const { data, error } = await service
      .from('events')
      .select('event_type, occurred_at, ghl_contact_id, lead_phone')
      .eq('client_id', clientId)
      .eq('ghl_contact_id', ghl)
      .limit(2000);
    if (error) throw new Error(error.message);
    take((data ?? []) as (LoanLogExistingEvent & LeadHit)[]);
  }

  if (digits) {
    const { data, error } = await service
      .from('events')
      .select('event_type, occurred_at, ghl_contact_id, lead_phone')
      .eq('client_id', clientId)
      .ilike('lead_phone', `%${digits}%`)
      .limit(2000);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as (LoanLogExistingEvent & LeadHit)[];
    take(rows.filter(row => normalizePhone(row.lead_phone) === digits));
  }

  return [...merged.values()];
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const service = createServiceClient();
  const client = await resolveLoanLogToken(service, decodeURIComponent(token));
  if (!client) {
    return NextResponse.json({ error: INVALID }, { status: 404 });
  }
  return NextResponse.json({ client_name: client.client_name });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const service = createServiceClient();
  const client = await resolveLoanLogToken(service, decodeURIComponent(token));
  if (!client) {
    return NextResponse.json({ error: INVALID }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const stage = body.stage;
  if (!isLoanLogStage(stage)) {
    return NextResponse.json({ error: 'Choose Proposal, Submitted, or Funded.' }, { status: 400 });
  }

  const occurredDate = parseLoanLogDate(body.occurred_on) ?? parseLoanLogDate(new Date().toISOString().slice(0, 10));
  if (!occurredDate) {
    return NextResponse.json({ error: 'Enter a valid date.' }, { status: 400 });
  }

  const loanSize = parseMoney(body.loan_size);
  if (loanSize == null || loanSize <= 0) {
    return NextResponse.json({ error: 'Loan size is required.' }, { status: 400 });
  }

  const createLead = body.cant_find === true;
  const leadName = typeof body.lead_name === 'string' ? body.lead_name.trim() : '';
  const leadPhone = typeof body.lead_phone === 'string' ? body.lead_phone.trim() : '';
  const pickedGhl =
    typeof body.ghl_contact_id === 'string' && body.ghl_contact_id.trim()
      ? body.ghl_contact_id.trim()
      : null;

  if (!leadName) {
    return NextResponse.json({ error: 'Pick a lead or enter a name.' }, { status: 400 });
  }
  if (createLead && !normalizePhone(leadPhone)) {
    return NextResponse.json({ error: 'Phone is required to add a new lead.' }, { status: 400 });
  }
  if (!createLead && !pickedGhl && !normalizePhone(leadPhone)) {
    return NextResponse.json({ error: 'Pick a lead from the list.' }, { status: 400 });
  }

  let commissionAmount: number | null = null;
  if (stage === 'funded' && body.commission_amount != null && body.commission_amount !== '') {
    commissionAmount = parseMoney(body.commission_amount);
    if (commissionAmount == null) {
      return NextResponse.json({ error: 'What you made must be a dollar amount.' }, { status: 400 });
    }
  }

  try {
    const existing = await loadExistingEvents(
      service,
      client.client_id,
      pickedGhl,
      leadPhone,
    );

    const plan = planLoanLogEvents({
      stage,
      createLead,
      occurredDate,
      loanSize,
      commissionAmount,
      clientId: client.client_id,
      leadName,
      leadPhone,
      ghlContactId: pickedGhl,
      existing,
    });

    if (plan.rows.length > 0) {
      const { error } = await service.from('events').insert(plan.rows);
      if (error) {
        return NextResponse.json({ error: "Couldn't save. Try again." }, { status: 500 });
      }
    }

    if (plan.duplicateClicked) {
      return NextResponse.json(
        { error: 'Already logged for this day.', duplicate: true, lead_name: leadName, stage },
        { status: 409 },
      );
    }

    return NextResponse.json({
      ok: true,
      lead_name: leadName,
      stage,
    });
  } catch {
    return NextResponse.json({ error: "Couldn't save. Try again." }, { status: 500 });
  }
}

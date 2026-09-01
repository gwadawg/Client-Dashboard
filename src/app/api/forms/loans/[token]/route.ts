import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { normalizePhone } from '@/lib/contact-key';
import {
  attachLeadEventId,
  isClientLogType,
  planDqLogEvent,
  validateDqReasons,
  type DqExistingEvent,
} from '@/lib/dq-log-form';
import {
  insertLoanDeal,
  loadContactLoanDeals,
  normalizeTransactionLabel,
  promoteLoanDeal,
} from '@/lib/loan-deals';
import {
  isLoanLogStage,
  parseLoanLogDate,
  parseMoney,
  planLoanLogEvents,
  resolveLoanLogToken,
  type LoanLogExistingEvent,
} from '@/lib/loan-log-form';

const INVALID = 'This link isn’t valid. Ask your Waiz contact for a new one.';

const EVENT_SELECT =
  'id, event_type, occurred_at, ghl_contact_id, lead_phone, ad_name, adset_name, campaign_name, utm_source, utm_campaign, utm_content';

type EventRow = DqExistingEvent & {
  ghl_contact_id?: string | null;
  lead_phone?: string | null;
};

async function loadContactEvents(
  service: ReturnType<typeof createServiceClient>,
  clientId: string,
  ghlContactId: string | null,
  phone: string,
): Promise<DqExistingEvent[]> {
  const digits = normalizePhone(phone);
  const ghl = ghlContactId?.trim() || null;
  const merged = new Map<string, DqExistingEvent>();

  const take = (rows: EventRow[]) => {
    for (const row of rows) {
      const key = `${row.event_type}:${row.occurred_at}:${row.ghl_contact_id ?? ''}:${row.lead_phone ?? ''}:${row.id ?? ''}`;
      if (!merged.has(key)) {
        merged.set(key, {
          id: row.id,
          event_type: row.event_type,
          occurred_at: row.occurred_at,
          ad_name: row.ad_name,
          adset_name: row.adset_name,
          campaign_name: row.campaign_name,
          utm_source: row.utm_source,
          utm_campaign: row.utm_campaign,
          utm_content: row.utm_content,
        });
      }
    }
  };

  if (ghl) {
    const { data, error } = await service
      .from('events')
      .select(EVENT_SELECT)
      .eq('client_id', clientId)
      .eq('ghl_contact_id', ghl)
      .limit(2000);
    if (error) throw new Error(error.message);
    take((data ?? []) as EventRow[]);
  }

  if (digits) {
    const { data, error } = await service
      .from('events')
      .select(EVENT_SELECT)
      .eq('client_id', clientId)
      .ilike('lead_phone', `%${digits}%`)
      .limit(2000);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as EventRow[];
    take(rows.filter(row => normalizePhone(row.lead_phone) === digits));
  }

  return [...merged.values()];
}

function toLoanExisting(events: DqExistingEvent[]): LoanLogExistingEvent[] {
  return events.map(e => ({ event_type: e.event_type, occurred_at: e.occurred_at }));
}

function parseLeadFields(body: Record<string, unknown>) {
  const createLead = body.cant_find === true;
  const leadName = typeof body.lead_name === 'string' ? body.lead_name.trim() : '';
  const leadPhone = typeof body.lead_phone === 'string' ? body.lead_phone.trim() : '';
  const pickedGhl =
    typeof body.ghl_contact_id === 'string' && body.ghl_contact_id.trim()
      ? body.ghl_contact_id.trim()
      : null;
  return { createLead, leadName, leadPhone, pickedGhl };
}

function validateLeadFields(
  createLead: boolean,
  leadName: string,
  leadPhone: string,
  pickedGhl: string | null,
): string | null {
  if (!leadName) return 'Pick a lead or enter a name.';
  if (createLead && !normalizePhone(leadPhone)) {
    return 'Phone is required to add a new lead.';
  }
  if (!createLead && !pickedGhl && !normalizePhone(leadPhone)) {
    return 'Pick a lead from the list.';
  }
  return null;
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

  const logType = isClientLogType(body.log_type) ? body.log_type : 'conversion';

  const occurredDate =
    parseLoanLogDate(body.occurred_on) ??
    parseLoanLogDate(new Date().toISOString().slice(0, 10));
  if (!occurredDate) {
    return NextResponse.json({ error: 'Enter a valid date.' }, { status: 400 });
  }

  const { createLead, leadName, leadPhone, pickedGhl } = parseLeadFields(body);
  const leadError = validateLeadFields(createLead, leadName, leadPhone, pickedGhl);
  if (leadError) {
    return NextResponse.json({ error: leadError }, { status: 400 });
  }

  if (logType === 'dq') {
    return handleDqSubmit(service, client, {
      createLead,
      leadName,
      leadPhone,
      pickedGhl,
      occurredDate,
      body,
    });
  }

  return handleConversionSubmit(service, client, {
    createLead,
    leadName,
    leadPhone,
    pickedGhl,
    occurredDate,
    body,
  });
}

async function handleDqSubmit(
  service: ReturnType<typeof createServiceClient>,
  client: { client_id: string; client_name: string },
  input: {
    createLead: boolean;
    leadName: string;
    leadPhone: string;
    pickedGhl: string | null;
    occurredDate: string;
    body: Record<string, unknown>;
  },
) {
  const validated = validateDqReasons(input.body);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  try {
    const existing = await loadContactEvents(
      service,
      client.client_id,
      input.pickedGhl,
      input.leadPhone,
    );

    const preview = planDqLogEvent({
      createLead: input.createLead,
      occurredDate: input.occurredDate,
      clientId: client.client_id,
      leadName: input.leadName,
      leadPhone: input.leadPhone,
      ghlContactId: input.pickedGhl,
      dqReasons: validated.dqReasons,
      dqOther: validated.dqOther,
      notes: validated.notes,
      existing,
    });

    const planned = planDqLogEvent({
      createLead: input.createLead,
      occurredDate: input.occurredDate,
      clientId: client.client_id,
      leadName: input.leadName,
      leadPhone: input.leadPhone,
      ghlContactId: preview.ghlContactId,
      dqReasons: validated.dqReasons,
      dqOther: validated.dqOther,
      notes: validated.notes,
      existing,
    });

    if (planned.duplicate) {
      return NextResponse.json(
        {
          error: 'This lead is already logged as disqualified.',
          duplicate: true,
          lead_name: input.leadName,
          log_type: 'dq',
        },
        { status: 409 },
      );
    }

    let dqRow = planned.dqRow;

    if (planned.leadRow) {
      const { data: leadInsert, error: leadError } = await service
        .from('events')
        .insert(planned.leadRow)
        .select('id')
        .single();
      if (leadError) {
        return NextResponse.json({ error: "Couldn't save. Try again." }, { status: 500 });
      }
      if (leadInsert?.id) {
        dqRow = attachLeadEventId(dqRow, leadInsert.id);
      }
    }

    const { error: dqError } = await service.from('events').insert(dqRow);
    if (dqError) {
      if (dqError.code === '23505') {
        return NextResponse.json(
          {
            error: 'This lead is already logged as disqualified.',
            duplicate: true,
            lead_name: input.leadName,
            log_type: 'dq',
          },
          { status: 409 },
        );
      }
      return NextResponse.json({ error: "Couldn't save. Try again." }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      lead_name: input.leadName,
      log_type: 'dq',
    });
  } catch {
    return NextResponse.json({ error: "Couldn't save. Try again." }, { status: 500 });
  }
}

async function handleConversionSubmit(
  service: ReturnType<typeof createServiceClient>,
  client: { client_id: string; client_name: string },
  input: {
    createLead: boolean;
    leadName: string;
    leadPhone: string;
    pickedGhl: string | null;
    occurredDate: string;
    body: Record<string, unknown>;
  },
) {
  const stage = input.body.stage;
  if (!isLoanLogStage(stage)) {
    return NextResponse.json({ error: 'Choose Proposal, Submitted, or Funded.' }, { status: 400 });
  }

  const loanSize = parseMoney(input.body.loan_size);
  if (loanSize == null || loanSize <= 0) {
    return NextResponse.json({ error: 'Loan size is required.' }, { status: 400 });
  }

  let commissionAmount: number | null = null;
  if (stage === 'funded' && input.body.commission_amount != null && input.body.commission_amount !== '') {
    commissionAmount = parseMoney(input.body.commission_amount);
    if (commissionAmount == null) {
      return NextResponse.json({ error: 'What you made must be a dollar amount.' }, { status: 400 });
    }
  }

  const transactionLabel = normalizeTransactionLabel(
    input.body.transaction_label ?? input.body.property_label,
  );

  try {
    const contactEvents = await loadContactEvents(
      service,
      client.client_id,
      input.pickedGhl,
      input.leadPhone,
    );
    const existing = toLoanExisting(contactEvents);

    const preview = planLoanLogEvents({
      stage,
      createLead: input.createLead,
      occurredDate: input.occurredDate,
      loanSize,
      commissionAmount,
      transactionLabel,
      clientId: client.client_id,
      leadName: input.leadName,
      leadPhone: input.leadPhone,
      ghlContactId: input.pickedGhl,
      existing,
    });

    const existingDeals = await loadContactLoanDeals(service, client.client_id, preview.ghlContactId);
    const planned = planLoanLogEvents({
      stage,
      createLead: input.createLead,
      occurredDate: input.occurredDate,
      loanSize,
      commissionAmount,
      transactionLabel,
      clientId: client.client_id,
      leadName: input.leadName,
      leadPhone: input.leadPhone,
      ghlContactId: preview.ghlContactId,
      existing,
      existingDeals,
    });

    if (planned.rows.length > 0) {
      const { error } = await service.from('events').insert(planned.rows);
      if (error) {
        if (error.code === '23505') {
          // Person already has this conversion stage — continue to the deal write.
        } else {
          return NextResponse.json({ error: "Couldn't save. Try again." }, { status: 500 });
        }
      }
    }

    if (planned.deal.action === 'promote' && planned.deal.promoteId) {
      await promoteLoanDeal(service, planned.deal.promoteId, {
        funded_at: planned.deal.fundedAt ?? planned.deal.submittedAt,
        loan_size: loanSize,
        commission_amount: commissionAmount,
        transaction_label: transactionLabel,
      });
    } else if (planned.deal.action === 'insert') {
      const written = await insertLoanDeal(service, {
        client_id: client.client_id,
        ghl_contact_id: planned.ghlContactId,
        lead_name: input.leadName,
        lead_phone: input.leadPhone,
        transaction_label: transactionLabel,
        stage: planned.deal.stage,
        submitted_at: planned.deal.submittedAt,
        funded_at: planned.deal.fundedAt,
        loan_size: loanSize,
        commission_amount: planned.deal.stage === 'funded' ? commissionAmount : null,
        source: 'loan_log_form',
        raw: {
          source: 'loan_log_form',
          loan_size: loanSize,
          ...(transactionLabel ? { transaction_label: transactionLabel } : {}),
          ...(commissionAmount != null ? { commission_amount: commissionAmount } : {}),
        },
      });
      if ('duplicate' in written) {
        return NextResponse.json(
          { error: 'Already logged for this day.', duplicate: true, lead_name: input.leadName, stage },
          { status: 409 },
        );
      }
    }

    if (planned.duplicateClicked) {
      return NextResponse.json(
        {
          error:
            'Already logged for this day. If this is another transaction, add a name or a different loan size.',
          duplicate: true,
          lead_name: input.leadName,
          stage,
        },
        { status: 409 },
      );
    }

    return NextResponse.json({
      ok: true,
      lead_name: input.leadName,
      stage,
      log_type: 'conversion',
    });
  } catch {
    return NextResponse.json({ error: "Couldn't save. Try again." }, { status: 500 });
  }
}

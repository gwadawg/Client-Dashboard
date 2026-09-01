import { NextResponse } from 'next/server';
import { buildContactKey, normalizePhone } from '@/lib/contact-key';
import { loadContactLoanDeals } from '@/lib/loan-deals';
import { buildLeadContext, type LeadContextEvent } from '@/lib/loan-log-lead-context';
import { resolveLoanLogToken } from '@/lib/loan-log-form';
import { createServiceClient } from '@/lib/supabase';

const INVALID = 'This link isn’t valid. Ask your Waiz contact for a new one.';
const PROPOSAL_SELECT = 'event_type, occurred_at, raw';

type ProposalRow = LeadContextEvent;

async function loadProposalEvents(
  service: ReturnType<typeof createServiceClient>,
  clientId: string,
  ghlContactId: string | null,
  phone: string,
): Promise<ProposalRow[]> {
  const digits = normalizePhone(phone);
  const ghl = ghlContactId?.trim() || null;
  const merged = new Map<string, ProposalRow>();

  const take = (rows: ProposalRow[]) => {
    for (const row of rows) {
      const key = `${row.event_type}:${row.occurred_at}:${JSON.stringify(row.raw ?? null)}`;
      merged.set(key, row);
    }
  };

  if (ghl) {
    const { data, error } = await service
      .from('events')
      .select(PROPOSAL_SELECT)
      .eq('client_id', clientId)
      .eq('ghl_contact_id', ghl)
      .in('event_type', ['proposal_made', 'proposal_sent'])
      .limit(200);
    if (error) throw new Error(error.message);
    take((data ?? []) as ProposalRow[]);
  }

  if (digits) {
    const { data, error } = await service
      .from('events')
      .select(PROPOSAL_SELECT)
      .eq('client_id', clientId)
      .ilike('lead_phone', `%${digits}%`)
      .in('event_type', ['proposal_made', 'proposal_sent'])
      .limit(200);
    if (error) throw new Error(error.message);
    take((data ?? []) as ProposalRow[]);
  }

  return [...merged.values()];
}

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
  const ghlContactId = (url.searchParams.get('ghl_contact_id') ?? '').trim() || null;
  const phone = (url.searchParams.get('phone') ?? '').trim();

  if (!ghlContactId && !normalizePhone(phone)) {
    return NextResponse.json({ error: 'Lead contact is required.' }, { status: 400 });
  }

  const resolvedGhl =
    ghlContactId || buildContactKey(client.client_id, phone);

  try {
    const [events, deals] = await Promise.all([
      loadProposalEvents(service, client.client_id, ghlContactId, phone),
      loadContactLoanDeals(service, client.client_id, resolvedGhl),
    ]);

    return NextResponse.json(buildLeadContext(events, deals));
  } catch {
    return NextResponse.json({ error: "Couldn't load lead context." }, { status: 500 });
  }
}

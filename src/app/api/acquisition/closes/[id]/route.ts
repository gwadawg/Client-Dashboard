import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requirePermission } from '@/lib/api-auth';
import {
  buildCloserFormUrlForLead,
  hasCloserFormSubmission,
} from '@/lib/acquisition-closer-form';
import { enrichClosesWithCompleteness } from '@/lib/acquisition-close-enrich';
import { parsePatchCloseBody, patchAcquisitionClose } from '@/lib/acquisition-close-update';
import { flattenRawCloseRow } from '@/lib/acquisition-raw-enriched';

const CLOSE_DETAIL_SELECT = `
  *,
  acquisition_leads(id, lead_name, email, phone, ghl_contact_id),
  acquisition_offers(id, offer_type, offered_by, setter_name, is_closed, cash_collected, offered_at, appointment_id),
  clients(id, name, reporting_type, service_program)
`;

type RouteCtx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: RouteCtx) {
  const auth = await getAuthContext();
  if (isAuthError(auth)) return auth;
  const denied = requirePermission(auth, 'acquisition');
  if (denied) return denied;

  const { id } = await ctx.params;

  const { data, error } = await auth.service
    .from('acquisition_closes')
    .select(CLOSE_DETAIL_SELECT)
    .eq('id', id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Close not found' }, { status: 404 });

  const [enriched] = await enrichClosesWithCompleteness(auth.service, [data as Record<string, unknown>]);
  const flat = flattenRawCloseRow(data as Record<string, unknown>);

  const leadId = flat.lead_id as string | null;
  const offerId = flat.offer_id as string | null;

  const [{ data: clients }, { data: leadOffers }, demoApptRes] = await Promise.all([
    auth.service.from('clients').select('id, name, email, phone').order('name'),
    leadId
      ? auth.service
          .from('acquisition_offers')
          .select('id, offer_type, offered_at, is_closed, cash_collected, offered_by, setter_name')
          .eq('lead_id', leadId)
          .order('offered_at', { ascending: false })
          .limit(20)
      : Promise.resolve({ data: [] }),
    leadId
      ? auth.service
          .from('acquisition_appointments')
          .select('id, ghl_appointment_id, appointment_type, scheduled_at, setter_name, call_taken_by')
          .eq('lead_id', leadId)
          .eq('appointment_type', 'demo')
          .order('scheduled_at', { ascending: false })
          .limit(5)
      : Promise.resolve({ data: [] }),
  ]);

  let closer_form_url: string | null = null;
  let closer_form_done = enriched?.has_closer_form ?? false;
  const demoAppts = demoApptRes.data ?? [];

  if (leadId && !closer_form_done) {
    const demoWithGhl = demoAppts.find(a => a.ghl_appointment_id);
    closer_form_url = await buildCloserFormUrlForLead(
      auth.service,
      leadId,
      demoWithGhl?.ghl_appointment_id ?? null,
    );
    if (demoWithGhl?.id) {
      closer_form_done = await hasCloserFormSubmission(
        auth.service,
        demoWithGhl.id,
        demoWithGhl.ghl_appointment_id,
      );
    }
  }

  return NextResponse.json({
    close: enriched ?? flat,
    lead_offers: leadOffers ?? [],
    demo_appointments: demoAppts,
    clients: clients ?? [],
    closer_form_url: closer_form_done ? null : closer_form_url,
    closer_form_done,
    linked_offer_id: offerId,
  });
}

export async function PATCH(req: NextRequest, ctx: RouteCtx) {
  const auth = await getAuthContext();
  if (isAuthError(auth)) return auth;
  const denied = requirePermission(auth, 'acquisition');
  if (denied) return denied;

  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  try {
    await patchAcquisitionClose(auth.service, id, parsePatchCloseBody(body as Record<string, unknown>));
    const { data, error } = await auth.service
      .from('acquisition_closes')
      .select(CLOSE_DETAIL_SELECT)
      .eq('id', id)
      .single();
    if (error) throw new Error(error.message);
    const [enriched] = await enrichClosesWithCompleteness(auth.service, [data as Record<string, unknown>]);
    return NextResponse.json({ success: true, close: enriched });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

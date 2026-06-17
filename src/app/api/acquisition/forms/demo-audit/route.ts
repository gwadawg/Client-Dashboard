import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { DOWNSELL_OFFER_TYPES } from '@/lib/acquisition-config';
import { applyDemoAudit } from '@/lib/acquisition-form-apply';
import { verifyAcquisitionFormToken } from '@/lib/acquisition-form-token';
import {
  getAcquisitionContact,
  ghlContactName,
} from '@/lib/ghl-acquisition-api';
import { REPORTING_TYPES } from '@/lib/reporting-types';
import { SERVICE_PROGRAMS } from '@/lib/service-program';

function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const contactId = str(params.get('contact_id'));
  const appointmentId = str(params.get('appointment_id'));
  const token = str(params.get('token'));

  if (!contactId) {
    return NextResponse.json({ error: 'contact_id is required' }, { status: 400 });
  }

  const check = verifyAcquisitionFormToken(contactId, appointmentId, token);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 401 });

  try {
    const contact = await getAcquisitionContact(contactId);
    const service = createServiceClient();
    let demoAppt = null;
    if (appointmentId) {
      const { data } = await service
        .from('acquisition_appointments')
        .select('id, setter_name, call_taken_by, scheduled_at, booked_at')
        .eq('ghl_appointment_id', appointmentId)
        .maybeSingle();
      demoAppt = data;
    }

    return NextResponse.json({
      contact_id: contactId,
      appointment_id: appointmentId,
      lead_name: ghlContactName(contact),
      closer_name_default: demoAppt?.call_taken_by ?? null,
      setter_name_default: demoAppt?.setter_name ?? null,
      reporting_types: REPORTING_TYPES,
      service_programs: SERVICE_PROGRAMS,
      downsell_offer_types: Array.from(DOWNSELL_OFFER_TYPES),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const contactId = str(body.contact_id) ?? str(body.ghl_contact_id);
  const appointmentId = str(body.appointment_id) ?? str(body.ghl_appointment_id);
  const token = str(body.token);

  if (!contactId) {
    return NextResponse.json({ error: 'contact_id is required' }, { status: 400 });
  }

  const check = verifyAcquisitionFormToken(contactId, appointmentId, token);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 401 });

  const closerName = str(body.closer_name);
  if (!closerName) {
    return NextResponse.json({ error: 'closer_name is required' }, { status: 400 });
  }

  const offerPresented = body.offer_presented === true || body.offer_presented === 'yes';

  try {
    const service = createServiceClient();
    const result = await applyDemoAudit(service, {
      ghl_contact_id: contactId,
      ghl_appointment_id: appointmentId,
      closer_name: closerName,
      setter_name: str(body.setter_name),
      recording_url: str(body.recording_url),
      transcript_url: str(body.transcript_url),
      notes: str(body.notes),
      offer_presented: offerPresented,
      disposition: str(body.disposition),
      next_step: str(body.next_step),
      closed_on_call:
        body.closed_on_call === true || body.closed_on_call === 'yes'
          ? true
          : body.closed_on_call === false || body.closed_on_call === 'no'
            ? false
            : null,
      offer_type: str(body.offer_type),
      follow_up_notes: str(body.follow_up_notes),
      reporting_type: str(body.reporting_type) as never,
      service_program: str(body.service_program) as never,
      cash_collected:
        body.cash_collected != null && body.cash_collected !== ''
          ? Number(body.cash_collected)
          : null,
      closed_at: str(body.closed_at),
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

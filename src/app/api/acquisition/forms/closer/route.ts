import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { DOWNSELL_OFFER_TYPES, GHL_CF } from '@/lib/acquisition-config';
import { applyCloserForm } from '@/lib/acquisition-form-apply';
import { recordGhlSyncOnSubmission, syncCloserFormToGhl } from '@/lib/ghl-acquisition-sync';
import { verifyAcquisitionFormToken } from '@/lib/acquisition-form-token';
import {
  ACQUISITION_LEAD_SOURCES,
  resolveAcquisitionLeadSource,
} from '@/lib/acquisition-lead-source';
import {
  LEAD_QUALITY_SCORES,
  ROOT_CAUSE_OBJECTIONS,
  SURFACE_OBJECTIONS,
} from '@/lib/closer-form-config';
import {
  getAcquisitionContact,
  ghlContactName,
  ghlCustomFieldById,
} from '@/lib/ghl-acquisition-api';
import { REPORTING_TYPES } from '@/lib/reporting-types';
import { SERVICE_PROGRAMS } from '@/lib/service-program';

function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

function parseRating(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v));
  return Number.isFinite(n) ? n : null;
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
    let appt = null;
    if (appointmentId) {
      const { data } = await service
        .from('acquisition_appointments')
        .select('id, appointment_type, setter_name, call_taken_by, scheduled_at, booked_at')
        .eq('ghl_appointment_id', appointmentId)
        .maybeSingle();
      appt = data;
    }

    const { data: lead } = await service
      .from('acquisition_leads')
      .select('source')
      .eq('ghl_contact_id', contactId)
      .maybeSingle();
    const ghlLeadSource = ghlCustomFieldById(contact, GHL_CF.leadSource);
    const leadSourceDefault = resolveAcquisitionLeadSource(lead?.source, ghlLeadSource);

    return NextResponse.json({
      contact_id: contactId,
      appointment_id: appointmentId,
      appointment_type: appt?.appointment_type ?? null,
      lead_name: ghlContactName(contact),
      closer_name_default: appt?.call_taken_by ?? null,
      setter_name_default: appt?.setter_name ?? null,
      lead_source_default: leadSourceDefault,
      lead_source_options: ACQUISITION_LEAD_SOURCES,
      reporting_types: REPORTING_TYPES,
      service_programs: SERVICE_PROGRAMS,
      downsell_offer_types: Array.from(DOWNSELL_OFFER_TYPES),
      lead_quality_scores: LEAD_QUALITY_SCORES,
      surface_objections: SURFACE_OBJECTIONS,
      root_cause_objections: ROOT_CAUSE_OBJECTIONS,
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
  const closedOnCall =
    body.closed_on_call === true || body.closed_on_call === 'yes'
      ? true
      : body.closed_on_call === false || body.closed_on_call === 'no'
        ? false
        : null;

  try {
    const service = createServiceClient();
    const result = await applyCloserForm(service, {
      ghl_contact_id: contactId,
      ghl_appointment_id: appointmentId,
      closer_name: closerName,
      setter_name: str(body.setter_name),
      recording_url: str(body.recording_url),
      transcript: str(body.transcript) ?? str(body.transcript_url),
      notes: str(body.notes),
      offer_presented: offerPresented,
      disposition: str(body.disposition),
      next_step: str(body.next_step),
      closed_on_call: closedOnCall,
      offer_type: str(body.offer_type),
      follow_up_notes: str(body.follow_up_notes),
      reporting_type: str(body.reporting_type) as never,
      service_program: str(body.service_program) as never,
      cash_collected:
        body.cash_collected != null && body.cash_collected !== ''
          ? Number(body.cash_collected)
          : null,
      closed_at: str(body.closed_at),
      call_rating: parseRating(body.call_rating),
      improvement_notes: str(body.improvement_notes),
      lead_quality_score: str(body.lead_quality_score),
      lead_quality_explanation: str(body.lead_quality_explanation),
      surface_objection: str(body.surface_objection),
      surface_objection_other: str(body.surface_objection_other),
      root_cause_objection: str(body.root_cause_objection),
      root_cause_objection_other: str(body.root_cause_objection_other),
      lead_source: str(body.lead_source),
      dial_id: str(body.dial_id),
    });

    const syncResult = await syncCloserFormToGhl({
      ghl_contact_id: contactId,
      offer_presented: offerPresented,
      closed_on_call: closedOnCall,
    });
    await recordGhlSyncOnSubmission(service, result.submission_id, syncResult);

    return NextResponse.json({
      ok: true,
      ...result,
      ghl_sync_status: syncResult.status,
      ghl_sync_error:
        syncResult.status === 'failed'
          ? syncResult.error
          : syncResult.status === 'skipped'
            ? syncResult.reason
            : null,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

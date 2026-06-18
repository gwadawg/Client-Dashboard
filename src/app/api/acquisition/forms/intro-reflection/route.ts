import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { BOOKING_SOURCE_OPTIONS, GHL_CF } from '@/lib/acquisition-config';
import { applySetterIntroReflection } from '@/lib/acquisition-form-apply';
import { verifyAcquisitionFormToken } from '@/lib/acquisition-form-token';
import {
  getAcquisitionContact,
  ghlContactName,
  ghlCustomFieldById,
} from '@/lib/ghl-acquisition-api';
import {
  recordGhlSyncOnSubmission,
  syncDemoBookingToGhl,
} from '@/lib/ghl-acquisition-sync';
import {
  findIntroCallForClaim,
  resolveIntroCandidatesForDemo,
  resolveSetterFormMode,
  type SetterFormMode,
} from '@/lib/acquisition-intro-resolver';

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

function tokenApptId(
  introId: string | null,
  demoId: string | null,
  formContext: string | null,
): string | null {
  if (formContext === 'intro_showed') return introId;
  return demoId ?? introId;
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const contactId = str(params.get('contact_id'));
  const token = str(params.get('token'));
  const formContext = str(params.get('form_context'));
  const introGhlId = str(params.get('intro_appointment_id'));
  const demoGhlId = str(params.get('demo_appointment_id'));

  if (!contactId) {
    return NextResponse.json({ error: 'contact_id is required' }, { status: 400 });
  }

  const apptForToken = tokenApptId(introGhlId, demoGhlId, formContext);
  const check = verifyAcquisitionFormToken(contactId, apptForToken, token);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 401 });

  const service = createServiceClient();

  try {
    const contact = await getAcquisitionContact(contactId);
    const setterDefault = ghlCustomFieldById(contact, GHL_CF.agent);

    const { data: lead } = await service
      .from('acquisition_leads')
      .select('id')
      .eq('ghl_contact_id', contactId)
      .maybeSingle();

    let demoAppt = null;
    if (demoGhlId) {
      const { data } = await service
        .from('acquisition_appointments')
        .select('id, booked_at, scheduled_at, setter_name, booking_source')
        .eq('ghl_appointment_id', demoGhlId)
        .maybeSingle();
      demoAppt = data;
    }

    let introAppt = null;
    if (introGhlId) {
      const { data } = await service
        .from('acquisition_appointments')
        .select('id, booked_at, scheduled_at, setter_name, status')
        .eq('ghl_appointment_id', introGhlId)
        .maybeSingle();
      introAppt = data;
    }

    let formMode: SetterFormMode = 'intro_full';
    let introCandidates: Awaited<ReturnType<typeof resolveIntroCandidatesForDemo>> = [];
    let claimIntroCall: { id: string } | null = null;

    if (lead?.id) {
      formMode = await resolveSetterFormMode(service, {
        formContext,
        leadId: lead.id,
        demoAppointmentId: demoAppt?.id ?? null,
      });
      if (demoAppt?.id) {
        introCandidates = await resolveIntroCandidatesForDemo(
          service,
          lead.id,
          demoAppt.booked_at,
        );
        claimIntroCall = await findIntroCallForClaim(service, lead.id, demoAppt.id);
      }
    }

    return NextResponse.json({
      contact_id: contactId,
      form_context: formContext ?? 'demo_booked',
      form_mode: formMode,
      intro_appointment_id: introGhlId,
      demo_appointment_id: demoGhlId,
      lead_name: ghlContactName(contact),
      email: contact.email ?? null,
      phone: contact.phone ?? null,
      setter_name_default: setterDefault,
      booking_source_options: BOOKING_SOURCE_OPTIONS,
      demo_appointment: demoAppt,
      intro_appointment: introAppt,
      intro_candidates: introCandidates,
      claim_intro_call_id: claimIntroCall?.id ?? null,
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

  const contactId = str(body.ghl_contact_id) ?? str(body.contact_id);
  const token = str(body.token);
  const formContext = str(body.form_context);
  const introGhlId =
    str(body.ghl_intro_appointment_id) ?? str(body.intro_appointment_id);
  const demoGhlId =
    str(body.ghl_demo_appointment_id) ?? str(body.demo_appointment_id);

  if (!contactId) {
    return NextResponse.json({ error: 'contact_id is required' }, { status: 400 });
  }

  const apptForToken = tokenApptId(introGhlId, demoGhlId, formContext);
  const check = verifyAcquisitionFormToken(contactId, apptForToken, token);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 401 });

  const setterName = str(body.setter_name);
  if (!setterName) {
    return NextResponse.json({ error: 'setter_name is required' }, { status: 400 });
  }

  const service = createServiceClient();
  const formMode = (str(body.form_mode) ?? 'demo_full') as
    | 'intro_full'
    | 'demo_full'
    | 'claim_only';

  try {
    const applied = await applySetterIntroReflection(service, {
      ghl_contact_id: contactId,
      form_mode: formMode,
      form_context: formContext,
      ghl_intro_appointment_id: introGhlId,
      ghl_demo_appointment_id: demoGhlId,
      intro_appointment_id: str(body.intro_appointment_uuid),
      intro_call_id: str(body.intro_call_id) ?? str(body.claim_intro_call_id),
      setter_name: setterName,
      status: str(body.status) ?? 'showed',
      contact_path: str(body.contact_path),
      notes: str(body.notes),
      fun_outcome: str(body.fun_outcome) as never,
      qualified:
        body.qualified === true || body.qualified === 'yes'
          ? true
          : body.qualified === false || body.qualified === 'no'
            ? false
            : null,
      motivator_summary: str(body.motivator_summary),
      objections_noted: str(body.objections_noted),
      icp_track: str(body.icp_track),
      timeline_blockers: str(body.timeline_blockers),
      pre_call_video_sent:
        body.pre_call_video_sent === true || body.pre_call_video_sent === 'yes'
          ? true
          : body.pre_call_video_sent === false || body.pre_call_video_sent === 'no'
            ? false
            : null,
      handoff_notes: str(body.handoff_notes),
      demo_booked: body.demo_booked === true || body.demo_booked === 'yes',
      booking_source: str(body.booking_source),
      booked_at: str(body.booked_at),
      scheduled_at: str(body.scheduled_at),
      disposition: str(body.disposition),
      rebook_at: str(body.rebook_at),
      call_rating: parseRating(body.call_rating),
      improvement_notes: str(body.improvement_notes),
    });

    let ghl_sync_status = 'skipped';
    let ghl_sync_error: string | null = null;
    if (applied.demo_appointment_id && body.demo_booked !== false) {
      const syncResult = await syncDemoBookingToGhl({
        ghl_contact_id: contactId,
        ghl_appointment_id: demoGhlId,
        setter_name: setterName,
        booking_source: str(body.booking_source) ?? 'Fresh lead',
        booked_at: str(body.booked_at) ?? new Date().toISOString(),
        scheduled_at: str(body.scheduled_at),
        qualified:
          body.qualified === true || body.qualified === 'yes'
            ? true
            : body.qualified === false || body.qualified === 'no'
              ? false
              : null,
        notes: str(body.notes),
      });
      await recordGhlSyncOnSubmission(service, applied.submission_id, syncResult);
      ghl_sync_status = syncResult.status;
      if (syncResult.status === 'failed') ghl_sync_error = syncResult.error;
      if (syncResult.status === 'skipped') ghl_sync_error = syncResult.reason;
    }

    return NextResponse.json({
      ok: true,
      ...applied,
      ghl_sync_status,
      ghl_sync_error,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

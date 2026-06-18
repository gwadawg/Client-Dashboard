import type { SupabaseClient } from '@supabase/supabase-js';
import {
  DEMO_CALENDAR_ID,
  GHL_CF,
  normalizeOfferType,
  normalizePhone,
} from './acquisition-config';
import type { DemoBookingCreditInput, DemoBookingCreditResult } from './acquisition-form-apply';
import { upsertAcquisitionLead } from './acquisition-ingest';
import {
  getAcquisitionContact,
  ghlContactName,
  ghlCustomFieldById,
} from './ghl-acquisition-api';
import { normalizeReportingType, type ReportingType } from './reporting-types';
import {
  normalizeServiceProgram,
  type ServiceProgram,
} from './service-program';
import {
  resolveObjectionLabel,
  validateCloserFormReflection,
} from './closer-form-config';

export type FunOutcome = 'pass' | 'boot_camp' | 'nurture' | 'not_fit';

export type SetterIntroReflectionInput = {
  ghl_contact_id: string;
  form_mode: 'intro_full' | 'demo_full' | 'claim_only';
  form_context?: string | null;
  ghl_intro_appointment_id?: string | null;
  ghl_demo_appointment_id?: string | null;
  intro_appointment_id?: string | null;
  intro_call_id?: string | null;
  setter_name: string;
  status: string;
  contact_path?: string | null;
  notes?: string | null;
  fun_outcome?: FunOutcome | null;
  qualified?: boolean | null;
  motivator_summary?: string | null;
  objections_noted?: string | null;
  icp_track?: string | null;
  licensed_states?: string[] | null;
  production_monthly?: number | null;
  timeline_blockers?: string | null;
  pre_call_video_sent?: boolean | null;
  handoff_notes?: string | null;
  demo_booked?: boolean | null;
  booking_source?: string | null;
  booked_at?: string | null;
  scheduled_at?: string | null;
  disposition?: string | null;
  rebook_at?: string | null;
};

export type SetterIntroReflectionResult = {
  submission_id: string;
  lead_id: string;
  intro_call_id: string;
  demo_appointment_id: string | null;
  is_resubmit: boolean;
};

export type CloserFormInput = {
  ghl_contact_id: string;
  ghl_appointment_id?: string | null;
  closer_name: string;
  setter_name?: string | null;
  recording_url?: string | null;
  transcript_url?: string | null;
  notes?: string | null;
  offer_presented: boolean;
  disposition?: string | null;
  next_step?: string | null;
  closed_on_call?: boolean | null;
  offer_type?: string | null;
  follow_up_notes?: string | null;
  reporting_type?: ReportingType | null;
  service_program?: ServiceProgram | null;
  cash_collected?: number | null;
  closed_at?: string | null;
  call_rating?: number | null;
  improvement_notes?: string | null;
  lead_quality_score?: string | null;
  lead_quality_explanation?: string | null;
  surface_objection?: string | null;
  surface_objection_other?: string | null;
  root_cause_objection?: string | null;
  root_cause_objection_other?: string | null;
};

export type CloserFormResult = {
  submission_id: string;
  lead_id: string;
  call_id: string;
  offer_id: string | null;
  pending_close_id: string | null;
};

/** @deprecated Use CloserFormInput */
export type DemoAuditInput = CloserFormInput;

/** @deprecated Use CloserFormResult */
export type DemoAuditResult = CloserFormResult;

const CLOSER_APPT_CALL_TYPES = new Set([
  'intro',
  'demo',
  'followup',
  'bamfam',
  'organic',
  'other',
]);

function resolveCloserCallType(appointmentType: string | null | undefined): string {
  const t = appointmentType?.trim();
  if (!t) return 'organic';
  if (CLOSER_APPT_CALL_TYPES.has(t)) return t;
  return 'other';
}

async function ensureLeadId(service: SupabaseClient, contactId: string): Promise<string> {
  const { data: existing } = await service
    .from('acquisition_leads')
    .select('id')
    .eq('ghl_contact_id', contactId)
    .maybeSingle();
  if (existing?.id) return existing.id;

  let payload: Record<string, unknown> = { ghl_contact_id: contactId };
  try {
    const contact = await getAcquisitionContact(contactId);
    payload = {
      ghl_contact_id: contactId,
      lead_name: ghlContactName(contact),
      email: contact.email ?? null,
      phone: normalizePhone(contact.phone),
      source: contact.source ?? null,
    };
  } catch {
    /* stub */
  }
  const upserted = await upsertAcquisitionLead(service, payload);
  if ('error' in upserted) throw new Error(upserted.error);
  return upserted.id;
}

async function apptByGhlId(
  service: SupabaseClient,
  ghlId: string | null | undefined,
) {
  if (!ghlId?.trim()) return null;
  const { data } = await service
    .from('acquisition_appointments')
    .select('id, lead_id, appointment_type, booked_at, scheduled_at, setter_name, call_taken_by')
    .eq('ghl_appointment_id', ghlId.trim())
    .maybeSingle();
  return data;
}

async function apptById(service: SupabaseClient, id: string | null | undefined) {
  if (!id?.trim()) return null;
  const { data } = await service
    .from('acquisition_appointments')
    .select('id, lead_id, appointment_type, booked_at, scheduled_at, ghl_appointment_id')
    .eq('id', id.trim())
    .maybeSingle();
  return data;
}

async function upsertIntroCall(
  service: SupabaseClient,
  leadId: string,
  input: SetterIntroReflectionInput,
  introApptId: string | null,
  calledAt: string,
): Promise<string> {
  const details = {
    contact_path: input.contact_path ?? null,
    fun_outcome: input.fun_outcome ?? null,
    qualified: input.qualified ?? null,
    motivator_summary: input.motivator_summary ?? null,
    objections_noted: input.objections_noted ?? null,
    icp_track: input.icp_track ?? null,
    licensed_states: input.licensed_states ?? null,
    production_monthly: input.production_monthly ?? null,
    timeline_blockers: input.timeline_blockers ?? null,
    pre_call_video_sent: input.pre_call_video_sent ?? null,
    handoff_notes: input.handoff_notes ?? null,
    demo_booked: input.demo_booked ?? null,
    disposition: input.disposition ?? null,
    rebook_at: input.rebook_at ?? null,
    form_context: input.form_context ?? null,
  };

  const row = {
    lead_id: leadId,
    appointment_id: introApptId,
    call_type: 'intro' as const,
    called_at: calledAt,
    status: input.status,
    handled_by: input.setter_name,
    disposition: input.disposition ?? input.fun_outcome ?? null,
    notes: input.notes ?? null,
    source: 'form' as const,
    details,
    updated_at: new Date().toISOString(),
  };

  if (introApptId) {
    const { data: existing } = await service
      .from('acquisition_calls')
      .select('id')
      .eq('appointment_id', introApptId)
      .eq('call_type', 'intro')
      .maybeSingle();

    if (existing?.id) {
      const { data, error } = await service
        .from('acquisition_calls')
        .update(row)
        .eq('id', existing.id)
        .select('id')
        .single();
      if (error) throw new Error(error.message);
      return data.id;
    }
  }

  const { data, error } = await service
    .from('acquisition_calls')
    .insert(row)
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  return data.id;
}

async function linkDemoToIntro(
  service: SupabaseClient,
  introCallId: string,
  demoApptId: string,
  setterName: string,
  bookingSource: string | null,
  claimCredit: boolean,
) {
  await service
    .from('acquisition_calls')
    .update({
      linked_demo_appointment_id: demoApptId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', introCallId);

  const demoUpdate: Record<string, unknown> = {
    intro_call_id: introCallId,
    setter_name: setterName,
    updated_at: new Date().toISOString(),
  };
  if (bookingSource) demoUpdate.booking_source = bookingSource;
  if (claimCredit) demoUpdate.demo_credit_claimed_at = new Date().toISOString();

  await service.from('acquisition_appointments').update(demoUpdate).eq('id', demoApptId);
}

async function upsertDemoFromReflection(
  service: SupabaseClient,
  leadId: string,
  input: SetterIntroReflectionInput,
  leadName: string | null,
  phone: string | null,
): Promise<string> {
  const ghlDemoId = input.ghl_demo_appointment_id?.trim() || null;
  const bookedAt = input.booked_at ?? new Date().toISOString();
  const scheduledAt = input.scheduled_at ?? bookedAt;

  const row = {
    lead_id: leadId,
    ghl_appointment_id: ghlDemoId,
    appointment_type: 'demo' as const,
    calendar_id: DEMO_CALENDAR_ID,
    booking_source: input.booking_source ?? null,
    how_booked: 'setter_booked',
    booked_at: bookedAt,
    scheduled_at: scheduledAt,
    status: 'pending' as const,
    qualified: input.qualified ?? null,
    setter_name: input.setter_name,
    lead_name: leadName,
    phone,
    updated_at: new Date().toISOString(),
  };

  if (ghlDemoId) {
    const existing = await apptByGhlId(service, ghlDemoId);
    if (existing?.id) {
      await service.from('acquisition_appointments').update(row).eq('id', existing.id);
      return existing.id;
    }
    const { data, error } = await service
      .from('acquisition_appointments')
      .insert(row)
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    return data.id;
  }

  const { data, error } = await service
    .from('acquisition_appointments')
    .insert(row)
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  return data.id;
}

export async function applySetterIntroReflection(
  service: SupabaseClient,
  input: SetterIntroReflectionInput,
): Promise<SetterIntroReflectionResult> {
  const contactId = input.ghl_contact_id.trim();
  const leadId = await ensureLeadId(service, contactId);

  let leadName: string | null = null;
  let phone: string | null = null;
  try {
    const contact = await getAcquisitionContact(contactId);
    leadName = ghlContactName(contact);
    phone = normalizePhone(contact.phone);
    if (!input.setter_name.trim()) {
      const agent = ghlCustomFieldById(contact, GHL_CF.agent);
      if (agent) input = { ...input, setter_name: agent };
    }
  } catch {
    const { data: lead } = await service
      .from('acquisition_leads')
      .select('lead_name, phone')
      .eq('id', leadId)
      .single();
    leadName = lead?.lead_name ?? null;
    phone = lead?.phone ?? null;
  }

  const introAppt =
    (await apptById(service, input.intro_appointment_id)) ??
    (await apptByGhlId(service, input.ghl_intro_appointment_id));

  const demoApptPre =
    (await apptByGhlId(service, input.ghl_demo_appointment_id)) ?? null;

  let introCallId: string;
  let demoApptId: string | null = demoApptPre?.id ?? null;

  if (input.form_mode === 'claim_only') {
    const callId = input.intro_call_id?.trim();
    if (!callId || !demoApptId) {
      throw new Error('claim_only requires intro_call_id and demo appointment');
    }
    await linkDemoToIntro(
      service,
      callId,
      demoApptId,
      input.setter_name,
      input.booking_source ?? null,
      true,
    );
    introCallId = callId;
  } else {
    const introApptId = introAppt?.id ?? null;
    const calledAt =
      introAppt?.scheduled_at ??
      introAppt?.booked_at ??
      demoApptPre?.booked_at ??
      new Date().toISOString();

    introCallId = await upsertIntroCall(service, leadId, input, introApptId, calledAt);

    if (input.demo_booked) {
      if (!demoApptId) {
        demoApptId = await upsertDemoFromReflection(service, leadId, input, leadName, phone);
      }
      await linkDemoToIntro(
        service,
        introCallId,
        demoApptId,
        input.setter_name,
        input.booking_source ?? null,
        true,
      );
    }
  }

  const responses = { ...input, intro_call_id: introCallId, demo_appointment_id: demoApptId };
  const ghlApptKey = input.ghl_demo_appointment_id ?? input.ghl_intro_appointment_id ?? null;

  let isResubmit = false;
  let submissionId: string;

  const submissionBase = {
    form_type: 'setter_intro_reflection' as const,
    lead_id: leadId,
    appointment_id: demoApptId ?? introAppt?.id ?? null,
    ghl_contact_id: contactId,
    ghl_appointment_id: ghlApptKey,
    submitted_by: input.setter_name,
    responses,
  };

  if (ghlApptKey) {
    const { data: prior } = await service
      .from('acquisition_form_submissions')
      .select('id')
      .eq('form_type', 'setter_intro_reflection')
      .eq('ghl_contact_id', contactId)
      .eq('ghl_appointment_id', ghlApptKey)
      .maybeSingle();

    if (prior?.id) {
      isResubmit = true;
      const { data, error } = await service
        .from('acquisition_form_submissions')
        .update({
          ...submissionBase,
          ghl_sync_status: 'pending',
          ghl_sync_error: null,
          submitted_at: new Date().toISOString(),
        })
        .eq('id', prior.id)
        .select('id')
        .single();
      if (error) throw new Error(error.message);
      submissionId = data.id;
    } else {
      const { data, error } = await service
        .from('acquisition_form_submissions')
        .insert(submissionBase)
        .select('id')
        .single();
      if (error) throw new Error(error.message);
      submissionId = data.id;
    }
  } else {
    const { data, error } = await service
      .from('acquisition_form_submissions')
      .insert({ ...submissionBase, ghl_appointment_id: null })
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    submissionId = data.id;
  }

  await service
    .from('acquisition_calls')
    .update({ form_submission_id: submissionId })
    .eq('id', introCallId);

  return {
    submission_id: submissionId,
    lead_id: leadId,
    intro_call_id: introCallId,
    demo_appointment_id: demoApptId,
    is_resubmit: isResubmit,
  };
}

/** Legacy demo-booked API → unified reflection with demo_booked=true */
export async function applyDemoBookingCreditAsReflection(
  service: SupabaseClient,
  input: DemoBookingCreditInput,
): Promise<DemoBookingCreditResult> {
  const result = await applySetterIntroReflection(service, {
    ghl_contact_id: input.ghl_contact_id,
    form_mode: 'demo_full',
    form_context: 'demo_booked',
    ghl_demo_appointment_id: input.ghl_appointment_id,
    setter_name: input.setter_name,
    status: 'showed',
    contact_path: 'demo_booked_prompt',
    notes: input.notes,
    qualified: input.qualified,
    fun_outcome: input.qualified === false ? 'not_fit' : 'pass',
    demo_booked: true,
    booking_source: input.booking_source,
    booked_at: input.booked_at,
    scheduled_at: input.scheduled_at,
  });

  if (!result.demo_appointment_id) {
    throw new Error('Failed to create demo appointment');
  }

  return {
    submission_id: result.submission_id,
    lead_id: result.lead_id,
    appointment_id: result.demo_appointment_id,
    is_resubmit: result.is_resubmit,
  };
}

export async function applyCloserForm(
  service: SupabaseClient,
  input: CloserFormInput,
): Promise<CloserFormResult> {
  const contactId = input.ghl_contact_id.trim();
  const leadId = await ensureLeadId(service, contactId);

  const appt = await apptByGhlId(service, input.ghl_appointment_id);
  const calledAt = appt?.scheduled_at ?? appt?.booked_at ?? new Date().toISOString();
  const callType = resolveCloserCallType(appt?.appointment_type);

  const reflectionError = validateCloserFormReflection({
    offer_presented: input.offer_presented,
    closed_on_call: input.closed_on_call,
    call_rating: input.call_rating,
    improvement_notes: input.improvement_notes,
    lead_quality_score: input.lead_quality_score,
    lead_quality_explanation: input.lead_quality_explanation,
    surface_objection: input.surface_objection,
    surface_objection_other: input.surface_objection_other,
    root_cause_objection: input.root_cause_objection,
    root_cause_objection_other: input.root_cause_objection_other,
  });
  if (reflectionError) throw new Error(reflectionError);

  const surfaceObjection = resolveObjectionLabel(
    input.surface_objection,
    input.surface_objection_other,
  );
  const rootCauseObjection = resolveObjectionLabel(
    input.root_cause_objection,
    input.root_cause_objection_other,
  );

  const details: Record<string, unknown> = {
    offer_presented: input.offer_presented,
    closed_on_call: input.closed_on_call ?? null,
    follow_up_notes: input.follow_up_notes ?? null,
    disposition: input.disposition ?? null,
    next_step: input.next_step ?? null,
    call_rating: input.call_rating ?? null,
    improvement_notes: input.improvement_notes ?? null,
    lead_quality_score: input.lead_quality_score ?? null,
    lead_quality_explanation: input.lead_quality_explanation ?? null,
    surface_objection: surfaceObjection,
    root_cause_objection: rootCauseObjection,
  };

  const callRow = {
    lead_id: leadId,
    appointment_id: appt?.id ?? null,
    call_type: callType,
    called_at: calledAt,
    status: 'showed' as const,
    handled_by: input.closer_name,
    co_handler: input.setter_name ?? null,
    recording_url: input.recording_url ?? null,
    transcript_url: input.transcript_url ?? null,
    notes: input.notes ?? null,
    disposition: input.disposition ?? rootCauseObjection ?? surfaceObjection ?? null,
    source: 'form' as const,
    details,
    updated_at: new Date().toISOString(),
  };

  let callId: string;
  if (appt?.id) {
    const { data: existing } = await service
      .from('acquisition_calls')
      .select('id')
      .eq('appointment_id', appt.id)
      .eq('call_type', callType)
      .maybeSingle();
    if (existing?.id) {
      const { data, error } = await service
        .from('acquisition_calls')
        .update(callRow)
        .eq('id', existing.id)
        .select('id')
        .single();
      if (error) throw new Error(error.message);
      callId = data.id;
    } else {
      const { data, error } = await service
        .from('acquisition_calls')
        .insert(callRow)
        .select('id')
        .single();
      if (error) throw new Error(error.message);
      callId = data.id;
    }
  } else {
    const { data, error } = await service
      .from('acquisition_calls')
      .insert(callRow)
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    callId = data.id;
  }

  let offerId: string | null = null;
  let pendingCloseId: string | null = null;

  if (input.offer_presented) {
    const offeredAt = calledAt;
    const offerType = normalizeOfferType(input.offer_type ?? 'Core Offer');
    const isClosed = input.closed_on_call === true;

    const offerRow = {
      lead_id: leadId,
      appointment_id: appt?.id ?? null,
      offered_at: offeredAt,
      offer_type: offerType,
      is_closed: isClosed,
      cash_collected: input.cash_collected ?? null,
      setter_name: input.setter_name ?? null,
      offered_by: input.closer_name,
      updated_at: new Date().toISOString(),
    };

    if (appt?.id) {
      const { data: existingOffer } = await service
        .from('acquisition_offers')
        .select('id')
        .eq('appointment_id', appt.id)
        .eq('offer_type', offerType)
        .maybeSingle();
      if (existingOffer?.id) {
        await service.from('acquisition_offers').update(offerRow).eq('id', existingOffer.id);
        offerId = existingOffer.id;
      } else {
        const { data, error } = await service
          .from('acquisition_offers')
          .insert(offerRow)
          .select('id')
          .single();
        if (error) throw new Error(error.message);
        offerId = data.id;
      }
    } else {
      const { data, error } = await service
        .from('acquisition_offers')
        .insert(offerRow)
        .select('id')
        .single();
      if (error) throw new Error(error.message);
      offerId = data.id;
    }

    await service.from('acquisition_calls').update({ offer_id: offerId }).eq('id', callId);

    if (isClosed) {
      const reportingType = input.reporting_type
        ? normalizeReportingType(input.reporting_type)
        : null;
      const serviceProgram = input.service_program
        ? normalizeServiceProgram(input.service_program)
        : null;
      const closedAt = input.closed_at ?? offeredAt;

      const { data: closeRow, error: closeErr } = await service
        .from('acquisition_closes')
        .insert({
          lead_id: leadId,
          offer_id: offerId,
          client_id: null,
          closed_at: closedAt,
          close_source: 'manual',
          cash_collected: input.cash_collected ?? null,
          setter_name: input.setter_name ?? null,
          offer_type: offerType,
          mapping_status: 'pending_client',
          call_id: callId,
          reporting_type: reportingType,
          service_program: serviceProgram,
        })
        .select('id')
        .single();
      if (closeErr) throw new Error(closeErr.message);
      pendingCloseId = closeRow.id;
    }
  }

  const { data: submission, error: subErr } = await service
    .from('acquisition_form_submissions')
    .insert({
      form_type: 'closer_form',
      lead_id: leadId,
      appointment_id: appt?.id ?? null,
      ghl_contact_id: contactId,
      ghl_appointment_id: input.ghl_appointment_id ?? null,
      submitted_by: input.closer_name,
      responses: { ...input, call_id: callId, offer_id: offerId },
    })
    .select('id')
    .single();
  if (subErr) throw new Error(subErr.message);

  await service
    .from('acquisition_calls')
    .update({ form_submission_id: submission.id })
    .eq('id', callId);

  return {
    submission_id: submission.id,
    lead_id: leadId,
    call_id: callId,
    offer_id: offerId,
    pending_close_id: pendingCloseId,
  };
}

/** @deprecated Use applyCloserForm */
export const applyDemoAudit = applyCloserForm;

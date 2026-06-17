import type { SupabaseClient } from '@supabase/supabase-js';
import {
  DEMO_CALENDAR_ID,
  GHL_ACQUISITION_LOCATION_ID,
  GHL_CF,
  normalizePhone,
} from './acquisition-config';
import { upsertAcquisitionLead } from './acquisition-ingest';
import {
  getAcquisitionContact,
  ghlContactName,
  ghlCustomFieldById,
} from './ghl-acquisition-api';

export type DemoBookingCreditInput = {
  ghl_contact_id: string;
  ghl_appointment_id?: string | null;
  setter_name: string;
  booking_source: string;
  booked_at: string;
  scheduled_at?: string | null;
  qualified?: boolean | null;
  notes?: string | null;
};

export type DemoBookingCreditResult = {
  submission_id: string;
  lead_id: string;
  appointment_id: string;
  is_resubmit: boolean;
};

async function ensureLead(
  service: SupabaseClient,
  contactId: string,
): Promise<string> {
  const { data: existing } = await service
    .from('acquisition_leads')
    .select('id')
    .eq('ghl_contact_id', contactId)
    .maybeSingle();

  if (existing?.id) return existing.id;

  let contactPayload: Record<string, unknown> = {
    ghl_contact_id: contactId,
    location_id: GHL_ACQUISITION_LOCATION_ID,
  };

  try {
    const contact = await getAcquisitionContact(contactId);
    contactPayload = {
      ...contactPayload,
      lead_name: ghlContactName(contact),
      email: contact.email ?? null,
      phone: normalizePhone(contact.phone),
      source: contact.source ?? null,
    };
  } catch {
    // Webhook may have created stub; insert minimal row below
  }

  const upserted = await upsertAcquisitionLead(service, contactPayload);
  if ('error' in upserted) throw new Error(upserted.error);
  return upserted.id;
}

async function upsertDemoAppointment(
  service: SupabaseClient,
  leadId: string,
  input: DemoBookingCreditInput,
  leadName: string | null,
  phone: string | null,
): Promise<string> {
  const ghlApptId = input.ghl_appointment_id?.trim() || null;
  const row = {
    lead_id: leadId,
    ghl_appointment_id: ghlApptId,
    appointment_type: 'demo' as const,
    calendar_id: DEMO_CALENDAR_ID,
    booking_source: input.booking_source,
    how_booked: 'setter_booked',
    booked_at: input.booked_at,
    scheduled_at: input.scheduled_at ?? input.booked_at,
    status: 'pending' as const,
    qualified: input.qualified ?? null,
    setter_name: input.setter_name,
    lead_name: leadName,
    phone,
    updated_at: new Date().toISOString(),
  };

  if (ghlApptId) {
    const { data, error } = await service
      .from('acquisition_appointments')
      .upsert(row, { onConflict: 'ghl_appointment_id' })
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    return data.id;
  }

  const { data: existing } = await service
    .from('acquisition_appointments')
    .select('id')
    .eq('lead_id', leadId)
    .eq('appointment_type', 'demo')
    .eq('booked_at', input.booked_at)
    .maybeSingle();

  if (existing?.id) {
    const { data, error } = await service
      .from('acquisition_appointments')
      .update(row)
      .eq('id', existing.id)
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

export async function applyDemoBookingCredit(
  service: SupabaseClient,
  input: DemoBookingCreditInput,
): Promise<DemoBookingCreditResult> {
  const contactId = input.ghl_contact_id.trim();
  const leadId = await ensureLead(service, contactId);

  let leadName: string | null = null;
  let phone: string | null = null;
  try {
    const contact = await getAcquisitionContact(contactId);
    leadName = ghlContactName(contact);
    phone = normalizePhone(contact.phone);
    const agentDefault = ghlCustomFieldById(contact, GHL_CF.agent);
    if (!input.setter_name.trim() && agentDefault) {
      input = { ...input, setter_name: agentDefault };
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

  const appointmentId = await upsertDemoAppointment(
    service,
    leadId,
    input,
    leadName,
    phone,
  );

  const responses = {
    setter_name: input.setter_name,
    booking_source: input.booking_source,
    booked_at: input.booked_at,
    scheduled_at: input.scheduled_at ?? input.booked_at,
    qualified: input.qualified ?? null,
    notes: input.notes ?? null,
  };

  const ghlApptId = input.ghl_appointment_id?.trim() || null;
  let isResubmit = false;
  let submissionId: string;

  if (ghlApptId) {
    const { data: prior } = await service
      .from('acquisition_form_submissions')
      .select('id')
      .eq('form_type', 'demo_booking_credit')
      .eq('ghl_contact_id', contactId)
      .eq('ghl_appointment_id', ghlApptId)
      .maybeSingle();

    if (prior?.id) {
      isResubmit = true;
      const { data, error } = await service
        .from('acquisition_form_submissions')
        .update({
          lead_id: leadId,
          appointment_id: appointmentId,
          submitted_by: input.setter_name,
          responses,
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
        .insert({
          form_type: 'demo_booking_credit',
          lead_id: leadId,
          appointment_id: appointmentId,
          ghl_contact_id: contactId,
          ghl_appointment_id: ghlApptId,
          submitted_by: input.setter_name,
          responses,
        })
        .select('id')
        .single();
      if (error) throw new Error(error.message);
      submissionId = data.id;
    }
  } else {
    const { data, error } = await service
      .from('acquisition_form_submissions')
      .insert({
        form_type: 'demo_booking_credit',
        lead_id: leadId,
        appointment_id: appointmentId,
        ghl_contact_id: contactId,
        ghl_appointment_id: null,
        submitted_by: input.setter_name,
        responses,
      })
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    submissionId = data.id;
  }

  await service
    .from('acquisition_appointments')
    .update({
      demo_credit_claimed_at: new Date().toISOString(),
      setter_name: input.setter_name,
      booking_source: input.booking_source,
      how_booked: 'setter_booked',
    })
    .eq('id', appointmentId);

  return {
    submission_id: submissionId,
    lead_id: leadId,
    appointment_id: appointmentId,
    is_resubmit: isResubmit,
  };
}

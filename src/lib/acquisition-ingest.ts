import type { SupabaseClient } from '@supabase/supabase-js';
import {
  assertAcquisitionLocation,
  calendarToAppointmentType,
  normalizeApptStatus,
  normalizeOfferType,
  normalizePhone,
  normalizeSheetAppointmentType,
} from './acquisition-config';

type JsonObject = Record<string, unknown>;

function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

function bool(v: unknown): boolean | null {
  if (v === true || v === 'true' || v === 'Y' || v === 'yes' || v === 'Yes') return true;
  if (v === false || v === 'false' || v === 'N' || v === 'no' || v === 'No') return false;
  return null;
}

export async function upsertAcquisitionLead(
  service: SupabaseClient,
  payload: JsonObject,
): Promise<{ id: string } | { error: string }> {
  const locationId = str(payload.location_id) ?? str(payload.locationId) ?? str(payload.ghl_location_id);
  if (locationId && !assertAcquisitionLocation(locationId)) {
    return { error: 'location_id does not match acquisition GHL location' };
  }

  const ghlContactId = str(payload.ghl_contact_id) ?? str(payload.contact_id) ?? str(payload.id);
  const phone = normalizePhone(str(payload.phone) ?? str(payload.phone_number) ?? str(payload.lead_phone));
  const createdAt = str(payload.created_at) ?? str(payload.date_added) ?? new Date().toISOString();

  const row = {
    ghl_contact_id: ghlContactId,
    lead_name: str(payload.lead_name) ?? str(payload.contact_name) ?? str(payload.name),
    email: str(payload.email),
    phone,
    source: str(payload.source) ?? str(payload.lead_source),
    offer_interest: str(payload.offer) ?? str(payload.offer_interest),
    qualified: bool(payload.qualified),
    created_at: createdAt,
    raw: payload,
    updated_at: new Date().toISOString(),
  };

  if (ghlContactId) {
    const { data, error } = await service
      .from('acquisition_leads')
      .upsert(row, { onConflict: 'ghl_contact_id' })
      .select('id')
      .single();
    if (error) return { error: error.message };
    return { id: data.id };
  }

  const { data, error } = await service.from('acquisition_leads').insert(row).select('id').single();
  if (error) return { error: error.message };
  return { id: data.id };
}

export async function upsertAcquisitionAppointment(
  service: SupabaseClient,
  payload: JsonObject,
): Promise<{ id: string } | { error: string }> {
  const locationId = str(payload.location_id) ?? str(payload.locationId);
  if (locationId && !assertAcquisitionLocation(locationId)) {
    return { error: 'location_id does not match acquisition GHL location' };
  }

  const ghlApptId = str(payload.ghl_appointment_id) ?? str(payload.appointment_id) ?? str(payload.external_id);
  const calendarId = str(payload.calendar_id) ?? str(payload.calendarId);
  const apptTypeRaw = str(payload.appointment_type) ?? str(payload.appointmentType);
  const appointmentType = apptTypeRaw
    ? normalizeSheetAppointmentType(apptTypeRaw)
    : calendarToAppointmentType(calendarId);

  let leadId: string | null = str(payload.lead_id);
  const ghlContactId = str(payload.ghl_contact_id) ?? str(payload.contact_id);
  if (!leadId && ghlContactId) {
    const { data: lead } = await service
      .from('acquisition_leads')
      .select('id')
      .eq('ghl_contact_id', ghlContactId)
      .maybeSingle();
    leadId = lead?.id ?? null;
  }

  const statusRaw = str(payload.appt_status) ?? str(payload.status) ?? str(payload.event_type);
  const status = statusRaw?.includes('show') && !statusRaw.includes('no')
    ? 'showed'
    : normalizeApptStatus(statusRaw);

  const row = {
    lead_id: leadId,
    ghl_appointment_id: ghlApptId,
    appointment_type: appointmentType,
    calendar_id: calendarId,
    booking_source: str(payload.booking_source),
    how_booked: str(payload.how_booked) ?? str(payload.how_was_booked),
    booked_at: str(payload.booked_at) ?? str(payload.date_apt_created) ?? str(payload.created_at),
    scheduled_at: str(payload.scheduled_at) ?? str(payload.date_of_appt) ?? str(payload.start_time),
    status,
    qualified: bool(payload.qualified),
    setter_name: str(payload.setter) ?? str(payload.setter_name),
    call_taken_by: str(payload.call_taken_by) ?? str(payload.assigned_to),
    lead_name: str(payload.lead_name),
    phone: normalizePhone(str(payload.phone) ?? str(payload.phone_number)),
    raw: payload,
    updated_at: new Date().toISOString(),
  };

  if (ghlApptId) {
    const { data, error } = await service
      .from('acquisition_appointments')
      .upsert(row, { onConflict: 'ghl_appointment_id' })
      .select('id')
      .single();
    if (error) return { error: error.message };
    return { id: data.id };
  }

  const { data, error } = await service.from('acquisition_appointments').insert(row).select('id').single();
  if (error) return { error: error.message };
  return { id: data.id };
}

export async function upsertAcquisitionOffer(
  service: SupabaseClient,
  payload: JsonObject,
): Promise<{ id: string } | { error: string }> {
  const offeredAt = str(payload.offered_at) ?? str(payload.date) ?? new Date().toISOString();
  const offerType = normalizeOfferType(str(payload.offer) ?? str(payload.offer_type));

  let leadId: string | null = str(payload.lead_id);
  const ghlContactId = str(payload.ghl_contact_id);
  if (!leadId && ghlContactId) {
    const { data: lead } = await service
      .from('acquisition_leads')
      .select('id')
      .eq('ghl_contact_id', ghlContactId)
      .maybeSingle();
    leadId = lead?.id ?? null;
  }

  const closedRaw = str(payload.closed) ?? str(payload.is_closed);
  const isClosed = closedRaw?.toUpperCase() === 'Y' || closedRaw === 'true' || payload.is_closed === true;

  const row = {
    lead_id: leadId,
    appointment_id: str(payload.appointment_id) ?? null,
    offered_at: offeredAt,
    offer_type: offerType,
    is_closed: isClosed,
    cash_collected: typeof payload.cash_collected === 'number'
      ? payload.cash_collected
      : null,
    setter_name: str(payload.setter) ?? str(payload.setter_name),
    offered_by: str(payload.offered_by),
    appointment_type: str(payload.appointment_type),
    raw: payload,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await service.from('acquisition_offers').insert(row).select('id').single();
  if (error) return { error: error.message };
  return { id: data.id };
}

export async function upsertAcquisitionDial(
  service: SupabaseClient,
  payload: JsonObject,
): Promise<{ id: string } | { error: string }> {
  const locationId = str(payload.location_id) ?? str(payload.locationId);
  if (locationId && !assertAcquisitionLocation(locationId)) {
    return { error: 'location_id does not match acquisition GHL location' };
  }

  const ghlContactId = str(payload.ghl_contact_id) ?? str(payload.contact_id);
  let leadId: string | null = null;
  if (ghlContactId) {
    const { data: lead } = await service
      .from('acquisition_leads')
      .select('id')
      .eq('ghl_contact_id', ghlContactId)
      .maybeSingle();
    leadId = lead?.id ?? null;
  }

  const row = {
    ghl_contact_id: ghlContactId,
    lead_id: leadId,
    occurred_at: str(payload.occurred_at) ?? str(payload.dial_at) ?? new Date().toISOString(),
    phone: normalizePhone(str(payload.phone)),
    duration_seconds: typeof payload.duration_seconds === 'number' ? payload.duration_seconds : null,
    outcome: str(payload.outcome) ?? str(payload.call_status),
    agent_name: str(payload.agent_name) ?? str(payload.user_name),
    raw: payload,
  };

  const { data, error } = await service.from('acquisition_dials').insert(row).select('id').single();
  if (error) return { error: error.message };
  return { id: data.id };
}

export async function linkAcquisitionCloseFromClient(
  service: SupabaseClient,
  clientId: string,
  opts?: { formSubmissionId?: string; closedAt?: string },
): Promise<void> {
  const { data: client } = await service
    .from('clients')
    .select('id, name, email, phone, date_signed, source')
    .eq('id', clientId)
    .maybeSingle();
  if (!client) return;

  const phone = normalizePhone(client.phone);
  if (client.email) {
    const { data: byEmail } = await service
      .from('acquisition_leads')
      .select('id')
      .ilike('email', client.email)
      .limit(1)
      .maybeSingle();
    if (byEmail) {
      await finalizeClose(service, byEmail.id, clientId, {
        ...opts,
        closedAt: opts?.closedAt ?? (client.date_signed ? `${client.date_signed}T12:00:00.000Z` : undefined),
      });
      return;
    }
  }
  if (phone) {
    const { data: byPhone } = await service
      .from('acquisition_leads')
      .select('id')
      .eq('phone', phone)
      .limit(1)
      .maybeSingle();
    if (byPhone) {
      await finalizeClose(service, byPhone.id, clientId, {
        ...opts,
        closedAt: opts?.closedAt ?? (client.date_signed ? `${client.date_signed}T12:00:00.000Z` : undefined),
      });
      return;
    }
  }
}

async function finalizeClose(
  service: SupabaseClient,
  leadId: string,
  clientId: string,
  opts?: { formSubmissionId?: string; closedAt?: string },
): Promise<void> {
  const closedAt = opts?.closedAt ?? new Date().toISOString();
  await service
    .from('acquisition_leads')
    .update({
      converted_client_id: clientId,
      close_source: opts?.formSubmissionId ? 'new_client_form' : 'roster',
      updated_at: new Date().toISOString(),
    })
    .eq('id', leadId);

  const { data: pending } = await service
    .from('acquisition_closes')
    .select('id')
    .eq('lead_id', leadId)
    .eq('mapping_status', 'pending_client')
    .is('client_id', null)
    .maybeSingle();

  const row = {
    lead_id: leadId,
    client_id: clientId,
    form_submission_id: opts?.formSubmissionId ?? null,
    closed_at: closedAt,
    close_source: opts?.formSubmissionId ? 'new_client_form' : 'roster',
    mapping_status: 'mapped' as const,
  };

  if (pending?.id) {
    await service.from('acquisition_closes').update(row).eq('id', pending.id);
    return;
  }

  const { data: existing } = await service
    .from('acquisition_closes')
    .select('id')
    .eq('client_id', clientId)
    .maybeSingle();

  if (existing) {
    await service.from('acquisition_closes').update(row).eq('id', existing.id);
  } else {
    await service.from('acquisition_closes').insert(row);
  }
}

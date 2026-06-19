import type { SupabaseClient } from '@supabase/supabase-js';
import {
  assertAcquisitionLocation,
  calendarToAppointmentType,
  normalizeApptStatus,
  normalizeOfferType,
  normalizePhone,
  normalizeSheetAppointmentType,
} from './acquisition-config';
import {
  findCanonicalAcquisitionLead,
  isDialOnlyLeadPayload,
  linkOrphanDialsToLead,
  mergeIncomingLeadFields,
} from './acquisition-lead-resolve';

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

function resolveLeadAttribution(payload: JsonObject): { ad_name: string | null; ad_set: string | null } {
  return {
    ad_name: str(payload.ad_name ?? payload.adName ?? payload.utm_content),
    ad_set: str(
      payload.adset_name ??
        payload.ad_set_name ??
        payload.adSetName ??
        payload.ad_set ??
        payload.utm_medium,
    ),
  };
}

function intField(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).trim());
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function recordingUrlField(v: unknown): string | null {
  if (v == null) return null;
  if (Array.isArray(v)) {
    for (const item of v) {
      const url = recordingUrlField(item);
      if (url) return url;
    }
    return null;
  }
  const s = str(v);
  if (!s) return null;
  if (s.startsWith('http://') || s.startsWith('https://')) return s;
  return null;
}

function dialToCallStatus(outcome: string | null): string {
  const s = (outcome ?? '').toLowerCase();
  if (s.includes('voicemail')) return 'voicemail';
  if (s.includes('no answer') || s.includes('no_answer')) return 'no_answer';
  if (s.includes('busy') || s.includes('failed') || s.includes('cancel')) return 'no_answer';
  return 'connected';
}

export async function upsertAcquisitionLead(
  service: SupabaseClient,
  payload: JsonObject,
): Promise<{ id: string } | { skipped: true; reason: string } | { error: string }> {
  const locationId = str(payload.location_id) ?? str(payload.locationId) ?? str(payload.ghl_location_id);
  if (locationId && !assertAcquisitionLocation(locationId)) {
    return { error: 'location_id does not match acquisition GHL location' };
  }

  const ghlContactId = str(payload.ghl_contact_id) ?? str(payload.contact_id) ?? str(payload.id);
  const phone = normalizePhone(str(payload.phone) ?? str(payload.phone_number) ?? str(payload.lead_phone));
  const createdAt =
    str(payload.occurred_at) ??
    str(payload.created_at) ??
    str(payload.date_added) ??
    new Date().toISOString();
  const attribution = resolveLeadAttribution(payload);

  const row = {
    ghl_contact_id: ghlContactId,
    lead_name: str(payload.lead_name) ?? str(payload.contact_name) ?? str(payload.name),
    email: str(payload.email) ?? str(payload.lead_email),
    phone,
    source: str(payload.source) ?? str(payload.lead_source),
    offer_interest: str(payload.offer) ?? str(payload.offer_interest),
    qualified: bool(payload.qualified),
    ad_name: attribution.ad_name,
    ad_set: attribution.ad_set,
    created_at: createdAt,
    raw: payload,
    updated_at: new Date().toISOString(),
  };

  const canonical = await findCanonicalAcquisitionLead(service, {
    ghl_contact_id: ghlContactId,
    phone,
    email: row.email,
  });

  if (canonical) {
    const patch = mergeIncomingLeadFields(canonical, row);
    const { data, error } = await service
      .from('acquisition_leads')
      .update(patch)
      .eq('id', canonical.id)
      .select('id')
      .single();
    if (error) return { error: error.message };
    await linkOrphanDialsToLead(service, canonical.id, {
      ghl_contact_id: ghlContactId,
      phone,
    });
    return { id: data.id };
  }

  if (isDialOnlyLeadPayload(payload, row)) {
    return { skipped: true, reason: 'dial_only_contact' };
  }

  const { data, error } = await service.from('acquisition_leads').insert(row).select('id').single();
  if (error) return { error: error.message };

  await linkOrphanDialsToLead(service, data.id, {
    ghl_contact_id: ghlContactId,
    phone,
  });
  return { id: data.id };
}

/** Resolve canonical acquisition_leads.id from GHL contact id, phone, or email. */
async function resolveAcquisitionLeadId(
  service: SupabaseClient,
  keys: {
    lead_id?: string | null;
    ghl_contact_id?: string | null;
    phone?: string | null;
    email?: string | null;
  },
  ensureFromPayload?: JsonObject,
): Promise<string | null> {
  const explicitLeadId = str(keys.lead_id);
  if (explicitLeadId) return explicitLeadId;

  const canonical = await findCanonicalAcquisitionLead(service, keys);
  if (canonical?.id) return canonical.id;

  const ghlContactId = str(keys.ghl_contact_id);
  if (ghlContactId && ensureFromPayload) {
    const ensured = await upsertAcquisitionLead(service, {
      ...ensureFromPayload,
      ghl_contact_id: ghlContactId,
    });
    if ('error' in ensured) return null;
    if ('skipped' in ensured) return null;
    return ensured.id;
  }

  return null;
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

  let leadId: string | null = str(payload.lead_id);
  const ghlContactId = str(payload.ghl_contact_id) ?? str(payload.contact_id);
  if (!leadId) {
    leadId = await resolveAcquisitionLeadId(
      service,
      {
        ghl_contact_id: ghlContactId,
        phone: str(payload.lead_phone) ?? str(payload.phone) ?? str(payload.phone_number),
        email: str(payload.lead_email) ?? str(payload.email),
      },
      ghlContactId
        ? {
            ghl_contact_id: ghlContactId,
            lead_name: payload.lead_name,
            phone: payload.lead_phone ?? payload.phone ?? payload.phone_number,
            email: payload.lead_email ?? payload.email,
            created_at: payload.occurred_at ?? payload.booked_at ?? payload.created_at,
          }
        : undefined,
    );
  }

  type ExistingAppt = {
    id: string;
    lead_id: string | null;
    appointment_type: string;
    calendar_id: string | null;
    booked_at: string | null;
    scheduled_at: string | null;
    status: string;
    booking_source: string | null;
    how_booked: string | null;
    qualified: boolean | null;
    setter_name: string | null;
    call_taken_by: string | null;
    lead_name: string | null;
    phone: string | null;
  };

  let existing: ExistingAppt | null = null;
  if (ghlApptId) {
    const { data } = await service
      .from('acquisition_appointments')
      .select(
        'id, lead_id, appointment_type, calendar_id, booked_at, scheduled_at, status, booking_source, how_booked, qualified, setter_name, call_taken_by, lead_name, phone',
      )
      .eq('ghl_appointment_id', ghlApptId)
      .maybeSingle();
    existing = data;
  }

  const appointmentType = apptTypeRaw
    ? normalizeSheetAppointmentType(apptTypeRaw)
    : calendarId
      ? calendarToAppointmentType(calendarId)
      : ((existing?.appointment_type as ReturnType<typeof calendarToAppointmentType>) ?? 'other');

  const statusRaw = str(payload.appt_status) ?? str(payload.status) ?? str(payload.event_type);
  const status = statusRaw
    ? normalizeApptStatus(statusRaw)
    : ((existing?.status as ReturnType<typeof normalizeApptStatus>) ?? 'pending');

  const bookedAt =
    str(payload.occurred_at) ??
    str(payload.booked_at) ??
    str(payload.date_apt_created) ??
    str(payload.created_at) ??
    existing?.booked_at ??
    null;
  const scheduledAt =
    str(payload.scheduled_at) ??
    str(payload.date_of_appt) ??
    str(payload.start_time) ??
    existing?.scheduled_at ??
    null;

  const row = {
    lead_id: leadId ?? existing?.lead_id ?? null,
    ghl_appointment_id: ghlApptId,
    appointment_type: appointmentType,
    calendar_id: calendarId ?? existing?.calendar_id ?? null,
    booking_source: str(payload.booking_source) ?? existing?.booking_source ?? null,
    how_booked:
      str(payload.how_booked) ?? str(payload.how_was_booked) ?? existing?.how_booked ?? null,
    booked_at: bookedAt,
    scheduled_at: scheduledAt,
    status,
    qualified: bool(payload.qualified) ?? existing?.qualified ?? null,
    setter_name:
      str(payload.agent_name) ??
      str(payload.setter) ??
      str(payload.setter_name) ??
      existing?.setter_name ??
      null,
    call_taken_by:
      str(payload.call_taken_by) ?? str(payload.assigned_to) ?? existing?.call_taken_by ?? null,
    lead_name: str(payload.lead_name) ?? existing?.lead_name ?? null,
    phone:
      normalizePhone(str(payload.lead_phone) ?? str(payload.phone) ?? str(payload.phone_number)) ??
      existing?.phone ??
      null,
    raw: payload,
    updated_at: new Date().toISOString(),
  };

  if (ghlApptId) {
    if (existing?.id) {
      const { data, error } = await service
        .from('acquisition_appointments')
        .update(row)
        .eq('id', existing.id)
        .select('id')
        .single();
      if (error) return { error: error.message };
      return { id: data.id };
    }

    const { data, error } = await service
      .from('acquisition_appointments')
      .insert(row)
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
  if (!leadId) {
    leadId = await resolveAcquisitionLeadId(service, {
      ghl_contact_id: str(payload.ghl_contact_id),
      phone: str(payload.phone) ?? str(payload.phone_number),
      email: str(payload.email),
    });
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
  const leadId = await resolveAcquisitionLeadId(
    service,
    {
      lead_id: str(payload.lead_id),
      ghl_contact_id: ghlContactId,
      phone: str(payload.phone),
    },
    ghlContactId
      ? {
          ghl_contact_id: ghlContactId,
          phone: payload.phone,
          created_at: payload.occurred_at ?? payload.dial_at,
        }
      : undefined,
  );

  const occurredAt = str(payload.occurred_at) ?? str(payload.dial_at) ?? new Date().toISOString();
  const outcome = str(payload.outcome) ?? str(payload.call_status);
  const agentName = str(payload.agent_name) ?? str(payload.user_name);
  const durationSeconds =
    intField(payload.duration_seconds) ?? intField(payload.duration) ?? intField(payload.call_duration);
  const recordingUrl =
    recordingUrlField(payload.recording_url) ??
    recordingUrlField(payload.recordingUrl) ??
    recordingUrlField(payload.attachments) ??
    recordingUrlField(payload.message_attachments);

  const row = {
    ghl_contact_id: ghlContactId,
    lead_id: leadId,
    occurred_at: occurredAt,
    phone: normalizePhone(str(payload.phone)),
    duration_seconds: durationSeconds,
    outcome,
    agent_name: agentName,
    recording_url: recordingUrl,
    raw: payload,
  };

  const { data, error } = await service.from('acquisition_dials').insert(row).select('id').single();
  if (error) return { error: error.message };

  if (leadId) {
    await linkOrphanDialsToLead(service, leadId, {
      ghl_contact_id: ghlContactId,
      phone: row.phone,
    });
    const callRow = {
      lead_id: leadId,
      call_type: 'dial' as const,
      called_at: occurredAt,
      status: dialToCallStatus(outcome),
      handled_by: agentName,
      duration_seconds: durationSeconds,
      disposition: outcome,
      recording_url: recordingUrl,
      source: 'dial_ingest' as const,
      details: { outcome, phone: row.phone, acquisition_dial_id: data.id },
      raw: payload,
      updated_at: new Date().toISOString(),
    };

    const { data: existingCall } = await service
      .from('acquisition_calls')
      .select('id')
      .eq('lead_id', leadId)
      .eq('call_type', 'dial')
      .contains('details', { acquisition_dial_id: data.id })
      .maybeSingle();

    if (existingCall?.id) {
      await service
        .from('acquisition_calls')
        .update({
          recording_url: recordingUrl ?? undefined,
          duration_seconds: durationSeconds,
          disposition: outcome,
          handled_by: agentName,
          status: dialToCallStatus(outcome),
          raw: payload,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingCall.id);
    } else {
      await service.from('acquisition_calls').insert(callRow);
    }
  }

  return { id: data.id };
}

export async function linkAcquisitionCloseFromClient(
  service: SupabaseClient,
  clientId: string,
  opts?: { formSubmissionId?: string; closedAt?: string },
): Promise<void> {
  const { data: client } = await service
    .from('clients')
    .select('id, name, email, phone, date_signed, source, ghl_contact_id')
    .eq('id', clientId)
    .maybeSingle();
  if (!client) return;

  const closedAtDefault =
    opts?.closedAt ?? (client.date_signed ? `${client.date_signed}T12:00:00.000Z` : undefined);

  if (client.ghl_contact_id?.trim()) {
    const { data: byGhl } = await service
      .from('acquisition_leads')
      .select('id')
      .eq('ghl_contact_id', client.ghl_contact_id.trim())
      .limit(1)
      .maybeSingle();
    if (byGhl) {
      await finalizeClose(service, byGhl.id, clientId, {
        ...opts,
        closedAt: closedAtDefault,
      });
      return;
    }
  }

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

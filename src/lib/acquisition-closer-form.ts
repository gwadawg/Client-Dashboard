import type { SupabaseClient } from '@supabase/supabase-js';
import { getAppBaseUrl } from '@/lib/app-url';
import { buildCloserFormUrl } from '@/lib/acquisition-form-token';

/** Form types stored for closer call review submissions (current + legacy). */
export const CLOSER_FORM_TYPES = ['closer_form', 'demo_audit'] as const;

type AppointmentRef = {
  id: string;
  ghl_appointment_id: string | null;
  lead_id: string | null;
};

export async function hasCloserFormSubmission(
  service: SupabaseClient,
  appointmentId: string,
  ghlAppointmentId: string | null,
): Promise<boolean> {
  const { data: byAppt } = await service
    .from('acquisition_form_submissions')
    .select('id')
    .in('form_type', [...CLOSER_FORM_TYPES])
    .eq('appointment_id', appointmentId)
    .maybeSingle();
  if (byAppt?.id) return true;

  if (ghlAppointmentId) {
    const { data: byGhl } = await service
      .from('acquisition_form_submissions')
      .select('id')
      .in('form_type', [...CLOSER_FORM_TYPES])
      .eq('ghl_appointment_id', ghlAppointmentId)
      .maybeSingle();
    if (byGhl?.id) return true;
  }

  const { data: call } = await service
    .from('acquisition_calls')
    .select('form_submission_id')
    .eq('appointment_id', appointmentId)
    .not('form_submission_id', 'is', null)
    .maybeSingle();

  return !!call?.form_submission_id;
}

export async function buildCloserFormUrlForLead(
  service: SupabaseClient,
  leadId: string,
  ghlAppointmentId?: string | null,
): Promise<string | null> {
  const { data: lead } = await service
    .from('acquisition_leads')
    .select('ghl_contact_id')
    .eq('id', leadId)
    .maybeSingle();

  const contactId = lead?.ghl_contact_id?.trim();
  if (!contactId) return null;

  return buildCloserFormUrl(getAppBaseUrl(), contactId, ghlAppointmentId ?? null);
}

export async function buildCloserFormUrlForAppointment(
  service: SupabaseClient,
  appointmentId: string,
): Promise<string | null> {
  const { data: appt } = await service
    .from('acquisition_appointments')
    .select('id, ghl_appointment_id, lead_id')
    .eq('id', appointmentId)
    .maybeSingle();

  if (!appt?.lead_id) return null;

  const { data: lead } = await service
    .from('acquisition_leads')
    .select('ghl_contact_id')
    .eq('id', appt.lead_id)
    .maybeSingle();

  const contactId = lead?.ghl_contact_id?.trim();
  if (!contactId) return null;

  return buildCloserFormUrl(getAppBaseUrl(), contactId, appt.ghl_appointment_id);
}

export async function enrichAppointmentsWithCloserFormLinks<
  T extends AppointmentRef & {
    appointment_type?: string | null;
    status?: string | null;
  },
>(
  service: SupabaseClient,
  rows: T[],
): Promise<(T & { closer_form_done: boolean | null; closer_form_url: string | null })[]> {
  const showed = rows.filter(r => r.status === 'showed');
  if (showed.length === 0) {
    return rows.map(r => ({ ...r, closer_form_done: null, closer_form_url: null }));
  }

  const apptIds = showed.map(r => r.id);
  const ghlIds = showed.map(r => r.ghl_appointment_id).filter((id): id is string => !!id);
  const leadIds = [...new Set(showed.map(r => r.lead_id).filter((id): id is string => !!id))];

  const [{ data: subByAppt }, { data: subByGhl }, { data: auditedCalls }, { data: leads }] =
    await Promise.all([
      service
        .from('acquisition_form_submissions')
        .select('appointment_id')
        .in('form_type', [...CLOSER_FORM_TYPES])
        .in('appointment_id', apptIds),
      ghlIds.length > 0
        ? service
            .from('acquisition_form_submissions')
            .select('ghl_appointment_id')
            .in('form_type', [...CLOSER_FORM_TYPES])
            .in('ghl_appointment_id', ghlIds)
        : Promise.resolve({ data: [] as { ghl_appointment_id: string | null }[] }),
      service
        .from('acquisition_calls')
        .select('appointment_id')
        .in('appointment_id', apptIds)
        .not('form_submission_id', 'is', null),
      leadIds.length > 0
        ? service.from('acquisition_leads').select('id, ghl_contact_id').in('id', leadIds)
        : Promise.resolve({ data: [] as { id: string; ghl_contact_id: string | null }[] }),
    ]);

  const completedApptIds = new Set<string>();
  for (const row of subByAppt ?? []) {
    if (row.appointment_id) completedApptIds.add(row.appointment_id);
  }
  for (const row of auditedCalls ?? []) {
    if (row.appointment_id) completedApptIds.add(row.appointment_id);
  }

  const completedGhlIds = new Set(
    (subByGhl ?? []).map(r => r.ghl_appointment_id).filter((id): id is string => !!id),
  );

  const contactByLeadId = new Map(
    (leads ?? []).map(l => [l.id, l.ghl_contact_id?.trim() ?? null]),
  );

  const baseUrl = getAppBaseUrl();

  return rows.map(row => {
    if (row.status !== 'showed') {
      return { ...row, closer_form_done: null, closer_form_url: null };
    }

    const done =
      completedApptIds.has(row.id) ||
      (!!row.ghl_appointment_id && completedGhlIds.has(row.ghl_appointment_id));

    if (done) {
      return { ...row, closer_form_done: true, closer_form_url: null };
    }

    const contactId = row.lead_id ? contactByLeadId.get(row.lead_id) : null;
    const formUrl = contactId
      ? buildCloserFormUrl(baseUrl, contactId, row.ghl_appointment_id)
      : null;

    return { ...row, closer_form_done: false, closer_form_url: formUrl };
  });
}

/** @deprecated Use hasCloserFormSubmission */
export const hasDemoAuditSubmission = hasCloserFormSubmission;

/** @deprecated Use buildCloserFormUrlForAppointment */
export const buildDemoAuditFormUrlForAppointment = buildCloserFormUrlForAppointment;

/** @deprecated Use enrichAppointmentsWithCloserFormLinks */
export const enrichAppointmentsWithDemoAuditLinks = enrichAppointmentsWithCloserFormLinks;

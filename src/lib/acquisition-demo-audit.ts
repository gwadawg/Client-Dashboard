import type { SupabaseClient } from '@supabase/supabase-js';
import { getAppBaseUrl } from '@/lib/app-url';
import { buildDemoAuditFormUrl } from '@/lib/acquisition-form-token';

type AppointmentRef = {
  id: string;
  ghl_appointment_id: string | null;
  lead_id: string | null;
};

export async function hasDemoAuditSubmission(
  service: SupabaseClient,
  appointmentId: string,
  ghlAppointmentId: string | null,
): Promise<boolean> {
  const { data: byAppt } = await service
    .from('acquisition_form_submissions')
    .select('id')
    .eq('form_type', 'demo_audit')
    .eq('appointment_id', appointmentId)
    .maybeSingle();
  if (byAppt?.id) return true;

  if (ghlAppointmentId) {
    const { data: byGhl } = await service
      .from('acquisition_form_submissions')
      .select('id')
      .eq('form_type', 'demo_audit')
      .eq('ghl_appointment_id', ghlAppointmentId)
      .maybeSingle();
    if (byGhl?.id) return true;
  }

  const { data: call } = await service
    .from('acquisition_calls')
    .select('form_submission_id')
    .eq('appointment_id', appointmentId)
    .eq('call_type', 'demo')
    .not('form_submission_id', 'is', null)
    .maybeSingle();

  return !!call?.form_submission_id;
}

export async function buildDemoAuditFormUrlForAppointment(
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

  return buildDemoAuditFormUrl(getAppBaseUrl(), contactId, appt.ghl_appointment_id);
}

export async function enrichAppointmentsWithDemoAuditLinks<
  T extends AppointmentRef & {
    appointment_type?: string | null;
    status?: string | null;
  },
>(service: SupabaseClient, rows: T[]): Promise<(T & { demo_audit_done: boolean | null; demo_audit_form_url: string | null })[]> {
  const demoShowed = rows.filter(
    r => r.appointment_type === 'demo' && r.status === 'showed',
  );
  if (demoShowed.length === 0) {
    return rows.map(r => ({ ...r, demo_audit_done: null, demo_audit_form_url: null }));
  }

  const apptIds = demoShowed.map(r => r.id);
  const ghlIds = demoShowed.map(r => r.ghl_appointment_id).filter((id): id is string => !!id);
  const leadIds = [...new Set(demoShowed.map(r => r.lead_id).filter((id): id is string => !!id))];

  const [{ data: subByAppt }, { data: subByGhl }, { data: auditedCalls }, { data: leads }] =
    await Promise.all([
      service
        .from('acquisition_form_submissions')
        .select('appointment_id')
        .eq('form_type', 'demo_audit')
        .in('appointment_id', apptIds),
      ghlIds.length > 0
        ? service
            .from('acquisition_form_submissions')
            .select('ghl_appointment_id')
            .eq('form_type', 'demo_audit')
            .in('ghl_appointment_id', ghlIds)
        : Promise.resolve({ data: [] as { ghl_appointment_id: string | null }[] }),
      service
        .from('acquisition_calls')
        .select('appointment_id')
        .eq('call_type', 'demo')
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
    if (row.appointment_type !== 'demo' || row.status !== 'showed') {
      return { ...row, demo_audit_done: null, demo_audit_form_url: null };
    }

    const done =
      completedApptIds.has(row.id) ||
      (!!row.ghl_appointment_id && completedGhlIds.has(row.ghl_appointment_id));

    if (done) {
      return { ...row, demo_audit_done: true, demo_audit_form_url: null };
    }

    const contactId = row.lead_id ? contactByLeadId.get(row.lead_id) : null;
    const formUrl = contactId
      ? buildDemoAuditFormUrl(baseUrl, contactId, row.ghl_appointment_id)
      : null;

    return { ...row, demo_audit_done: false, demo_audit_form_url: formUrl };
  });
}

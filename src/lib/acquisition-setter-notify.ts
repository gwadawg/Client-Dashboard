import type { SupabaseClient } from '@supabase/supabase-js';
import { getAppBaseUrl } from '@/lib/app-url';
import { buildIntroReflectionFormUrl } from '@/lib/acquisition-form-token';
import { isSlackConfigured, postToTeamChannel } from '@/lib/slack-notify';

export const SETTER_PENDING_ACTIONS_SLUG = 'setters';
export const SETTER_ALERTS_SLUG = 'setters';

function setterPendingChannelSlug(): string {
  return (
    process.env.ACQUISITION_SETTER_PENDING_SLACK_SLUG?.trim() ||
    SETTER_PENDING_ACTIONS_SLUG
  );
}

function setterAlertsChannelSlug(): string {
  return (
    process.env.ACQUISITION_SETTER_ALERTS_SLACK_SLUG?.trim() ||
    SETTER_ALERTS_SLUG
  );
}

function formatWhen(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

export function formatDemoCreditPendingSlackMessage(payload: {
  lead_name: string | null;
  phone: string | null;
  booked_at: string | null;
  scheduled_at: string | null;
  form_url: string;
}): string {
  const lines = [
    '📋 *Demo booked — booking credit pending*',
    '',
    `Lead: *${payload.lead_name ?? 'Unknown'}*`,
    payload.phone ? `Phone: ${payload.phone}` : null,
    `Booked: ${formatWhen(payload.booked_at)}`,
    payload.scheduled_at ? `Scheduled: ${formatWhen(payload.scheduled_at)}` : null,
    '',
    `<${payload.form_url}|Open booking credit form>`,
    '',
    '_Posted by Mr. Waiz_',
  ];
  return lines.filter((line): line is string => line != null).join('\n');
}

export async function hasDemoBookingCreditSubmission(
  service: SupabaseClient,
  appointmentId: string,
  ghlAppointmentId: string | null,
): Promise<boolean> {
  const { data: appt } = await service
    .from('acquisition_appointments')
    .select('demo_credit_claimed_at, intro_call_id')
    .eq('id', appointmentId)
    .maybeSingle();

  if (appt?.demo_credit_claimed_at || appt?.intro_call_id) return true;

  if (ghlAppointmentId) {
    const { data: byGhl } = await service
      .from('acquisition_form_submissions')
      .select('id')
      .in('form_type', ['demo_booking_credit', 'setter_intro_reflection'])
      .eq('ghl_appointment_id', ghlAppointmentId)
      .maybeSingle();
    if (byGhl?.id) return true;
  }

  const { data: byAppt } = await service
    .from('acquisition_form_submissions')
    .select('id')
    .in('form_type', ['demo_booking_credit', 'setter_intro_reflection'])
    .eq('appointment_id', appointmentId)
    .maybeSingle();

  return !!byAppt?.id;
}

export async function buildDemoCreditFormUrlForAppointment(
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

  return buildIntroReflectionFormUrl(
    getAppBaseUrl(),
    contactId,
    { formContext: 'demo_booked', demoAppointmentId: appt.ghl_appointment_id },
  );
}

export function formatIntroReflectionPendingSlackMessage(payload: {
  lead_name: string | null;
  phone: string | null;
  scheduled_at: string | null;
  setter_name: string | null;
  form_url: string;
}): string {
  const lines = [
    '📞 *Intro showed — reflection form pending*',
    '',
    `Lead: *${payload.lead_name ?? 'Unknown'}*`,
    payload.phone ? `Phone: ${payload.phone}` : null,
    payload.setter_name ? `Setter: ${payload.setter_name}` : null,
    `Scheduled: ${formatWhen(payload.scheduled_at)}`,
    '',
    `<${payload.form_url}|Open intro reflection form>`,
    '',
    '_Posted by Mr. Waiz_',
  ];
  return lines.filter((line): line is string => line != null).join('\n');
}

export async function hasIntroReflectionSubmission(
  service: SupabaseClient,
  appointmentId: string,
  ghlAppointmentId: string | null,
): Promise<boolean> {
  const { data: byAppt } = await service
    .from('acquisition_form_submissions')
    .select('id')
    .eq('form_type', 'setter_intro_reflection')
    .eq('appointment_id', appointmentId)
    .maybeSingle();
  if (byAppt?.id) return true;

  if (ghlAppointmentId) {
    const { data: byGhl } = await service
      .from('acquisition_form_submissions')
      .select('id')
      .eq('form_type', 'setter_intro_reflection')
      .eq('ghl_appointment_id', ghlAppointmentId)
      .maybeSingle();
    if (byGhl?.id) return true;
  }

  const { data: call } = await service
    .from('acquisition_calls')
    .select('form_submission_id')
    .eq('appointment_id', appointmentId)
    .eq('call_type', 'intro')
    .not('form_submission_id', 'is', null)
    .maybeSingle();

  return !!call?.form_submission_id;
}

export async function buildIntroReflectionFormUrlForAppointment(
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

  return buildIntroReflectionFormUrl(getAppBaseUrl(), contactId, {
    formContext: 'intro_showed',
    introAppointmentId: appt.ghl_appointment_id,
  });
}

/** Post to #setter-alerts when an intro showed needs reflection. Never throws. */
export async function notifyIntroReflectionPendingIfNeeded(
  service: SupabaseClient,
  appointmentId: string,
): Promise<void> {
  try {
    const { data: appt, error } = await service
      .from('acquisition_appointments')
      .select(
        'id, appointment_type, ghl_appointment_id, lead_id, lead_name, phone, scheduled_at, status, setter_name, intro_reflection_slack_notified_at',
      )
      .eq('id', appointmentId)
      .maybeSingle();

    if (error || !appt) return;
    if (appt.appointment_type !== 'intro') return;
    if (appt.status !== 'showed') return;
    if (appt.intro_reflection_slack_notified_at) return;

    if (await hasIntroReflectionSubmission(service, appt.id, appt.ghl_appointment_id)) {
      return;
    }

    const formUrl = await buildIntroReflectionFormUrlForAppointment(service, appointmentId);
    if (!formUrl) {
      console.warn(
        '[acquisition-setter-notify] skip intro Slack — missing ghl_contact_id for appointment',
        appointmentId,
      );
      return;
    }

    if (!isSlackConfigured()) {
      console.warn('[acquisition-setter-notify] skip intro Slack — SLACK_BOT_TOKEN not set');
      return;
    }

    const text = formatIntroReflectionPendingSlackMessage({
      lead_name: appt.lead_name,
      phone: appt.phone,
      scheduled_at: appt.scheduled_at,
      setter_name: appt.setter_name,
      form_url: formUrl,
    });

    const result = await postToTeamChannel(service, setterAlertsChannelSlug(), text);
    if (!result?.ok) {
      console.error('[acquisition-setter-notify] intro Slack failed', result?.error);
      return;
    }

    await service
      .from('acquisition_appointments')
      .update({ intro_reflection_slack_notified_at: new Date().toISOString() })
      .eq('id', appointmentId);

    console.info(
      '[acquisition-setter-notify] intro Slack sent to',
      setterAlertsChannelSlug(),
      'for appointment',
      appointmentId,
    );
  } catch (e) {
    console.error('[acquisition-setter-notify] intro unexpected error', e);
  }
}

/** Post to #setter-pending-actions when a demo needs booking credit. Never throws. */
export async function notifyDemoBookingCreditPendingIfNeeded(
  service: SupabaseClient,
  appointmentId: string,
): Promise<void> {
  try {
    const { data: appt, error } = await service
      .from('acquisition_appointments')
      .select(
        'id, appointment_type, ghl_appointment_id, lead_id, lead_name, phone, booked_at, scheduled_at, demo_credit_slack_notified_at',
      )
      .eq('id', appointmentId)
      .maybeSingle();

    if (error || !appt) return;
    if (appt.appointment_type !== 'demo') return;
    if (appt.demo_credit_slack_notified_at) return;

    if (await hasDemoBookingCreditSubmission(service, appt.id, appt.ghl_appointment_id)) {
      return;
    }

    const formUrl = await buildDemoCreditFormUrlForAppointment(service, appointmentId);
    if (!formUrl) {
      console.warn(
        '[acquisition-setter-notify] skip Slack — missing ghl_contact_id for appointment',
        appointmentId,
      );
      return;
    }

    if (!isSlackConfigured()) {
      console.warn('[acquisition-setter-notify] skip Slack — SLACK_BOT_TOKEN not set');
      return;
    }

    const text = formatDemoCreditPendingSlackMessage({
      lead_name: appt.lead_name,
      phone: appt.phone,
      booked_at: appt.booked_at,
      scheduled_at: appt.scheduled_at,
      form_url: formUrl,
    });

    const result = await postToTeamChannel(service, setterPendingChannelSlug(), text);
    if (!result?.ok) {
      console.error('[acquisition-setter-notify] Slack failed', result?.error);
      return;
    }

    await service
      .from('acquisition_appointments')
      .update({ demo_credit_slack_notified_at: new Date().toISOString() })
      .eq('id', appointmentId);

    console.info(
      '[acquisition-setter-notify] Slack sent to',
      setterPendingChannelSlug(),
      'for appointment',
      appointmentId,
    );
  } catch (e) {
    console.error('[acquisition-setter-notify] unexpected error', e);
  }
}

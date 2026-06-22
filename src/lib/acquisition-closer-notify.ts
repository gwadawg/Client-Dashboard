import type { SupabaseClient } from '@supabase/supabase-js';
import {
  buildCloserFormUrlForAppointment,
  hasCloserFormSubmission,
} from '@/lib/acquisition-closer-form';
import { isSlackConfigured, postToTeamChannel } from '@/lib/slack-notify';

export const CEO_ALERTS_SLUG = 'ceo';

function ceoChannelSlug(): string {
  return process.env.ACQUISITION_CEO_SLACK_SLUG?.trim() || CEO_ALERTS_SLUG;
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

export function formatCloserFormPendingSlackMessage(payload: {
  lead_name: string | null;
  phone: string | null;
  scheduled_at: string | null;
  call_taken_by: string | null;
  form_url: string;
}): string {
  const lines = [
    '🎯 *Demo showed — closer form pending*',
    '',
    `Lead: *${payload.lead_name ?? 'Unknown'}*`,
    payload.phone ? `Phone: ${payload.phone}` : null,
    payload.call_taken_by ? `Closer: ${payload.call_taken_by}` : null,
    `Scheduled: ${formatWhen(payload.scheduled_at)}`,
    '',
    `<${payload.form_url}|Open closer form>`,
    '',
    '_Posted by Mr. Waiz_',
  ];
  return lines.filter((line): line is string => line != null).join('\n');
}

/** Post to the CEO channel when a demo showed needs the closer form. Never throws. */
export async function notifyCloserFormPendingIfNeeded(
  service: SupabaseClient,
  appointmentId: string,
): Promise<void> {
  try {
    const { data: appt, error } = await service
      .from('acquisition_appointments')
      .select(
        'id, appointment_type, ghl_appointment_id, lead_id, lead_name, phone, scheduled_at, status, call_taken_by, closer_form_slack_notified_at',
      )
      .eq('id', appointmentId)
      .maybeSingle();

    if (error || !appt) return;
    if (appt.appointment_type !== 'demo') return;
    if (appt.status !== 'showed') return;
    if (appt.closer_form_slack_notified_at) return;

    if (await hasCloserFormSubmission(service, appt.id, appt.ghl_appointment_id)) {
      return;
    }

    const formUrl = await buildCloserFormUrlForAppointment(service, appointmentId);
    if (!formUrl) {
      console.warn(
        '[acquisition-closer-notify] skip Slack — missing ghl_contact_id for appointment',
        appointmentId,
      );
      return;
    }

    if (!isSlackConfigured()) {
      console.warn('[acquisition-closer-notify] skip Slack — SLACK_BOT_TOKEN not set');
      return;
    }

    const text = formatCloserFormPendingSlackMessage({
      lead_name: appt.lead_name,
      phone: appt.phone,
      scheduled_at: appt.scheduled_at,
      call_taken_by: appt.call_taken_by,
      form_url: formUrl,
    });

    const result = await postToTeamChannel(service, ceoChannelSlug(), text);
    if (!result?.ok) {
      console.error('[acquisition-closer-notify] Slack failed', result?.error);
      return;
    }

    await service
      .from('acquisition_appointments')
      .update({ closer_form_slack_notified_at: new Date().toISOString() })
      .eq('id', appointmentId);

    console.info(
      '[acquisition-closer-notify] Slack sent to',
      ceoChannelSlug(),
      'for appointment',
      appointmentId,
    );
  } catch (e) {
    console.error('[acquisition-closer-notify] unexpected error', e);
  }
}

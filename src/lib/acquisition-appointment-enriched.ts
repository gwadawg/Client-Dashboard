/** Row shape from `v_acquisition_appointment_enriched`. */

import { ghlAcquisitionContactUrl } from '@/lib/acquisition-lead-profiles';

export type AcquisitionQueueAction = 'needs_credit' | 'needs_disposition' | null;

export type AcquisitionAppointmentStatus =
  | 'pending'
  | 'showed'
  | 'no_show'
  | 'cancelled'
  | 'team_no_show';

export type EnrichedAcquisitionAppointment = {
  id: string;
  lead_id: string | null;
  ghl_contact_id: string | null;
  ghl_appointment_id: string | null;
  appointment_type: string;
  calendar_id: string | null;
  booking_source: string | null;
  how_booked: string | null;
  booked_at: string | null;
  scheduled_at: string | null;
  status: string;
  qualified: boolean | null;
  setter_name: string | null;
  call_taken_by: string | null;
  lead_name: string | null;
  phone: string | null;
  intro_call_id: string | null;
  demo_credit_claimed_at: string | null;
  demo_credit_slack_notified_at: string | null;
  call_id: string | null;
  call_type: string | null;
  call_called_at: string | null;
  call_status: string | null;
  call_handled_by: string | null;
  call_co_handler: string | null;
  recording_url: string | null;
  transcript_url: string | null;
  disposition: string | null;
  call_notes: string | null;
  call_duration_seconds: number | null;
  call_source: string | null;
  form_submission_id: string | null;
  call_offer_id: string | null;
  credit_granted: boolean;
  queue_action: AcquisitionQueueAction;
  lead_source: string | null;
};

export const ENRICHED_APPOINTMENT_COLUMNS =
  'id, lead_id, ghl_contact_id, ghl_appointment_id, appointment_type, calendar_id, booking_source, how_booked, booked_at, scheduled_at, status, qualified, setter_name, call_taken_by, lead_name, phone, intro_call_id, demo_credit_claimed_at, call_id, call_type, call_called_at, call_status, call_handled_by, call_co_handler, recording_url, transcript_url, disposition, call_notes, call_duration_seconds, call_source, form_submission_id, call_offer_id, credit_granted, queue_action, lead_source';

export const ACQUISITION_STATUS_OPTIONS: { value: AcquisitionAppointmentStatus; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'showed', label: 'Showed' },
  { value: 'no_show', label: 'No Show' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'team_no_show', label: 'Team No Show' },
];

export const ACQUISITION_STATUS_STYLES: Record<
  AcquisitionAppointmentStatus,
  { bg: string; border: string; color: string }
> = {
  pending: { bg: 'rgba(245,158,11,0.14)', border: 'rgba(245,158,11,0.55)', color: '#fbbf24' },
  showed: { bg: 'rgba(34,197,94,0.14)', border: 'rgba(34,197,94,0.5)', color: '#4ade80' },
  no_show: { bg: 'rgba(239,68,68,0.14)', border: 'rgba(239,68,68,0.5)', color: '#f87171' },
  cancelled: { bg: 'rgba(148,163,184,0.14)', border: 'rgba(148,163,184,0.4)', color: '#cbd5e1' },
  team_no_show: { bg: 'rgba(168,85,247,0.14)', border: 'rgba(168,85,247,0.5)', color: '#c084fc' },
};

export function acquisitionAppointmentNeedsDisposition(row: EnrichedAcquisitionAppointment): boolean {
  return row.queue_action === 'needs_disposition';
}

export function acquisitionLeadFileUrl(row: EnrichedAcquisitionAppointment): string | null {
  return ghlAcquisitionContactUrl(row.ghl_contact_id);
}

export function acquisitionSalesCallHref(callId: string, pathname: string): string {
  const params = new URLSearchParams({
    view: 'acquisition',
    tab: 'sales_calls',
    call_id: callId,
  });
  return `${pathname}?${params.toString()}`;
}

export function acquisitionAppointmentHref(appointmentId: string, pathname: string): string {
  const params = new URLSearchParams({
    view: 'acquisition',
    tab: 'appointments',
    appointment_id: appointmentId,
  });
  return `${pathname}?${params.toString()}`;
}

export function acquisitionCallIsDocumented(row: {
  form_submission_id?: string | null;
}): boolean {
  return !!row.form_submission_id;
}

export function appointmentRep(row: EnrichedAcquisitionAppointment): string | null {
  return row.call_handled_by ?? row.setter_name ?? row.call_taken_by ?? null;
}

export function appointmentHasCall(row: EnrichedAcquisitionAppointment): boolean {
  return !!row.call_id;
}

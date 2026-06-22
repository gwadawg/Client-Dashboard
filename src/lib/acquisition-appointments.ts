import type { SupabaseClient } from '@supabase/supabase-js';
import { notifyAcquisitionFormSlackIfNeeded } from '@/lib/acquisition-form-notify';

export type AcquisitionAppointmentStatus =
  | 'pending'
  | 'showed'
  | 'no_show'
  | 'cancelled'
  | 'team_no_show';

const VALID_STATUSES = new Set<AcquisitionAppointmentStatus>([
  'pending',
  'showed',
  'no_show',
  'cancelled',
  'team_no_show',
]);

export function normalizeAcquisitionAppointmentStatus(
  value: unknown,
): AcquisitionAppointmentStatus | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase().replace(/\s+/g, '_');
  if (normalized === 'show') return 'showed';
  if (normalized === 'noshow' || normalized === 'no-show') return 'no_show';
  if (normalized === 'team_noshow' || normalized === 'team-no-show') return 'team_no_show';
  return VALID_STATUSES.has(normalized as AcquisitionAppointmentStatus)
    ? (normalized as AcquisitionAppointmentStatus)
    : null;
}

export async function setAcquisitionAppointmentStatus(
  service: SupabaseClient,
  appointmentId: string,
  status: AcquisitionAppointmentStatus,
): Promise<{ ok: true } | { error: string }> {
  const { data, error } = await service
    .from('acquisition_appointments')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', appointmentId)
    .select('id')
    .maybeSingle();

  if (error) return { error: error.message };
  if (!data) return { error: 'Appointment not found' };

  if (status === 'showed') {
    await notifyAcquisitionFormSlackIfNeeded(service, appointmentId);
  }

  return { ok: true };
}

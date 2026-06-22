import type { SupabaseClient } from '@supabase/supabase-js';
import { notifyCloserFormPendingIfNeeded } from '@/lib/acquisition-closer-notify';
import {
  notifyDemoBookingCreditPendingIfNeeded,
  notifyIntroReflectionPendingIfNeeded,
} from '@/lib/acquisition-setter-notify';

/** Fire acquisition form Slack alerts via Mr. Waiz bot (team channels in Automations). */
export async function notifyAcquisitionFormSlackIfNeeded(
  service: SupabaseClient,
  appointmentId: string,
): Promise<void> {
  await notifyDemoBookingCreditPendingIfNeeded(service, appointmentId);
  await notifyIntroReflectionPendingIfNeeded(service, appointmentId);
  await notifyCloserFormPendingIfNeeded(service, appointmentId);
}

import type { SupabaseClient } from '@supabase/supabase-js';

export type IntroAppointmentCandidate = {
  id: string;
  ghl_appointment_id: string | null;
  scheduled_at: string | null;
  booked_at: string | null;
  setter_name: string | null;
  status: string;
};

/** Find intro appointments that may have sourced a demo booking. */
export async function resolveIntroCandidatesForDemo(
  service: SupabaseClient,
  leadId: string,
  demoBookedAt: string | null,
): Promise<IntroAppointmentCandidate[]> {
  let query = service
    .from('acquisition_appointments')
    .select('id, ghl_appointment_id, scheduled_at, booked_at, setter_name, status')
    .eq('lead_id', leadId)
    .eq('appointment_type', 'intro')
    .eq('status', 'showed')
    .order('scheduled_at', { ascending: false });

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const demoTs = demoBookedAt ? new Date(demoBookedAt).getTime() : null;
  return (data ?? []).filter((row) => {
    if (demoTs == null) return true;
    const introTs = new Date(row.scheduled_at ?? row.booked_at ?? 0).getTime();
    return introTs <= demoTs;
  });
}

export async function findIntroCallForClaim(
  service: SupabaseClient,
  leadId: string,
  demoAppointmentId: string,
): Promise<{ id: string; linked_demo_appointment_id: string | null } | null> {
  const { data } = await service
    .from('acquisition_calls')
    .select('id, linked_demo_appointment_id')
    .eq('lead_id', leadId)
    .eq('call_type', 'intro')
    .is('linked_demo_appointment_id', null)
    .order('called_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data?.id) return null;

  const { data: demoAppt } = await service
    .from('acquisition_appointments')
    .select('intro_call_id')
    .eq('id', demoAppointmentId)
    .maybeSingle();
  if (demoAppt?.intro_call_id) return null;

  return data;
}

export type SetterFormMode = 'intro_full' | 'demo_full' | 'claim_only';

export async function resolveSetterFormMode(
  service: SupabaseClient,
  opts: {
    formContext: string | null;
    leadId: string;
    demoAppointmentId: string | null;
  },
): Promise<SetterFormMode> {
  if (opts.formContext === 'intro_showed') return 'intro_full';
  if (!opts.demoAppointmentId) return 'intro_full';

  const existing = await findIntroCallForClaim(service, opts.leadId, opts.demoAppointmentId);
  if (existing) return 'claim_only';
  return 'demo_full';
}

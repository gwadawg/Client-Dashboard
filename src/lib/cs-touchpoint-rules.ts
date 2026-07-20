import type { SupabaseClient } from '@supabase/supabase-js';
import type { CsCallType } from '@/lib/cs-appointments';
import {
  addDaysIso,
  allowEventTouchpoints,
  cycleKeyBiweekly,
  cycleKeyFromDate,
  cycleKeyOb,
  daysSinceAnchor,
  M1_DURATION_DAYS,
  tenureAnchor,
  upsertCsTouchpoint,
  type CsTouchpointType,
} from '@/lib/cs-touchpoints';

export {
  allowEventTouchpoints,
  daysSinceAnchor,
  isMonth1,
  M1_DURATION_DAYS,
  tenureAnchor,
  tenurePhaseLabel,
} from '@/lib/cs-touchpoints';

const MID_BUILD_DAYS = 3;
const M1_RESET_DAYS = 6;
const M2_INTERVAL_DAYS = 14;

const EVENT_TO_TOUCHPOINT: Partial<Record<string, CsTouchpointType>> = {
  lead: 'first_lead',
  appointment_booked: 'first_booking',
  show: 'first_show',
};

export type ClientTenureLite = {
  id: string;
  launch_date: string | null;
  date_signed: string | null;
  lifecycle_status: string | null;
};

async function loadClient(
  service: SupabaseClient,
  clientId: string,
): Promise<ClientTenureLite | null> {
  const { data, error } = await service
    .from('clients')
    .select('id, launch_date, date_signed, lifecycle_status')
    .eq('id', clientId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as ClientTenureLite | null;
}

function isLaunched(client: ClientTenureLite): boolean {
  if (client.launch_date) return true;
  return client.lifecycle_status === 'active';
}

/**
 * After OB/launch appointment status changes (or is upserted).
 * Safe to call repeatedly — upserts are idempotent.
 */
export async function onCsAppointmentTouchpointHooks(
  service: SupabaseClient,
  opts: {
    appointmentId: string;
    clientId: string | null;
    callType: CsCallType;
    status: string;
    scheduledAt: string;
  },
): Promise<{ created: string[] }> {
  const created: string[] = [];
  if (!opts.clientId) return { created };

  const client = await loadClient(service, opts.clientId);
  if (!client) return { created };

  // Pre-launch when launch appointment is scheduled
  if (opts.callType === 'launch' && opts.status === 'scheduled') {
    const due = addDaysIso(opts.scheduledAt, -1);
    const dueAt = new Date(due) < new Date() ? new Date().toISOString() : due;
    const cycle = cycleKeyFromDate(opts.scheduledAt);
    const r = await upsertCsTouchpoint(service, {
      client_id: opts.clientId,
      touchpoint_type: 'pre_launch',
      cycle_key: cycle,
      due_at: dueAt,
      trigger_source: 'cs_appointment',
      source_ref: opts.appointmentId,
    });
    if (r.created) created.push('pre_launch');
  }

  if (opts.status !== 'completed') return { created };

  if (opts.callType === 'onboarding') {
    const cycle = cycleKeyOb(opts.appointmentId);
    const now = new Date().toISOString();
    const post = await upsertCsTouchpoint(service, {
      client_id: opts.clientId,
      touchpoint_type: 'post_ob',
      cycle_key: cycle,
      due_at: now,
      trigger_source: 'cs_appointment',
      source_ref: opts.appointmentId,
    });
    if (post.created) created.push('post_ob');

    if (!isLaunched(client)) {
      const mid = await upsertCsTouchpoint(service, {
        client_id: opts.clientId,
        touchpoint_type: 'mid_build',
        cycle_key: cycle,
        due_at: addDaysIso(now, MID_BUILD_DAYS),
        trigger_source: 'cs_appointment',
        source_ref: opts.appointmentId,
      });
      if (mid.created) created.push('mid_build');
    }
  }

  if (opts.callType === 'launch') {
    const cycle = cycleKeyFromDate(opts.scheduledAt);
    const now = new Date().toISOString();
    const launch = await upsertCsTouchpoint(service, {
      client_id: opts.clientId,
      touchpoint_type: 'launch_day',
      cycle_key: cycle,
      due_at: now,
      trigger_source: 'cs_appointment',
      source_ref: opts.appointmentId,
    });
    if (launch.created) created.push('launch_day');

    const reset = await upsertCsTouchpoint(service, {
      client_id: opts.clientId,
      touchpoint_type: 'm1_expectation_reset',
      cycle_key: cycle,
      due_at: addDaysIso(now, M1_RESET_DAYS),
      trigger_source: 'cs_appointment',
      source_ref: opts.appointmentId,
    });
    if (reset.created) created.push('m1_expectation_reset');
  }

  return { created };
}

/** First-fire event → touchpoint. Month 1 only once tenure anchor exists past day 29. */
export async function onEventTouchpointHooks(
  service: SupabaseClient,
  opts: {
    clientId: string;
    eventType: string;
    eventId: string;
    occurredAt?: string | null;
  },
): Promise<{ created: string[] }> {
  const created: string[] = [];
  const type = EVENT_TO_TOUCHPOINT[opts.eventType];
  if (!type) return { created };

  const client = await loadClient(service, opts.clientId);
  if (!client) return { created };

  if (!allowEventTouchpoints(client)) return { created };

  const anchor = tenureAnchor(client);
  const cycle = anchor ? cycleKeyFromDate(anchor) : 'prelaunch';

  const r = await upsertCsTouchpoint(service, {
    client_id: opts.clientId,
    touchpoint_type: type,
    cycle_key: cycle,
    due_at: opts.occurredAt ?? new Date().toISOString(),
    trigger_source: 'event',
    source_ref: opts.eventId,
  });
  if (r.created) created.push(type);
  return { created };
}

export type CsTouchpointScheduleResult = {
  unsnoozed: number;
  biweeklyCreated: number;
  clientsScanned: number;
  skippedNoAnchor: number;
};

/**
 * Daily schedule: unsnooze, then ensure Month 2+ biweekly pulses for every
 * active/onboarding client past day 30 from tenure anchor (schedule-only).
 */
export async function runCsTouchpointSchedule(
  service: SupabaseClient,
  now: Date = new Date(),
): Promise<CsTouchpointScheduleResult> {
  const nowIso = now.toISOString();

  // Snoozed → open when due
  const { data: snoozed, error: snoozeErr } = await service
    .from('cs_touchpoints')
    .update({ status: 'open', updated_at: nowIso, snoozed_until: null })
    .eq('status', 'snoozed')
    .lte('snoozed_until', nowIso)
    .select('id');
  if (snoozeErr) throw new Error(snoozeErr.message);
  const unsnoozed = snoozed?.length ?? 0;

  const { data: clients, error: clientErr } = await service
    .from('clients')
    .select('id, launch_date, date_signed, lifecycle_status')
    .in('lifecycle_status', ['active', 'onboarding']);
  if (clientErr) throw new Error(clientErr.message);

  let biweeklyCreated = 0;
  let skippedNoAnchor = 0;
  let clientsScanned = 0;

  for (const c of clients ?? []) {
    clientsScanned += 1;
    const anchor = tenureAnchor(c as ClientTenureLite);
    if (!anchor) {
      skippedNoAnchor += 1;
      continue;
    }

    const days = daysSinceAnchor(anchor, now);
    if (days < M1_DURATION_DAYS) continue;

    // Skip if an open biweekly already exists
    const { data: openPulse } = await service
      .from('cs_touchpoints')
      .select('id')
      .eq('client_id', c.id)
      .eq('touchpoint_type', 'm2_biweekly')
      .in('status', ['open', 'snoozed'])
      .limit(1)
      .maybeSingle();
    if (openPulse?.id) continue;

    // First M2 slot = anchor + 30, then every 14 days
    const launchPlus30 = addDaysIso(`${anchor}T12:00:00.000Z`, M1_DURATION_DAYS);
    let due = new Date(launchPlus30);
    while (due.getTime() + M2_INTERVAL_DAYS * 86_400_000 <= now.getTime()) {
      due = new Date(due.getTime() + M2_INTERVAL_DAYS * 86_400_000);
    }

    // If last completed biweekly was < 14 days ago, wait
    const { data: lastPulse } = await service
      .from('cs_touchpoints')
      .select('completed_at, due_at')
      .eq('client_id', c.id)
      .eq('touchpoint_type', 'm2_biweekly')
      .eq('status', 'done')
      .order('completed_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lastPulse?.completed_at) {
      const nextOk =
        new Date(lastPulse.completed_at).getTime() + M2_INTERVAL_DAYS * 86_400_000;
      if (nextOk > now.getTime()) continue;
    }

    const dueIso = due.toISOString();
    const r = await upsertCsTouchpoint(service, {
      client_id: c.id as string,
      touchpoint_type: 'm2_biweekly',
      cycle_key: cycleKeyBiweekly(dueIso),
      due_at: dueIso < nowIso ? nowIso : dueIso,
      trigger_source: 'schedule',
      source_ref: 'run-schedule',
    });
    if (r.created) biweeklyCreated += 1;
  }

  return { unsnoozed, biweeklyCreated, clientsScanned, skippedNoAnchor };
}

import type { SupabaseClient } from '@supabase/supabase-js';

export const CS_TOUCHPOINT_TYPES = [
  'post_ob',
  'mid_build',
  'pre_launch',
  'launch_day',
  'm1_expectation_reset',
  'first_lead',
  'first_qc',
  'first_booking',
  'first_show',
  'm2_biweekly',
] as const;

export type CsTouchpointType = (typeof CS_TOUCHPOINT_TYPES)[number];

export const CS_TOUCHPOINT_STATUSES = ['open', 'snoozed', 'done', 'skipped'] as const;
export type CsTouchpointStatus = (typeof CS_TOUCHPOINT_STATUSES)[number];

export const CS_TOUCHPOINT_TRIGGER_SOURCES = [
  'cs_appointment',
  'client_call',
  'event',
  'schedule',
  'manual',
] as const;
export type CsTouchpointTriggerSource = (typeof CS_TOUCHPOINT_TRIGGER_SOURCES)[number];

export const CS_TOUCHPOINT_LABELS: Record<CsTouchpointType, string> = {
  post_ob: 'Post-OB',
  mid_build: 'Mid-build',
  pre_launch: 'Pre-launch',
  launch_day: 'Launch day',
  m1_expectation_reset: 'Month 1 expectation reset',
  first_lead: 'First lead',
  first_qc: 'First qualified conversation',
  first_booking: 'First booking',
  first_show: 'First show',
  m2_biweekly: 'Month 2+ biweekly pulse',
};

export type CsTouchpointRow = {
  id: string;
  client_id: string;
  touchpoint_type: CsTouchpointType;
  cycle_key: string;
  status: CsTouchpointStatus;
  due_at: string;
  triggered_at: string;
  completed_at: string | null;
  snoozed_until: string | null;
  trigger_source: CsTouchpointTriggerSource;
  source_ref: string | null;
  playbook_stage: string | null;
  slack_sent: boolean;
  slack_snippet: string | null;
  completion_note: string | null;
  completed_by: string | null;
  created_at: string;
  updated_at: string;
};

export type CsTouchpointWithClient = CsTouchpointRow & {
  clients: { id: string; name: string } | null;
};

export type UpsertTouchpointInput = {
  client_id: string;
  touchpoint_type: CsTouchpointType;
  cycle_key: string;
  due_at: string;
  trigger_source: CsTouchpointTriggerSource;
  source_ref?: string | null;
  playbook_stage?: string | null;
};

/** Insert if missing. Does not reopen done/skipped rows. */
export async function upsertCsTouchpoint(
  service: SupabaseClient,
  input: UpsertTouchpointInput,
): Promise<{ created: boolean; id: string | null }> {
  const now = new Date().toISOString();
  const row = {
    client_id: input.client_id,
    touchpoint_type: input.touchpoint_type,
    cycle_key: input.cycle_key,
    status: 'open' as const,
    due_at: input.due_at,
    triggered_at: now,
    trigger_source: input.trigger_source,
    source_ref: input.source_ref ?? null,
    playbook_stage: input.playbook_stage ?? input.touchpoint_type,
    updated_at: now,
  };

  const { data, error } = await service
    .from('cs_touchpoints')
    .upsert(row, {
      onConflict: 'client_id,touchpoint_type,cycle_key',
      ignoreDuplicates: true,
    })
    .select('id')
    .maybeSingle();

  if (error) {
    // Race or duplicate — treat as already present
    if (error.code === '23505') return { created: false, id: null };
    throw new Error(error.message);
  }

  if (data?.id) return { created: true, id: data.id };

  const { data: existing } = await service
    .from('cs_touchpoints')
    .select('id')
    .eq('client_id', input.client_id)
    .eq('touchpoint_type', input.touchpoint_type)
    .eq('cycle_key', input.cycle_key)
    .maybeSingle();

  return { created: false, id: existing?.id ?? null };
}

export function addDaysIso(base: Date | string, days: number): string {
  const d = typeof base === 'string' ? new Date(base) : new Date(base.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

export function startOfUtcDayIso(d: Date = new Date()): string {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString();
}

export function endOfUtcDayIso(d: Date = new Date()): string {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999),
  ).toISOString();
}

export function cycleKeyFromDate(isoOrDate: string | Date): string {
  const d = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
  return d.toISOString().slice(0, 10);
}

export function cycleKeyOb(appointmentId: string): string {
  return `ob:${appointmentId}`;
}

export function cycleKeyBiweekly(dueAt: string): string {
  return `m2:${cycleKeyFromDate(dueAt)}`;
}

/** Days from tenure anchor before Month 2+ schedule-only pulses begin. */
export const M1_DURATION_DAYS = 30;

/** Prefer launch_date; fall back to date_signed. */
export function tenureAnchor(client: {
  launch_date?: string | null;
  date_signed?: string | null;
}): string | null {
  const launch = client.launch_date?.trim();
  if (launch) return launch.slice(0, 10);
  const signed = client.date_signed?.trim();
  if (signed) return signed.slice(0, 10);
  return null;
}

/** Whole UTC calendar days since anchor date (YYYY-MM-DD or ISO). */
export function daysSinceAnchor(anchor: string, now: Date = new Date()): number {
  const day = anchor.slice(0, 10);
  const anchorUtc = Date.UTC(
    Number(day.slice(0, 4)),
    Number(day.slice(5, 7)) - 1,
    Number(day.slice(8, 10)),
  );
  const nowUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.floor((nowUtc - anchorUtc) / 86_400_000);
}

/** Month 1 = days 0–29 from tenure anchor. */
export function isMonth1(anchor: string, now: Date = new Date()): boolean {
  return daysSinceAnchor(anchor, now) < M1_DURATION_DAYS;
}

/**
 * Whether event-driven first_* touchpoints may be created.
 * - No anchor: allow (pre-launch / early first leads).
 * - With anchor: only during Month 1 (day 0–29).
 */
export function allowEventTouchpoints(
  client: { launch_date?: string | null; date_signed?: string | null },
  now: Date = new Date(),
): boolean {
  const anchor = tenureAnchor(client);
  if (!anchor) return true;
  return isMonth1(anchor, now);
}

export function tenurePhaseLabel(
  client: { launch_date?: string | null; date_signed?: string | null },
  now: Date = new Date(),
): { days: number | null; phase: 'prelaunch' | 'm1' | 'm2' | 'unknown' } {
  const anchor = tenureAnchor(client);
  if (!anchor) return { days: null, phase: 'unknown' };
  const days = daysSinceAnchor(anchor, now);
  if (days < 0) return { days, phase: 'prelaunch' };
  if (days < M1_DURATION_DAYS) return { days, phase: 'm1' };
  return { days, phase: 'm2' };
}

import type { createServiceClient } from './supabase';
import { needsAgentCredit } from './credit-queue-eligibility';
import { liveClientFilter } from './db-helpers';
import {
  CALL_CENTER_TIMEZONE,
  todayYmdInCallCenterTz,
  zonedWallTimeToUtc,
} from './time';

type ServiceClient = ReturnType<typeof createServiceClient>;

/**
 * Cutoff for "past-due / awaiting disposition": start of the local calendar day
 * in the call-center timezone. An appointment is overdue only when its
 * `scheduled_at` is strictly before this instant — same-day bookings (even if
 * the wall-clock slot has already passed) stay out of the pending queue until
 * tomorrow.
 */
export function overdueAppointmentAsOfIso(
  now: Date = new Date(),
  timeZone: string = CALL_CENTER_TIMEZONE,
): string {
  const ymd = todayYmdInCallCenterTz(now, timeZone);
  const [y, m, d] = ymd.split('-').map(Number);
  return zonedWallTimeToUtc(y, m, d, 0, 0, 0, timeZone).toISOString();
}

// Outcome event types recorded for an appointment after it is booked.
export const OUTCOME_EVENT_TYPES = [
  'show',
  'no_show',
  'appointment_cancelled',
  'lo_bailed',
  'appointment_rescheduled',
] as const;
export type OutcomeEventType = (typeof OUTCOME_EVENT_TYPES)[number];

// Statuses the disposition API accepts. `pending` means "no outcome" — any
// existing outcome row is removed so the appointment counts as un-dispositioned.
export type AppointmentStatus = OutcomeEventType | 'pending';

/** How far back a pending prior booking is eligible for auto-reschedule supersession. */
export const RESCHEDULE_SUPERSEDE_LOOKBACK_MS = 120 * 24 * 60 * 60 * 1000;

const BOOKED_SELECT =
  'id, client_id, occurred_at, scheduled_at, calendar_name, calendar_id, lead_name, lead_phone, lead_email, agent_name, ghl_contact_id, stage_booked, external_id';

function textField(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text === '' ? null : text;
}

// Normalize a free-form status string to a known status. Returns null when the
// value doesn't map to anything (caller should reject).
export function normalizeAppointmentStatus(status: unknown): AppointmentStatus | null {
  const normalized = textField(status)?.toLowerCase().replace(/[\s-]+/g, '_');
  switch (normalized) {
    case 'pending':
    case 'none':
    case 'booked':
      return 'pending';
    case 'show':
    case 'showed':
      return 'show';
    case 'no_show':
    case 'noshow':
    case 'no_showed':
      return 'no_show';
    case 'cancelled':
    case 'canceled':
    case 'cancel':
    case 'appointment_cancelled':
      return 'appointment_cancelled';
    case 'bailed':
    case 'lo_bailed':
      return 'lo_bailed';
    case 'rescheduled':
    case 'reschedule':
    case 'appointment_rescheduled':
    case 'superseded':
      return 'appointment_rescheduled';
    default:
      return null;
  }
}

export type SetOutcomeInput = {
  appointment_event_id?: string | null;
  external_id?: string | null;
  ghl_contact_id?: string | null;
  status: AppointmentStatus;
  /** Extra fields merged into the outcome row's `raw` jsonb. */
  meta?: Record<string, unknown>;
};

export type PriorBookingCandidate = {
  id: string;
  external_id: string | null;
  calendar_id: string | null;
  occurred_at: string | null;
  ghl_contact_id?: string | null;
  scheduled_at?: string | null;
};

/**
 * Whether a prior pending booking should be marked rescheduled when a newer
 * booking arrives for the same lead (typically a GHL cancel+rebook with a new
 * appointment id). Same `external_id` is an in-place update, not supersession.
 */
export function shouldAutoSupersedePrior(opts: {
  prior: PriorBookingCandidate;
  nextExternalId: string | null;
  nextCalendarId: string | null;
  nextOccurredAt: string | null;
  priorHasOutcome: boolean;
}): boolean {
  if (opts.priorHasOutcome) return false;
  if (
    opts.prior.external_id &&
    opts.nextExternalId &&
    opts.prior.external_id === opts.nextExternalId
  ) {
    return false;
  }
  // Different calendars → different appointment intents (e.g. AI vs call center).
  if (
    opts.prior.calendar_id &&
    opts.nextCalendarId &&
    opts.prior.calendar_id !== opts.nextCalendarId
  ) {
    return false;
  }
  if (opts.prior.occurred_at && opts.nextOccurredAt) {
    const priorMs = new Date(opts.prior.occurred_at).getTime();
    const nextMs = new Date(opts.nextOccurredAt).getTime();
    if (Number.isFinite(priorMs) && Number.isFinite(nextMs)) {
      if (priorMs > nextMs) return false;
      if (nextMs - priorMs > RESCHEDULE_SUPERSEDE_LOOKBACK_MS) return false;
    }
  }
  return true;
}

export type SetOutcomeResult =
  | { ok: true; status: number; body: Record<string, unknown> }
  | { ok: false; status: number; body: Record<string, unknown> };

// ─────────────────────────────────────────────────────────────────────────────
// Outcome ↔ booking matching
//
// In practice almost no rows carry a GHL appointment id (external_id): bookings
// and their outcomes are linked by the LEAD + APPOINTMENT TIME instead, because
// an outcome row copies the booking's ghl_contact_id and scheduled_at. So the
// reliable key is `ghl_contact_id|scheduled_at`, with external_id and the
// booking's own event id (raw.appointment_event_id) as precise fallbacks.
// ─────────────────────────────────────────────────────────────────────────────

export function rawAppointmentEventId(raw: unknown): string | undefined {
  return (raw as { appointment_event_id?: string } | null)?.appointment_event_id;
}

// Stable "same lead, same appointment time" key. Null when either part is
// missing (those bookings fall back to id-based matching only).
export function contactTimeKey(
  ghlContactId: string | null | undefined,
  scheduledAt: string | null | undefined,
): string | null {
  if (!ghlContactId || !scheduledAt) return null;
  const t = new Date(scheduledAt).getTime();
  if (Number.isNaN(t)) return null;
  return `${ghlContactId}|${t}`;
}

/** Calendar-day key: tolerates scheduled_at ISO/tz serialization drift on the same day. */
export function contactDayKey(
  ghlContactId: string | null | undefined,
  scheduledAt: string | null | undefined,
): string | null {
  if (!ghlContactId?.trim() || !scheduledAt) return null;
  const day = scheduledAt.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  return `${ghlContactId.trim()}|${day}`;
}

/** How close outcome scheduled_at is to a booking's scheduled_at. Higher is better; -1 = reject. */
export function scheduleProximityScore(
  outcomeScheduledAt: string | null | undefined,
  bookingScheduledAt: string | null | undefined,
): number {
  if (!outcomeScheduledAt || !bookingScheduledAt) return 0;
  const o = new Date(outcomeScheduledAt).getTime();
  const b = new Date(bookingScheduledAt).getTime();
  if (Number.isNaN(o) || Number.isNaN(b)) return 0;
  const dayMs = 24 * 60 * 60 * 1000;
  const days = Math.abs(o - b) / dayMs;
  // Show webhooks sometimes land a few days off the original slot; keep a hard bound.
  if (days > 14) return -1;
  const sameDay =
    outcomeScheduledAt.slice(0, 10) === bookingScheduledAt.slice(0, 10) ? 1000 : 0;
  return sameDay + (14 - days);
}

/**
 * Pick a single credited booking to inherit agent from for an uncredited outcome.
 * Refuses when multiple bookings share the best score with different agents.
 */
export function pickCreditedBookingForOutcome<
  T extends { id: string; agent_name: string | null; scheduled_at?: string | null },
>(
  outcome: { scheduled_at?: string | null },
  bookings: T[],
): T | null {
  const credited = bookings.filter(b => {
    const name = textField(b.agent_name);
    return Boolean(name && !needsAgentCredit(name));
  });
  if (credited.length === 0) return null;
  if (credited.length === 1) {
    const only = credited[0];
    if (
      scheduleProximityScore(outcome.scheduled_at, only.scheduled_at) < 0 &&
      outcome.scheduled_at &&
      only.scheduled_at
    ) {
      return null;
    }
    return only;
  }

  const scored = credited
    .map(b => ({ b, score: scheduleProximityScore(outcome.scheduled_at, b.scheduled_at) }))
    .filter(row => row.score >= 0)
    .sort((a, b) => b.score - a.score || a.b.id.localeCompare(b.b.id));

  if (scored.length === 0) return null;
  const top = scored[0];
  const ambiguous = scored.some(
    row =>
      row.score === top.score &&
      textField(row.b.agent_name) !== textField(top.b.agent_name),
  );
  if (ambiguous) return null;
  return top.b;
}

export type OutcomeRecord = {
  id?: string | null;
  event_type?: string | null;
  external_id?: string | null;
  raw?: unknown;
  ghl_contact_id?: string | null;
  scheduled_at?: string | null;
};

export type BookingKey = {
  id: string;
  external_id?: string | null;
  ghl_contact_id?: string | null;
  scheduled_at?: string | null;
};

export type OutcomeIndex = {
  byExternal: Map<string, OutcomeRecord>;
  byApptEventId: Map<string, OutcomeRecord>;
  byContactTime: Map<string, OutcomeRecord>;
  byContactDay: Map<string, OutcomeRecord>;
};

export function buildOutcomeIndex(outcomes: OutcomeRecord[]): OutcomeIndex {
  const byExternal = new Map<string, OutcomeRecord>();
  const byApptEventId = new Map<string, OutcomeRecord>();
  const byContactTime = new Map<string, OutcomeRecord>();
  const byContactDay = new Map<string, OutcomeRecord>();
  for (const o of outcomes) {
    if (o.external_id) byExternal.set(o.external_id, o);
    const linked = rawAppointmentEventId(o.raw);
    if (linked) byApptEventId.set(linked, o);
    const key = contactTimeKey(o.ghl_contact_id, o.scheduled_at);
    if (key) byContactTime.set(key, o);
    const dayKey = contactDayKey(o.ghl_contact_id, o.scheduled_at);
    // Prefer first / keep exact-time winner if already stored via exact iso later
    if (dayKey && !byContactDay.has(dayKey)) byContactDay.set(dayKey, o);
  }
  return { byExternal, byApptEventId, byContactTime, byContactDay };
}

// Find the outcome that resolves a booking, or undefined when it is still
// un-dispositioned. Precise id matches win; otherwise lead + appointment time.
export function matchOutcome(booking: BookingKey, index: OutcomeIndex): OutcomeRecord | undefined {
  if (booking.external_id) {
    const m = index.byExternal.get(booking.external_id);
    if (m) return m;
  }
  const byId = index.byApptEventId.get(booking.id);
  if (byId) return byId;
  const key = contactTimeKey(booking.ghl_contact_id, booking.scheduled_at);
  if (key) {
    const m = index.byContactTime.get(key);
    if (m) return m;
  }
  const dayKey = contactDayKey(booking.ghl_contact_id, booking.scheduled_at);
  if (dayKey) {
    const m = index.byContactDay.get(dayKey);
    if (m) return m;
  }
  return undefined;
}

export type BookingAgentSource = {
  id: string;
  agent_name: string | null;
  external_id?: string | null;
  ghl_contact_id?: string | null;
  scheduled_at?: string | null;
  client_id?: string | null;
  lead_phone?: string | null;
};

export type OutcomeAgentSource = {
  id?: string | null;
  agent_name?: string | null;
  external_id?: string | null;
  ghl_contact_id?: string | null;
  scheduled_at?: string | null;
  client_id?: string | null;
  lead_phone?: string | null;
  raw?: unknown;
};

/** True when a credited booking agent should be copied onto an outcome row. */
export function shouldSyncOutcomeAgent(
  bookingAgent: string | null | undefined,
  outcomeAgent: string | null | undefined,
): boolean {
  const booked = textField(bookingAgent);
  if (!booked || needsAgentCredit(booked)) return false;
  return needsAgentCredit(outcomeAgent);
}

type LinkedOutcomeRow = {
  id: string;
  agent_name: string | null;
  scheduled_at?: string | null;
  ghl_contact_id?: string | null;
  external_id?: string | null;
  lead_phone?: string | null;
  client_id?: string | null;
};

function normalizePhoneDigits(phone: string | null | undefined): string {
  const digits = (phone ?? '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1);
  if (digits.length >= 10) return digits.slice(-10);
  return digits;
}

async function findLinkedOutcomes(
  service: ServiceClient,
  booking: BookingAgentSource,
): Promise<LinkedOutcomeRow[]> {
  const outcomes: LinkedOutcomeRow[] = [];
  const seen = new Set<string>();

  const addRows = (rows: LinkedOutcomeRow[] | null | undefined) => {
    for (const row of rows ?? []) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      outcomes.push(row);
    }
  };

  {
    const { data, error } = await service
      .from('events')
      .select('id, agent_name, scheduled_at, ghl_contact_id, external_id')
      .in('event_type', [...OUTCOME_EVENT_TYPES])
      .filter('raw->>appointment_event_id', 'eq', booking.id);
    if (error) throw new Error(error.message);
    addRows(data as LinkedOutcomeRow[] | null);
  }

  if (booking.external_id) {
    const { data, error } = await service
      .from('events')
      .select('id, agent_name, scheduled_at, ghl_contact_id, external_id')
      .in('event_type', [...OUTCOME_EVENT_TYPES])
      .eq('external_id', booking.external_id);
    if (error) throw new Error(error.message);
    addRows(data as LinkedOutcomeRow[] | null);
  }

  if (booking.ghl_contact_id && booking.scheduled_at) {
    const { data, error } = await service
      .from('events')
      .select('id, agent_name, scheduled_at, ghl_contact_id, external_id')
      .in('event_type', [...OUTCOME_EVENT_TYPES])
      .eq('ghl_contact_id', booking.ghl_contact_id)
      .eq('scheduled_at', booking.scheduled_at);
    if (error) throw new Error(error.message);
    addRows(data as LinkedOutcomeRow[] | null);
  }

  // Same contact, nearby slot — covers webhook scheduled_at drift.
  if (booking.ghl_contact_id) {
    const { data, error } = await service
      .from('events')
      .select('id, agent_name, scheduled_at, ghl_contact_id, external_id')
      .in('event_type', [...OUTCOME_EVENT_TYPES])
      .eq('ghl_contact_id', booking.ghl_contact_id)
      .order('occurred_at', { ascending: false })
      .limit(25);
    if (error) throw new Error(error.message);
    const nearby = ((data as LinkedOutcomeRow[] | null) ?? []).filter(
      row => scheduleProximityScore(row.scheduled_at, booking.scheduled_at) >= 0,
    );
    addRows(nearby);
  }

  const phone = normalizePhoneDigits(booking.lead_phone);
  if (phone.length >= 10 && booking.client_id) {
    const { data, error } = await service
      .from('events')
      .select('id, agent_name, scheduled_at, ghl_contact_id, external_id, lead_phone, client_id')
      .in('event_type', [...OUTCOME_EVENT_TYPES])
      .eq('client_id', booking.client_id)
      .order('occurred_at', { ascending: false })
      .limit(40);
    if (error) throw new Error(error.message);
    const phoneMatches = ((data as LinkedOutcomeRow[] | null) ?? []).filter(
      row =>
        normalizePhoneDigits(row.lead_phone) === phone &&
        scheduleProximityScore(row.scheduled_at, booking.scheduled_at) >= 0,
    );
    addRows(phoneMatches);
  }

  return outcomes;
}

/** Copy a credited booking agent onto linked show/no-show/outcome rows that are still null. */
export async function propagateBookingAgentToOutcomes(
  service: ServiceClient,
  booking: BookingAgentSource,
  opts?: { dryRun?: boolean },
): Promise<{ updated: number; outcome_ids: string[] }> {
  const agentName = textField(booking.agent_name);
  if (!agentName || needsAgentCredit(agentName)) {
    return { updated: 0, outcome_ids: [] };
  }

  const outcomes = await findLinkedOutcomes(service, booking);
  const outcome_ids: string[] = [];

  for (const outcome of outcomes) {
    if (!shouldSyncOutcomeAgent(agentName, outcome.agent_name)) continue;
    if (opts?.dryRun) {
      outcome_ids.push(outcome.id);
      continue;
    }
    const { data, error } = await service
      .from('events')
      .update({ agent_name: agentName })
      .eq('id', outcome.id)
      .select('id')
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (data) outcome_ids.push(data.id);
  }

  return { updated: outcome_ids.length, outcome_ids };
}

const BOOKING_AGENT_LOOKUP_SELECT =
  'id, client_id, agent_name, external_id, ghl_contact_id, scheduled_at, lead_phone';

/**
 * Find the credited booking that should own this uncredited outcome.
 * Used on webhook ingest and payroll hydration.
 */
export async function findCreditedBookingForOutcome(
  service: ServiceClient,
  outcome: OutcomeAgentSource,
): Promise<BookingAgentSource | null> {
  if (!needsAgentCredit(outcome.agent_name)) return null;

  const linkedBookingId = rawAppointmentEventId(outcome.raw);
  if (linkedBookingId) {
    const { data, error } = await service
      .from('events')
      .select(BOOKING_AGENT_LOOKUP_SELECT)
      .eq('id', linkedBookingId)
      .eq('event_type', 'appointment_booked')
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (data && !needsAgentCredit(data.agent_name)) {
      return data as BookingAgentSource;
    }
  }

  if (outcome.external_id) {
    const { data, error } = await service
      .from('events')
      .select(BOOKING_AGENT_LOOKUP_SELECT)
      .eq('event_type', 'appointment_booked')
      .eq('external_id', outcome.external_id)
      .order('occurred_at', { ascending: false })
      .limit(5);
    if (error) throw new Error(error.message);
    const picked = pickCreditedBookingForOutcome(outcome, (data ?? []) as BookingAgentSource[]);
    if (picked) return picked;
  }

  if (outcome.ghl_contact_id) {
    const { data, error } = await service
      .from('events')
      .select(BOOKING_AGENT_LOOKUP_SELECT)
      .eq('event_type', 'appointment_booked')
      .eq('ghl_contact_id', outcome.ghl_contact_id)
      .order('occurred_at', { ascending: false })
      .limit(15);
    if (error) throw new Error(error.message);
    const picked = pickCreditedBookingForOutcome(outcome, (data ?? []) as BookingAgentSource[]);
    if (picked) return picked;
  }

  const phone = normalizePhoneDigits(outcome.lead_phone);
  if (phone.length >= 10) {
    let q = service
      .from('events')
      .select(BOOKING_AGENT_LOOKUP_SELECT)
      .eq('event_type', 'appointment_booked')
      .order('occurred_at', { ascending: false })
      .limit(40);
    if (outcome.client_id) q = q.eq('client_id', outcome.client_id);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const phoneMatches = ((data ?? []) as BookingAgentSource[]).filter(
      row => normalizePhoneDigits(row.lead_phone) === phone,
    );
    const picked = pickCreditedBookingForOutcome(outcome, phoneMatches);
    if (picked) return picked;
  }

  return null;
}

/**
 * If outcome lacks agent_name, resolve from linked booking.
 * When outcome has an id and persist=true, write agent_name back to the row.
 */
export async function resolveOutcomeAgentFromBooking(
  service: ServiceClient,
  outcome: OutcomeAgentSource,
  opts?: { persist?: boolean },
): Promise<{ agent_name: string | null; booking_id: string | null; persisted: boolean }> {
  if (!needsAgentCredit(outcome.agent_name)) {
    return {
      agent_name: textField(outcome.agent_name),
      booking_id: null,
      persisted: false,
    };
  }

  const booking = await findCreditedBookingForOutcome(service, outcome);
  const agentName = textField(booking?.agent_name);
  if (!agentName || !booking) {
    return { agent_name: null, booking_id: null, persisted: false };
  }

  let persisted = false;
  if (opts?.persist && outcome.id) {
    const { error } = await service
      .from('events')
      .update({ agent_name: agentName })
      .eq('id', outcome.id);
    if (error) throw new Error(error.message);
    persisted = true;
  }

  return { agent_name: agentName, booking_id: booking.id, persisted };
}

/**
 * Hydrate uncredited outcome rows (typically shows) with booking agents.
 * Mutates the in-memory list; optionally persists so KPIs and export stay consistent.
 */
export async function hydrateOutcomeAgentsFromBookings<
  T extends OutcomeAgentSource & { id: string; agent_name: string | null },
>(
  service: ServiceClient,
  outcomes: T[],
  opts?: { persist?: boolean },
): Promise<{ rows: T[]; filled: number; persisted: number }> {
  const rows = [...outcomes];
  const uncreditedIdx: number[] = [];
  for (let i = 0; i < rows.length; i++) {
    if (needsAgentCredit(rows[i].agent_name)) uncreditedIdx.push(i);
  }
  if (uncreditedIdx.length === 0) {
    return { rows, filled: 0, persisted: 0 };
  }

  const contactIds = [
    ...new Set(
      uncreditedIdx
        .map(i => rows[i].ghl_contact_id?.trim())
        .filter((v): v is string => Boolean(v)),
    ),
  ];
  const externalIds = [
    ...new Set(
      uncreditedIdx
        .map(i => rows[i].external_id?.trim())
        .filter((v): v is string => Boolean(v)),
    ),
  ];

  const bookingsByContact = new Map<string, BookingAgentSource[]>();
  const bookingsByExternal = new Map<string, BookingAgentSource[]>();
  const bookingsById = new Map<string, BookingAgentSource>();

  const pushBooking = (b: BookingAgentSource) => {
    bookingsById.set(b.id, b);
    if (b.external_id) {
      const list = bookingsByExternal.get(b.external_id) ?? [];
      list.push(b);
      bookingsByExternal.set(b.external_id, list);
    }
    if (b.ghl_contact_id) {
      const list = bookingsByContact.get(b.ghl_contact_id) ?? [];
      list.push(b);
      bookingsByContact.set(b.ghl_contact_id, list);
    }
  };

  for (let i = 0; i < contactIds.length; i += 100) {
    const chunk = contactIds.slice(i, i + 100);
    const { data, error } = await service
      .from('events')
      .select(BOOKING_AGENT_LOOKUP_SELECT)
      .eq('event_type', 'appointment_booked')
      .in('ghl_contact_id', chunk);
    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as BookingAgentSource[]) pushBooking(row);
  }

  for (let i = 0; i < externalIds.length; i += 100) {
    const chunk = externalIds.slice(i, i + 100);
    const { data, error } = await service
      .from('events')
      .select(BOOKING_AGENT_LOOKUP_SELECT)
      .eq('event_type', 'appointment_booked')
      .in('external_id', chunk);
    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as BookingAgentSource[]) pushBooking(row);
  }

  // Linked appointment_event_id on raw
  const linkedIds = [
    ...new Set(
      uncreditedIdx
        .map(i => rawAppointmentEventId(rows[i].raw))
        .filter((v): v is string => Boolean(v)),
    ),
  ].filter(id => !bookingsById.has(id));
  for (let i = 0; i < linkedIds.length; i += 100) {
    const chunk = linkedIds.slice(i, i + 100);
    const { data, error } = await service
      .from('events')
      .select(BOOKING_AGENT_LOOKUP_SELECT)
      .eq('event_type', 'appointment_booked')
      .in('id', chunk);
    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as BookingAgentSource[]) pushBooking(row);
  }

  let filled = 0;
  let persisted = 0;
  const toPersist: { id: string; agent_name: string }[] = [];

  for (const i of uncreditedIdx) {
    const row = rows[i];
    let booking: BookingAgentSource | null = null;

    const linkedId = rawAppointmentEventId(row.raw);
    if (linkedId && bookingsById.has(linkedId)) {
      const b = bookingsById.get(linkedId)!;
      if (!needsAgentCredit(b.agent_name)) booking = b;
    }

    if (!booking && row.external_id) {
      booking = pickCreditedBookingForOutcome(
        row,
        bookingsByExternal.get(row.external_id) ?? [],
      );
    }

    if (!booking && row.ghl_contact_id) {
      booking = pickCreditedBookingForOutcome(
        row,
        bookingsByContact.get(row.ghl_contact_id) ?? [],
      );
    }

    // Phone-only rows: resolve once via shared finder (uncommon after contact batch).
    if (!booking && normalizePhoneDigits(row.lead_phone).length >= 10) {
      booking = await findCreditedBookingForOutcome(service, row);
    }

    const agentName = textField(booking?.agent_name);
    if (!agentName || !booking) continue;

    rows[i] = { ...row, agent_name: agentName };
    filled++;
    if (opts?.persist) toPersist.push({ id: row.id, agent_name: agentName });
  }

  if (opts?.persist && toPersist.length > 0) {
    for (const item of toPersist) {
      const { data, error } = await service
        .from('events')
        .update({ agent_name: item.agent_name })
        .eq('id', item.id)
        .or('agent_name.is.null,agent_name.eq.,agent_name.eq.#N/A')
        .select('id')
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (data) persisted++;
    }
  }

  return { rows, filled, persisted };
}

function findBookedByExternalId(service: ServiceClient, external_id: string) {
  return service
    .from('events')
    .select(BOOKED_SELECT)
    .eq('external_id', external_id)
    .eq('event_type', 'appointment_booked')
    .order('occurred_at', { ascending: false })
    .limit(1)
    .maybeSingle();
}

// Create / update / delete the single outcome event tied to a booked appointment.
//
// Design: the original `appointment_booked` row is the source of truth for the
// appointment and is NEVER modified (except to backfill a missing external_id) —
// it stays counted in absolute "Appointments Booked". The outcome is recorded
// as a SEPARATE event row (show / no_show / appointment_cancelled / lo_bailed /
// appointment_rescheduled), which is how the rest of the dashboard already
// counts these. Rescheduled slots are excluded from "appts to take place".
//
// Matching: prefer the booking's own event id (precise, used by the in-app UI),
// then `external_id` (GHL appointment id), then the most recent booked
// appointment for `ghl_contact_id` (covers historical imports without an id).
//
// Guarantees:
//   1. The outcome row inherits the booking's `occurred_at` (and client/agent/
//      lead), so a show reported late lands in the period the appointment was
//      BOOKED, not whenever it was recorded.
//   2. At most ONE outcome row per appointment. A later/corrected status updates
//      that single row in place, so no double-counting.
//   3. `status: 'pending'` removes any existing outcome row, reverting the
//      appointment to un-dispositioned.
export async function setAppointmentOutcome(
  service: ServiceClient,
  input: SetOutcomeInput,
): Promise<SetOutcomeResult> {
  const appointment_event_id = textField(input.appointment_event_id);
  const external_id = textField(input.external_id);
  const ghl_contact_id = textField(input.ghl_contact_id);
  const status = input.status;

  if (!appointment_event_id && !external_id && !ghl_contact_id) {
    return {
      ok: false,
      status: 400,
      body: { error: 'appointment_event_id, external_id, or ghl_contact_id is required' },
    };
  }

  // 1) Resolve the booked appointment. Prefer the exact booking event id, then
  //    the appointment id, then the most recent booking for this contact.
  let bookedRow: Awaited<ReturnType<typeof findBookedByExternalId>>['data'] = null;
  let matchedBy: 'appointment_event_id' | 'external_id' | 'ghl_contact_id' | null = null;

  if (appointment_event_id) {
    const { data, error } = await service
      .from('events')
      .select(BOOKED_SELECT)
      .eq('id', appointment_event_id)
      .eq('event_type', 'appointment_booked')
      .maybeSingle();
    if (error) return { ok: false, status: 500, body: { error: error.message } };
    if (data) {
      bookedRow = data;
      matchedBy = 'appointment_event_id';
    }
  }

  if (!bookedRow && external_id) {
    const { data, error } = await findBookedByExternalId(service, external_id);
    if (error) return { ok: false, status: 500, body: { error: error.message } };
    if (data) {
      bookedRow = data;
      matchedBy = 'external_id';
    }
  }

  if (!bookedRow && ghl_contact_id) {
    const { data, error } = await service
      .from('events')
      .select(BOOKED_SELECT)
      .eq('ghl_contact_id', ghl_contact_id)
      .eq('event_type', 'appointment_booked')
      .order('occurred_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return { ok: false, status: 500, body: { error: error.message } };
    if (data) {
      bookedRow = data;
      matchedBy = 'ghl_contact_id';
    }
  }

  if (!bookedRow) {
    return {
      ok: false,
      status: 404,
      body: {
        error: 'No booked appointment found',
        searched: { appointment_event_id, external_id, ghl_contact_id },
      },
    };
  }

  // The appointment id we will key the outcome on: whatever the booking already
  // has, otherwise the id from this request.
  const outcomeExternalId = bookedRow.external_id ?? external_id;

  // Backfill the booking with the appointment id when it was missing, so future
  // status updates match precisely by id instead of falling back to the contact.
  if (!bookedRow.external_id && external_id) {
    await service.from('events').update({ external_id }).eq('id', bookedRow.id);
  }

  // 2) Find an existing outcome for THIS appointment so we update/delete rather
  //    than duplicate. Try precise id keys first (appointment id / booking event
  //    id); fall back to lead + appointment time, since most historical outcomes
  //    are only linked that way and we must not create a second outcome row.
  let existingOutcome: { id: string; event_type: string; agent_name: string | null } | null = null;

  {
    let q = service
      .from('events')
      .select('id, event_type, agent_name')
      .in('event_type', [...OUTCOME_EVENT_TYPES])
      .order('occurred_at', { ascending: false })
      .limit(1);
    q = outcomeExternalId
      ? q.eq('external_id', outcomeExternalId)
      : q.filter('raw->>appointment_event_id', 'eq', bookedRow.id);
    const { data, error } = await q.maybeSingle();
    if (error) return { ok: false, status: 500, body: { error: error.message } };
    existingOutcome = data;
  }

  if (!existingOutcome && bookedRow.ghl_contact_id && bookedRow.scheduled_at) {
    const { data, error } = await service
      .from('events')
      .select('id, event_type, agent_name')
      .in('event_type', [...OUTCOME_EVENT_TYPES])
      .eq('ghl_contact_id', bookedRow.ghl_contact_id)
      .eq('scheduled_at', bookedRow.scheduled_at)
      .order('occurred_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return { ok: false, status: 500, body: { error: error.message } };
    existingOutcome = data;
  }

  // 3a) Pending: remove any existing outcome row (revert to un-dispositioned).
  if (status === 'pending') {
    if (!existingOutcome) {
      return {
        ok: true,
        status: 200,
        body: { success: true, updated: false, matched_by: matchedBy, status: 'pending' },
      };
    }
    const { error } = await service.from('events').delete().eq('id', existingOutcome.id);
    if (error) return { ok: false, status: 500, body: { error: error.message } };
    return {
      ok: true,
      status: 200,
      body: {
        success: true,
        updated: true,
        deleted: true,
        matched_by: matchedBy,
        previous_event_type: existingOutcome.event_type,
        status: 'pending',
      },
    };
  }

  const event_type: OutcomeEventType = status;

  // 3b) Existing outcome: no-op when unchanged, otherwise correct it in place.
  if (existingOutcome) {
    if (existingOutcome.event_type === event_type) {
      const agentSynced = shouldSyncOutcomeAgent(bookedRow.agent_name, existingOutcome.agent_name);
      if (agentSynced) {
        const { error: syncError } = await service
          .from('events')
          .update({ agent_name: bookedRow.agent_name })
          .eq('id', existingOutcome.id);
        if (syncError) return { ok: false, status: 500, body: { error: syncError.message } };
      }
      return {
        ok: true,
        status: 200,
        body: {
          success: true,
          updated: agentSynced,
          agent_synced: agentSynced,
          matched_by: matchedBy,
          outcome_id: existingOutcome.id,
          status: event_type,
          event_type,
        },
      };
    }
    const updates: { event_type: OutcomeEventType; agent_name?: string | null } = { event_type };
    if (shouldSyncOutcomeAgent(bookedRow.agent_name, existingOutcome.agent_name)) {
      updates.agent_name = bookedRow.agent_name;
    }
    const { data, error } = await service
      .from('events')
      .update(updates)
      .eq('id', existingOutcome.id)
      .select('id, event_type, agent_name')
      .single();
    if (error) return { ok: false, status: 500, body: { error: error.message } };

    return {
      ok: true,
      status: 200,
      body: {
        success: true,
        updated: true,
        corrected: true,
        agent_synced: 'agent_name' in updates,
        matched_by: matchedBy,
        outcome_id: data.id,
        previous_event_type: existingOutcome.event_type,
        status: data.event_type,
        event_type: data.event_type,
      },
    };
  }

  // 3c) First outcome for this appointment: insert a new row, dated to the booking.
  const { data, error } = await service
    .from('events')
    .insert({
      client_id: bookedRow.client_id,
      event_type,
      occurred_at: bookedRow.occurred_at,
      external_id: outcomeExternalId,
      scheduled_at: bookedRow.scheduled_at,
      calendar_name: bookedRow.calendar_name,
      calendar_id: bookedRow.calendar_id,
      lead_name: bookedRow.lead_name,
      lead_phone: bookedRow.lead_phone,
      lead_email: bookedRow.lead_email,
      agent_name: bookedRow.agent_name,
      ghl_contact_id: bookedRow.ghl_contact_id,
      stage_booked: bookedRow.stage_booked,
      raw: {
        event_type,
        external_id: outcomeExternalId,
        source: 'appointment-status',
        matched_by: matchedBy,
        appointment_event_id: bookedRow.id,
        recorded_at: new Date().toISOString(),
        ...(input.meta ?? {}),
      },
    })
    .select('id, event_type')
    .single();

  if (error) return { ok: false, status: 500, body: { error: error.message } };

  return {
    ok: true,
    status: 200,
    body: {
      success: true,
      created: true,
      matched_by: matchedBy,
      outcome_id: data.id,
      status: data.event_type,
      event_type: data.event_type,
      appointment_event_id: bookedRow.id,
    },
  };
}

// Fetch every row matching `build`, paging past PostgREST's per-request cap.
async function fetchAllRows<R>(
  build: (from: number, to: number) => PromiseLike<{ data: R[] | null; error: { message: string } | null }>,
  hardCap = 20000,
): Promise<R[]> {
  const chunk = 1000;
  const rows: R[] = [];
  for (let from = 0; from < hardCap; from += chunk) {
    const { data, error } = await build(from, from + chunk - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < chunk) break;
  }
  return rows;
}

/**
 * When a new booking lands for a contact, mark prior pending bookings on the
 * same client (+ same calendar when known) as `appointment_rescheduled`.
 * Also honors an explicit `previous_external_id` from Make/GHL.
 */
export async function supersedePriorPendingBookings(
  service: ServiceClient,
  opts: {
    clientId: string;
    ghlContactId: string | null;
    newEventId: string;
    newExternalId: string | null;
    newCalendarId: string | null;
    newOccurredAt: string | null;
    previousExternalId?: string | null;
  },
): Promise<{ superseded_ids: string[] }> {
  const superseded_ids: string[] = [];
  const ghlContactId = textField(opts.ghlContactId);
  const previousExternalId = textField(opts.previousExternalId);

  const candidates: PriorBookingCandidate[] = [];
  const seen = new Set<string>();

  const addCandidate = (row: PriorBookingCandidate | null | undefined) => {
    if (!row?.id || row.id === opts.newEventId || seen.has(row.id)) return;
    seen.add(row.id);
    candidates.push(row);
  };

  if (previousExternalId) {
    const { data, error } = await service
      .from('events')
      .select('id, external_id, calendar_id, occurred_at, ghl_contact_id, scheduled_at')
      .eq('client_id', opts.clientId)
      .eq('event_type', 'appointment_booked')
      .eq('external_id', previousExternalId)
      .order('occurred_at', { ascending: false })
      .limit(5);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) addCandidate(row as PriorBookingCandidate);
  }

  if (ghlContactId) {
    const { data, error } = await service
      .from('events')
      .select('id, external_id, calendar_id, occurred_at, ghl_contact_id, scheduled_at')
      .eq('client_id', opts.clientId)
      .eq('event_type', 'appointment_booked')
      .eq('ghl_contact_id', ghlContactId)
      .order('occurred_at', { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) addCandidate(row as PriorBookingCandidate);
  }

  if (candidates.length === 0) return { superseded_ids };

  const outcomes = await fetchAllRows<OutcomeRecord>((from, to) =>
    service
      .from('events')
      .select('id, event_type, external_id, raw, ghl_contact_id, scheduled_at')
      .eq('client_id', opts.clientId)
      .in('event_type', [...OUTCOME_EVENT_TYPES])
      .range(from, to),
  );
  const index = buildOutcomeIndex(outcomes);

  for (const prior of candidates) {
    const hasOutcome = Boolean(matchOutcome(prior as BookingKey, index));
    const eligible =
      previousExternalId && prior.external_id === previousExternalId
        ? !hasOutcome
        : shouldAutoSupersedePrior({
            prior,
            nextExternalId: opts.newExternalId,
            nextCalendarId: opts.newCalendarId,
            nextOccurredAt: opts.newOccurredAt,
            priorHasOutcome: hasOutcome,
          });
    if (!eligible) continue;

    const result = await setAppointmentOutcome(service, {
      appointment_event_id: prior.id,
      status: 'appointment_rescheduled',
      meta: {
        source: 'reschedule-ingest',
        superseded_by_event_id: opts.newEventId,
        superseded_by_external_id: opts.newExternalId,
        previous_external_id: previousExternalId,
      },
    });
    if (result.ok) superseded_ids.push(prior.id);
  }

  return { superseded_ids };
}

// Count appointments whose scheduled *calendar date* is before today (call-center
// TZ) but still have no outcome (show / no_show / appointment_cancelled /
// lo_bailed / rescheduled). Same-day undipositioned appts are excluded so the
// dashboard banner only flags true backlog.
//
// Deliberately NOT time-window scoped: it always reflects the full backlog,
// independent of any dashboard date filter. Scoped only by client (or live set).
export async function countOverdueUndispositioned(
  service: ServiceClient,
  opts: { clientId?: string | null; liveClientIds?: string[] | null },
): Promise<number> {
  const clientIds = opts.clientId
    ? [opts.clientId]
    : opts.liveClientIds
      ? liveClientFilter(opts.liveClientIds)
      : null;

  // Start of local "today" — not wall-clock now — so today's slots never count.
  const asOfIso = overdueAppointmentAsOfIso();

  const { data: rpcCount, error: rpcError } = await service.rpc('count_overdue_undispositioned', {
    p_client_ids: clientIds,
    p_as_of: asOfIso,
  });

  if (!rpcError && (typeof rpcCount === 'number' || typeof rpcCount === 'string')) {
    return Number(rpcCount) || 0;
  }
  if (
    rpcError &&
    !/count_overdue_undispositioned|Could not find the function|schema cache/i.test(rpcError.message)
  ) {
    throw new Error(rpcError.message);
  }

  // Fallback when RPC is not deployed yet.
  const scopeClient = <T extends {
    eq: (c: string, v: string) => T;
    in: (c: string, v: string[]) => T;
  }>(q: T): T => {
    if (opts.clientId) return q.eq('client_id', opts.clientId);
    if (opts.liveClientIds) return q.in('client_id', liveClientFilter(opts.liveClientIds));
    return q;
  };

  const bookings = await fetchAllRows<BookingKey>((from, to) => {
    let q = service
      .from('events')
      .select('id, external_id, ghl_contact_id, scheduled_at')
      .eq('event_type', 'appointment_booked')
      .not('scheduled_at', 'is', null)
      .lt('scheduled_at', asOfIso);
    q = scopeClient(q);
    return q.range(from, to);
  });
  if (bookings.length === 0) return 0;

  const outcomes = await fetchAllRows<OutcomeRecord>((from, to) => {
    let q = service
      .from('events')
      .select('external_id, raw, ghl_contact_id, scheduled_at')
      .in('event_type', [...OUTCOME_EVENT_TYPES]);
    q = scopeClient(q);
    return q.range(from, to);
  });

  const index = buildOutcomeIndex(outcomes);
  let count = 0;
  for (const b of bookings) {
    if (!matchOutcome(b, index)) count++;
  }
  return count;
}

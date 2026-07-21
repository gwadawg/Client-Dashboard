import type { createServiceClient } from './supabase';
import { needsAgentCredit } from './credit-queue-eligibility';
import { liveClientFilter } from './db-helpers';

type ServiceClient = ReturnType<typeof createServiceClient>;

// Outcome event types recorded for an appointment after it is booked.
export const OUTCOME_EVENT_TYPES = ['show', 'no_show', 'appointment_cancelled', 'lo_bailed'] as const;
export type OutcomeEventType = (typeof OUTCOME_EVENT_TYPES)[number];

// Statuses the disposition API accepts. `pending` means "no outcome" — any
// existing outcome row is removed so the appointment counts as un-dispositioned.
export type AppointmentStatus = OutcomeEventType | 'pending';

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
    default:
      return null;
  }
}

export type SetOutcomeInput = {
  appointment_event_id?: string | null;
  external_id?: string | null;
  ghl_contact_id?: string | null;
  status: AppointmentStatus;
};

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
};

export function buildOutcomeIndex(outcomes: OutcomeRecord[]): OutcomeIndex {
  const byExternal = new Map<string, OutcomeRecord>();
  const byApptEventId = new Map<string, OutcomeRecord>();
  const byContactTime = new Map<string, OutcomeRecord>();
  for (const o of outcomes) {
    if (o.external_id) byExternal.set(o.external_id, o);
    const linked = rawAppointmentEventId(o.raw);
    if (linked) byApptEventId.set(linked, o);
    const key = contactTimeKey(o.ghl_contact_id, o.scheduled_at);
    if (key) byContactTime.set(key, o);
  }
  return { byExternal, byApptEventId, byContactTime };
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
  return undefined;
}

export type BookingAgentSource = {
  id: string;
  agent_name: string | null;
  external_id?: string | null;
  ghl_contact_id?: string | null;
  scheduled_at?: string | null;
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

async function findLinkedOutcomes(
  service: ServiceClient,
  booking: BookingAgentSource,
): Promise<Array<{ id: string; agent_name: string | null }>> {
  const outcomes: Array<{ id: string; agent_name: string | null }> = [];
  const seen = new Set<string>();

  const addRows = (rows: Array<{ id: string; agent_name: string | null }> | null) => {
    for (const row of rows ?? []) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      outcomes.push(row);
    }
  };

  {
    const { data, error } = await service
      .from('events')
      .select('id, agent_name')
      .in('event_type', [...OUTCOME_EVENT_TYPES])
      .filter('raw->>appointment_event_id', 'eq', booking.id);
    if (error) throw new Error(error.message);
    addRows(data);
  }

  if (booking.external_id) {
    const { data, error } = await service
      .from('events')
      .select('id, agent_name')
      .in('event_type', [...OUTCOME_EVENT_TYPES])
      .eq('external_id', booking.external_id);
    if (error) throw new Error(error.message);
    addRows(data);
  }

  if (booking.ghl_contact_id && booking.scheduled_at) {
    const { data, error } = await service
      .from('events')
      .select('id, agent_name')
      .in('event_type', [...OUTCOME_EVENT_TYPES])
      .eq('ghl_contact_id', booking.ghl_contact_id)
      .eq('scheduled_at', booking.scheduled_at);
    if (error) throw new Error(error.message);
    addRows(data);
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
// it stays counted in "Appointments Booked" (the show-rate denominator). The
// outcome is recorded as a SEPARATE event row (show / no_show /
// appointment_cancelled / lo_bailed), which is how the rest of the dashboard
// already counts these.
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

// Count appointments whose scheduled date has already passed but still have no
// outcome (show / no_show / appointment_cancelled / lo_bailed). These are the
// "past due, not dispositioned" appointments that silently drag down show rate.
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

  const { data: rpcCount, error: rpcError } = await service.rpc('count_overdue_undispositioned', {
    p_client_ids: clientIds,
    p_as_of: new Date().toISOString(),
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
  const nowIso = new Date().toISOString();

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
      .lt('scheduled_at', nowIso);
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

import type { createServiceClient } from './supabase';

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
  //    than duplicate. Key by appointment id when we have one; otherwise tie to
  //    the specific booked row we matched.
  let existingOutcomeQuery = service
    .from('events')
    .select('id, event_type')
    .in('event_type', [...OUTCOME_EVENT_TYPES])
    .order('occurred_at', { ascending: false })
    .limit(1);
  existingOutcomeQuery = outcomeExternalId
    ? existingOutcomeQuery.eq('external_id', outcomeExternalId)
    : existingOutcomeQuery.filter('raw->>appointment_event_id', 'eq', bookedRow.id);

  const { data: existingOutcome, error: outcomeError } = await existingOutcomeQuery.maybeSingle();
  if (outcomeError) return { ok: false, status: 500, body: { error: outcomeError.message } };

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
      return {
        ok: true,
        status: 200,
        body: {
          success: true,
          updated: false,
          matched_by: matchedBy,
          outcome_id: existingOutcome.id,
          status: event_type,
          event_type,
        },
      };
    }
    const { data, error } = await service
      .from('events')
      .update({ event_type })
      .eq('id', existingOutcome.id)
      .select('id, event_type')
      .single();
    if (error) return { ok: false, status: 500, body: { error: error.message } };

    return {
      ok: true,
      status: 200,
      body: {
        success: true,
        updated: true,
        corrected: true,
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

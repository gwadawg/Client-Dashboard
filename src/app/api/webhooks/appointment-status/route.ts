import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { validateWebhookSecret } from '@/lib/api-auth';

// Outcome event types recorded for an appointment after it is booked.
const OUTCOME_EVENT_TYPES = [
  'show',
  'no_show',
  'appointment_cancelled',
  'lo_bailed',
] as const;

type OutcomeEventType = (typeof OUTCOME_EVENT_TYPES)[number];

function textField(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text === '' ? null : text;
}

function statusToEventType(status: unknown): OutcomeEventType | null {
  const normalized = textField(status)?.toLowerCase().replace(/[\s-]+/g, '_');
  switch (normalized) {
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
      return 'appointment_cancelled';
    case 'bailed':
    case 'lo_bailed':
      return 'lo_bailed';
    default:
      return null;
  }
}

const BOOKED_SELECT =
  'id, client_id, occurred_at, scheduled_at, calendar_name, calendar_id, lead_name, lead_phone, lead_email, agent_name, ghl_contact_id, stage_booked, external_id';

// Called by Make when an appointment shows, no-shows, is cancelled, or the LO bails.
//
// Design: the original `appointment_booked` row is the source of truth for the
// appointment and is NEVER modified (except to backfill a missing external_id) —
// it stays counted in "Appointments Booked" (the show-rate denominator). The
// outcome is recorded as a SEPARATE event row (show / no_show / appointment_cancelled
// / lo_bailed), which is exactly how the rest of the dashboard already counts these.
//
// Matching: we find the appointment by `external_id` (GHL appointment id) first.
// If that misses — e.g. the booking was imported historically and has no id stored —
// we fall back to the most recent booked appointment for the `ghl_contact_id`, then
// backfill the id so the appointment is precisely keyed from then on.
//
// Guarantees:
//   1. The outcome row inherits the booking's `occurred_at` (and client/agent/lead),
//      so a show reported late lands in the period the appointment was BOOKED, not
//      whenever the webhook fired.
//   2. At most ONE outcome row per appointment. A later/corrected status (e.g.
//      show → no_show) updates that single row in place, so no double-counting.
//
// Body: { external_id?: string, ghl_contact_id?: string, status: "show" | "no_show" | "cancelled" | "lo_bailed" }
export async function POST(req: Request) {
  try {
    if (!validateWebhookSecret(req)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await req.json();
    const external_id = textField(payload.external_id ?? payload.appointment_id);
    const ghl_contact_id = textField(
      payload.ghl_contact_id ?? payload.contact_id ?? payload.lead_id,
    );
    const event_type = statusToEventType(payload.status);

    if (!external_id && !ghl_contact_id) {
      return NextResponse.json(
        { error: 'external_id or ghl_contact_id is required' },
        { status: 400 },
      );
    }
    if (!event_type) {
      return NextResponse.json(
        { error: 'status must be "show", "no_show", "cancelled", or "lo_bailed"' },
        { status: 400 },
      );
    }

    const service = createServiceClient();

    // 1) Resolve the booked appointment. Prefer an exact appointment-id match;
    //    fall back to the most recent booking for this contact (covers historical
    //    appointments that were imported without an external_id).
    let bookedRow: Awaited<ReturnType<typeof findBookedByExternalId>>['data'] = null;
    let matchedBy: 'external_id' | 'ghl_contact_id' | null = null;

    if (external_id) {
      const { data, error } = await findBookedByExternalId(service, external_id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
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
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      if (data) {
        bookedRow = data;
        matchedBy = 'ghl_contact_id';
      }
    }

    if (!bookedRow) {
      return NextResponse.json(
        {
          error: 'No booked appointment found',
          searched: { external_id, ghl_contact_id },
        },
        { status: 404 },
      );
    }

    // The appointment id we will key the outcome on: whatever the booking already
    // has, otherwise the id from this webhook.
    const outcomeExternalId = bookedRow.external_id ?? external_id;

    // Backfill the booking with the appointment id when it was missing, so future
    // status updates match precisely by id instead of falling back to the contact.
    if (!bookedRow.external_id && external_id) {
      await service.from('events').update({ external_id }).eq('id', bookedRow.id);
    }

    // 2) Find an existing outcome for THIS appointment so we update rather than
    //    duplicate. Key by appointment id when we have one; otherwise tie to the
    //    specific booked row we matched.
    let existingOutcomeQuery = service
      .from('events')
      .select('id, event_type')
      .in('event_type', [...OUTCOME_EVENT_TYPES])
      .order('occurred_at', { ascending: false })
      .limit(1);
    existingOutcomeQuery = outcomeExternalId
      ? existingOutcomeQuery.eq('external_id', outcomeExternalId)
      : existingOutcomeQuery.filter('raw->>appointment_event_id', 'eq', bookedRow.id);

    const { data: existingOutcome, error: outcomeError } =
      await existingOutcomeQuery.maybeSingle();
    if (outcomeError) return NextResponse.json({ error: outcomeError.message }, { status: 500 });

    if (existingOutcome) {
      if (existingOutcome.event_type === event_type) {
        return NextResponse.json({
          success: true,
          updated: false,
          matched_by: matchedBy,
          outcome_id: existingOutcome.id,
          event_type,
        });
      }
      const { data, error } = await service
        .from('events')
        .update({ event_type })
        .eq('id', existingOutcome.id)
        .select('id, event_type')
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      return NextResponse.json({
        success: true,
        updated: true,
        corrected: true,
        matched_by: matchedBy,
        outcome_id: data.id,
        previous_event_type: existingOutcome.event_type,
        event_type: data.event_type,
      });
    }

    // 3) First outcome for this appointment: insert a new row, dated to the booking.
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

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
      success: true,
      created: true,
      matched_by: matchedBy,
      outcome_id: data.id,
      event_type: data.event_type,
      appointment_event_id: bookedRow.id,
    });
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
}

function findBookedByExternalId(
  service: ReturnType<typeof createServiceClient>,
  external_id: string,
) {
  return service
    .from('events')
    .select(BOOKED_SELECT)
    .eq('external_id', external_id)
    .eq('event_type', 'appointment_booked')
    .order('occurred_at', { ascending: false })
    .limit(1)
    .maybeSingle();
}

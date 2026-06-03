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

// Called by Make when an appointment shows, no-shows, is cancelled, or the LO bails.
//
// Design: the original `appointment_booked` row is the source of truth for the
// appointment and is NEVER modified — it stays counted in "Appointments Booked"
// (the show-rate denominator). The outcome is recorded as a SEPARATE event row
// (show / no_show / appointment_cancelled / lo_bailed), which is exactly how the
// rest of the dashboard already counts these.
//
// Two important guarantees:
//   1. The outcome row inherits the booking's `occurred_at` (and client/agent/lead),
//      so a show reported late still lands in the period the appointment was BOOKED,
//      not whenever the webhook happened to fire.
//   2. There is at most ONE outcome row per appointment (keyed by external_id). A
//      later/corrected status (e.g. show → no_show) updates that single row in place,
//      so an appointment can never be double-counted.
//
// Body: { external_id: string, status: "show" | "no_show" | "cancelled" | "lo_bailed" }
export async function POST(req: Request) {
  try {
    if (!validateWebhookSecret(req)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await req.json();
    const external_id = textField(payload.external_id ?? payload.appointment_id);
    const event_type = statusToEventType(payload.status);

    if (!external_id) {
      return NextResponse.json({ error: 'external_id is required' }, { status: 400 });
    }
    if (!event_type) {
      return NextResponse.json(
        { error: 'status must be "show", "no_show", "cancelled", or "lo_bailed"' },
        { status: 400 },
      );
    }

    const service = createServiceClient();

    // Source of truth: the booked appointment with this external_id. We copy its
    // date + identity onto the outcome row so the outcome is attributed to the
    // booking, and we use it to confirm the appointment actually exists.
    const { data: bookedRow, error: bookedError } = await service
      .from('events')
      .select(
        'id, client_id, occurred_at, scheduled_at, calendar_name, calendar_id, ' +
          'lead_name, lead_phone, lead_email, agent_name, ghl_contact_id, stage_booked',
      )
      .eq('external_id', external_id)
      .eq('event_type', 'appointment_booked')
      .order('occurred_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (bookedError) return NextResponse.json({ error: bookedError.message }, { status: 500 });

    // Any existing outcome row for this appointment (so we update instead of duplicate).
    const { data: existingOutcome, error: outcomeError } = await service
      .from('events')
      .select('id, client_id, occurred_at, event_type')
      .eq('external_id', external_id)
      .in('event_type', [...OUTCOME_EVENT_TYPES])
      .order('occurred_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (outcomeError) return NextResponse.json({ error: outcomeError.message }, { status: 500 });

    if (!bookedRow && !existingOutcome) {
      return NextResponse.json(
        { error: `No appointment booked with external_id "${external_id}"` },
        { status: 404 },
      );
    }

    // Correction / re-fire path: this appointment already has an outcome row.
    if (existingOutcome) {
      if (existingOutcome.event_type === event_type) {
        return NextResponse.json({
          success: true,
          updated: false,
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
        outcome_id: data.id,
        previous_event_type: existingOutcome.event_type,
        event_type: data.event_type,
      });
    }

    // First outcome for this appointment: insert a new row, dated to the booking.
    const { data, error } = await service
      .from('events')
      .insert({
        client_id: bookedRow!.client_id,
        event_type,
        // Attribute the outcome to when the appointment was booked, not "now".
        occurred_at: bookedRow!.occurred_at,
        external_id,
        scheduled_at: bookedRow!.scheduled_at,
        calendar_name: bookedRow!.calendar_name,
        calendar_id: bookedRow!.calendar_id,
        lead_name: bookedRow!.lead_name,
        lead_phone: bookedRow!.lead_phone,
        lead_email: bookedRow!.lead_email,
        agent_name: bookedRow!.agent_name,
        ghl_contact_id: bookedRow!.ghl_contact_id,
        stage_booked: bookedRow!.stage_booked,
        raw: {
          event_type,
          external_id,
          source: 'appointment-status',
          appointment_event_id: bookedRow!.id,
          recorded_at: new Date().toISOString(),
        },
      })
      .select('id, event_type')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
      success: true,
      created: true,
      outcome_id: data.id,
      event_type: data.event_type,
      appointment_event_id: bookedRow!.id,
    });
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
}

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { validateWebhookSecret } from '@/lib/api-auth';

const APPOINTMENT_STATUS_EVENT_TYPES = [
  'appointment_booked',
  'show',
  'no_show',
  'appointment_cancelled',
  'lo_bailed',
] as const;

function textField(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text === '' ? null : text;
}

function statusToEventType(status: unknown): (typeof APPOINTMENT_STATUS_EVENT_TYPES)[number] | null {
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

// Called by Make when an appointment shows, no-shows, is cancelled, or LO bails.
// Finds the appointment event by external_id (GHL appointment id) and updates its type.
// calendar_id / external_id on that row are unchanged — only event_type flips.
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

    const { data: existing, error: findError } = await service
      .from('events')
      .select('id, event_type')
      .eq('external_id', external_id)
      .in('event_type', [...APPOINTMENT_STATUS_EVENT_TYPES])
      .order('occurred_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (findError) return NextResponse.json({ error: findError.message }, { status: 500 });
    if (!existing) {
      return NextResponse.json(
        { error: `No appointment event found with external_id "${external_id}"` },
        { status: 404 },
      );
    }

    if (existing.event_type === event_type) {
      return NextResponse.json({
        success: true,
        updated: false,
        updated_id: existing.id,
        event_type,
      });
    }

    const { data, error } = await service
      .from('events')
      .update({ event_type })
      .eq('id', existing.id)
      .select('id, event_type')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
      success: true,
      updated: true,
      updated_id: data.id,
      previous_event_type: existing.event_type,
      event_type: data.event_type,
    });
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
}

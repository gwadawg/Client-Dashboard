import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { validateWebhookSecret } from '@/lib/api-auth';

// Called by Make when an appointment shows, no-shows, or is cancelled.
// Finds the original appointment_booked event by external_id and updates its type.
// Body: { external_id: string, status: "show" | "no_show" | "cancelled" }
export async function POST(req: Request) {
  try {
    if (!validateWebhookSecret(req)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { external_id, status } = await req.json();

    if (!external_id) {
      return NextResponse.json({ error: 'external_id is required' }, { status: 400 });
    }
    if (status !== 'show' && status !== 'no_show' && status !== 'cancelled') {
      return NextResponse.json({ error: 'status must be "show", "no_show", or "cancelled"' }, { status: 400 });
    }

    const service = createServiceClient();
    const event_type = status === 'cancelled' ? 'appointment_cancelled' : status;

    const { data, error } = await service
      .from('events')
      .update({ event_type })
      .eq('external_id', external_id)
      .eq('event_type', 'appointment_booked')
      .select('id')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) {
      return NextResponse.json(
        { error: `No appointment_booked found with external_id "${external_id}"` },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, updated_id: data.id });
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
}

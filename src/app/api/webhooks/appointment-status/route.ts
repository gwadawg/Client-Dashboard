import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { validateWebhookSecret } from '@/lib/api-auth';
import { normalizeAppointmentStatus, setAppointmentOutcome } from '@/lib/appointments';

// Called by Make when an appointment shows, no-shows, is cancelled, or the LO
// bails. The shared logic lives in `@/lib/appointments` so the in-app manual
// dispositioning route behaves identically.
//
// Body: { external_id?: string, ghl_contact_id?: string,
//         status: "show" | "no_show" | "cancelled" | "lo_bailed" }
export async function POST(req: Request) {
  try {
    if (!validateWebhookSecret(req)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await req.json();
    const external_id = payload.external_id ?? payload.appointment_id;
    const ghl_contact_id = payload.ghl_contact_id ?? payload.contact_id ?? payload.lead_id;
    const status = normalizeAppointmentStatus(payload.status);

    // The webhook never reverts to pending — it only records real outcomes.
    if (!status || status === 'pending') {
      return NextResponse.json(
        { error: 'status must be "show", "no_show", "cancelled", or "lo_bailed"' },
        { status: 400 },
      );
    }

    const service = createServiceClient();
    const result = await setAppointmentOutcome(service, { external_id, ghl_contact_id, status });
    return NextResponse.json(result.body, { status: result.status });
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
}

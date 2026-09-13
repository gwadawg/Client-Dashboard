import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { validateWebhookSecret } from '@/lib/api-auth';
import { normalizeAppointmentStatus, setAppointmentOutcome } from '@/lib/appointments';

// Called by Make when an appointment shows, no-shows, is cancelled, rescheduled,
// or the LO bails. The shared logic lives in `@/lib/appointments` so the in-app
// manual dispositioning route behaves identically.
//
// Body: { external_id?: string, ghl_contact_id?: string,
//         status: "show" | "no_show" | "cancelled" | "rescheduled" | "lo_bailed" }
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
        {
          error:
            'status must be "show", "no_show", "cancelled", "rescheduled", or "lo_bailed"',
        },
        { status: 400 },
      );
    }

    const service = createServiceClient();
    const result = await setAppointmentOutcome(service, { external_id, ghl_contact_id, status });
    // Make CCM scenarios use handleErrors:false — a missing booking is common
    // (cancel/reschedule before book landed, or ID mismatch). Treat as skipped
    // success so the scenario stays green while still surfacing the miss in JSON.
    if (result.status === 404) {
      // #region agent log
      fetch('http://127.0.0.1:7536/ingest/7e0bc9ea-19d3-426a-b894-38657722fc0f', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '717c22' },
        body: JSON.stringify({
          sessionId: '717c22',
          runId: 'make-audit',
          hypothesisId: 'C',
          location: 'webhooks/appointment-status/route.ts',
          message: 'appt_status_missing_skipped',
          data: { status: 200, skipped: true, outcome: status },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: 'no_booked_appointment',
        ...((result.body && typeof result.body === 'object') ? result.body : {}),
      });
    }
    return NextResponse.json(result.body, { status: result.status });
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
}

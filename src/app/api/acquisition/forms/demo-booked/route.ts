import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { BOOKING_SOURCE_OPTIONS, GHL_CF } from '@/lib/acquisition-config';
import {
  applyDemoBookingCredit,
  type DemoBookingCreditInput,
} from '@/lib/acquisition-form-apply';
import { verifyAcquisitionFormToken } from '@/lib/acquisition-form-token';
import {
  getAcquisitionContact,
  ghlContactName,
  ghlCustomFieldById,
} from '@/lib/ghl-acquisition-api';
import {
  recordGhlSyncOnSubmission,
  syncDemoBookingToGhl,
} from '@/lib/ghl-acquisition-sync';

function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

function parseQualified(v: unknown): boolean | null {
  if (v === true || v === 'true' || v === 'yes' || v === 'Yes') return true;
  if (v === false || v === 'false' || v === 'no' || v === 'No') return false;
  return null;
}

function validateToken(
  contactId: string,
  appointmentId: string | null,
  token: string | null,
): NextResponse | null {
  const check = verifyAcquisitionFormToken(contactId, appointmentId, token);
  if (!check.ok) {
    return NextResponse.json({ error: check.error }, { status: 401 });
  }
  return null;
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const contactId = str(params.get('contact_id'));
  const appointmentId = str(params.get('appointment_id'));
  const token = str(params.get('token'));

  if (!contactId) {
    return NextResponse.json({ error: 'contact_id is required' }, { status: 400 });
  }

  const denied = validateToken(contactId, appointmentId, token);
  if (denied) return denied;

  try {
    const contact = await getAcquisitionContact(contactId);
    const setterDefault = ghlCustomFieldById(contact, GHL_CF.agent);
    return NextResponse.json({
      contact_id: contactId,
      appointment_id: appointmentId,
      lead_name: ghlContactName(contact),
      email: contact.email ?? null,
      phone: contact.phone ?? null,
      setter_name_default: setterDefault,
      booking_source_options: BOOKING_SOURCE_OPTIONS,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const contactId = str(body.ghl_contact_id) ?? str(body.contact_id);
  const appointmentId = str(body.ghl_appointment_id) ?? str(body.appointment_id);
  const token = str(body.token) ?? str(req.nextUrl.searchParams.get('token'));

  if (!contactId) {
    return NextResponse.json({ error: 'contact_id is required' }, { status: 400 });
  }

  const denied = validateToken(contactId, appointmentId, token);
  if (denied) return denied;

  const setterName = str(body.setter_name);
  const bookingSource = str(body.booking_source);
  const bookedAt = str(body.booked_at);
  const scheduledAt = str(body.scheduled_at);

  if (!setterName) {
    return NextResponse.json({ error: 'setter_name is required' }, { status: 400 });
  }
  if (!bookingSource) {
    return NextResponse.json({ error: 'booking_source is required' }, { status: 400 });
  }
  if (!bookedAt) {
    return NextResponse.json({ error: 'booked_at is required' }, { status: 400 });
  }

  const input: DemoBookingCreditInput = {
    ghl_contact_id: contactId,
    ghl_appointment_id: appointmentId,
    setter_name: setterName,
    booking_source: bookingSource,
    booked_at: bookedAt,
    scheduled_at: scheduledAt,
    qualified: parseQualified(body.qualified),
    notes: str(body.notes),
  };

  const service = createServiceClient();

  try {
    const applied = await applyDemoBookingCredit(service, input);
    const syncResult = await syncDemoBookingToGhl(input);
    await recordGhlSyncOnSubmission(service, applied.submission_id, syncResult);

    return NextResponse.json({
      ok: true,
      submission_id: applied.submission_id,
      lead_id: applied.lead_id,
      appointment_id: applied.appointment_id,
      is_resubmit: applied.is_resubmit,
      ghl_sync_status: syncResult.status,
      ghl_sync_error:
        syncResult.status === 'failed'
          ? syncResult.error
          : syncResult.status === 'skipped'
            ? syncResult.reason
            : null,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

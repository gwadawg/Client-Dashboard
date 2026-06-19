import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { getDialPickerForLead } from '@/lib/acquisition-dial-linkage';
import { verifyAcquisitionFormToken } from '@/lib/acquisition-form-token';

function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const contactId = str(params.get('contact_id'));
  const token = str(params.get('token'));
  const appointmentId = str(params.get('appointment_id'));
  const introGhlId = str(params.get('intro_appointment_id'));
  const demoGhlId = str(params.get('demo_appointment_id'));
  const explicitDialId = str(params.get('dial_id'));

  if (!contactId) {
    return NextResponse.json({ error: 'contact_id is required' }, { status: 400 });
  }

  const apptForToken = demoGhlId ?? introGhlId ?? appointmentId;
  const check = verifyAcquisitionFormToken(contactId, apptForToken, token);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 401 });

  const service = createServiceClient();

  try {
    const { data: lead } = await service
      .from('acquisition_leads')
      .select('id')
      .eq('ghl_contact_id', contactId)
      .maybeSingle();

    if (!lead?.id) {
      return NextResponse.json({ dials: [], suggested_dial_id: null });
    }

    let appointmentAt: string | null = null;
    const ghlApptId = appointmentId ?? demoGhlId ?? introGhlId;
    if (ghlApptId) {
      const { data: appt } = await service
        .from('acquisition_appointments')
        .select('scheduled_at, booked_at')
        .eq('ghl_appointment_id', ghlApptId)
        .maybeSingle();
      appointmentAt = appt?.scheduled_at ?? appt?.booked_at ?? null;
    }

    const picker = await getDialPickerForLead(service, lead.id, {
      appointmentAt,
      explicitDialId,
    });

    return NextResponse.json(picker);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

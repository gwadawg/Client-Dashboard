import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requirePermission } from '@/lib/api-auth';
import {
  buildCloserFormUrlForLead,
  hasCloserFormSubmission,
} from '@/lib/acquisition-closer-form';

function str(v: string | null): string | null {
  if (!v) return null;
  const s = v.trim();
  return s || null;
}

/** GET /api/acquisition/log-close?lead_id=&ghl_appointment_id= — signed closer form URL */
export async function GET(req: NextRequest) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requirePermission(ctx, 'acquisition');
  if (denied) return denied;

  const leadId = str(req.nextUrl.searchParams.get('lead_id'));
  if (!leadId) {
    return NextResponse.json({ error: 'lead_id is required' }, { status: 400 });
  }

  const ghlAppointmentId = str(req.nextUrl.searchParams.get('ghl_appointment_id'));

  const { data: lead, error: leadErr } = await ctx.service
    .from('acquisition_leads')
    .select('id, lead_name, email, phone, ghl_contact_id')
    .eq('id', leadId)
    .maybeSingle();

  if (leadErr) return NextResponse.json({ error: leadErr.message }, { status: 500 });
  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
  if (!lead.ghl_contact_id?.trim()) {
    return NextResponse.json({ error: 'Lead has no GHL contact ID — cannot open closer form' }, { status: 400 });
  }

  let appointmentDbId: string | null = null;
  if (ghlAppointmentId) {
    const { data: appt } = await ctx.service
      .from('acquisition_appointments')
      .select('id, lead_id')
      .eq('ghl_appointment_id', ghlAppointmentId)
      .maybeSingle();
    if (!appt || appt.lead_id !== leadId) {
      return NextResponse.json({ error: 'Appointment not found for this lead' }, { status: 400 });
    }
    appointmentDbId = appt.id;
  }

  const formUrl = await buildCloserFormUrlForLead(ctx.service, leadId, ghlAppointmentId);
  if (!formUrl) {
    return NextResponse.json({ error: 'Could not build form URL' }, { status: 500 });
  }

  let closer_form_done = false;
  if (appointmentDbId) {
    closer_form_done = await hasCloserFormSubmission(ctx.service, appointmentDbId, ghlAppointmentId);
  }

  return NextResponse.json({
    lead_id: lead.id,
    lead_name: lead.lead_name,
    ghl_contact_id: lead.ghl_contact_id,
    ghl_appointment_id: ghlAppointmentId,
    form_url: formUrl,
    closer_form_done,
  });
}

import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requirePermission } from '@/lib/api-auth';
import { hasCloserFormSubmission } from '@/lib/acquisition-closer-form';

function str(v: string | null): string | null {
  if (!v) return null;
  const s = v.trim();
  return s || null;
}

/** GET /api/acquisition/log-close/context?lead_id= — lead + showed appointments for picker */
export async function GET(req: NextRequest) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requirePermission(ctx, 'acquisition');
  if (denied) return denied;

  const leadId = str(req.nextUrl.searchParams.get('lead_id'));
  if (!leadId) {
    return NextResponse.json({ error: 'lead_id is required' }, { status: 400 });
  }

  const { data: lead, error: leadErr } = await ctx.service
    .from('acquisition_leads')
    .select('id, lead_name, email, phone, ghl_contact_id')
    .eq('id', leadId)
    .maybeSingle();

  if (leadErr) return NextResponse.json({ error: leadErr.message }, { status: 500 });
  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });

  const { data: appointments, error: apptErr } = await ctx.service
    .from('acquisition_appointments')
    .select(
      'id, ghl_appointment_id, appointment_type, status, scheduled_at, booked_at, call_taken_by, setter_name',
    )
    .eq('lead_id', leadId)
    .eq('status', 'showed')
    .order('scheduled_at', { ascending: false, nullsFirst: false })
    .limit(20);

  if (apptErr) return NextResponse.json({ error: apptErr.message }, { status: 500 });

  const apptRows = await Promise.all(
    (appointments ?? []).map(async appt => ({
      id: appt.id,
      ghl_appointment_id: appt.ghl_appointment_id,
      appointment_type: appt.appointment_type,
      scheduled_at: appt.scheduled_at,
      booked_at: appt.booked_at,
      call_taken_by: appt.call_taken_by,
      setter_name: appt.setter_name,
      closer_form_done: await hasCloserFormSubmission(
        ctx.service,
        appt.id,
        appt.ghl_appointment_id,
      ),
    })),
  );

  return NextResponse.json({
    lead: {
      id: lead.id,
      lead_name: lead.lead_name,
      email: lead.email,
      phone: lead.phone,
      ghl_contact_id: lead.ghl_contact_id,
    },
    appointments: apptRows,
  });
}

import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requirePermission } from '@/lib/api-auth';
import {
  createLeadFromAppointment,
  linkAcquisitionAppointmentToLead,
  pullGhlAndLinkAppointment,
} from '@/lib/acquisition-appointment-link';

type LinkAction = 'link_lead' | 'create_lead' | 'pull_ghl';

export async function POST(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requirePermission(ctx, 'acquisition');
  if (denied) return denied;

  let payload: { appointment_id?: string; action?: string; lead_id?: string };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const appointmentId = payload.appointment_id?.trim();
  if (!appointmentId) {
    return NextResponse.json({ error: 'appointment_id is required' }, { status: 400 });
  }

  const action = payload.action?.trim() as LinkAction | undefined;
  if (!action || !['link_lead', 'create_lead', 'pull_ghl'].includes(action)) {
    return NextResponse.json(
      { error: 'action must be "link_lead", "create_lead", or "pull_ghl"' },
      { status: 400 },
    );
  }

  if (action === 'link_lead') {
    const leadId = payload.lead_id?.trim();
    if (!leadId) {
      return NextResponse.json({ error: 'lead_id is required for link_lead' }, { status: 400 });
    }
    const result = await linkAcquisitionAppointmentToLead(ctx.service, appointmentId, leadId);
    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({
      ok: true,
      appointment_id: appointmentId,
      lead_id: result.lead_id,
      ghl_contact_id: result.ghl_contact_id,
    });
  }

  if (action === 'create_lead') {
    const result = await createLeadFromAppointment(ctx.service, appointmentId);
    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({
      ok: true,
      appointment_id: appointmentId,
      lead_id: result.lead_id,
      ghl_contact_id: result.ghl_contact_id,
      created: true,
    });
  }

  try {
    const result = await pullGhlAndLinkAppointment(ctx.service, appointmentId);
    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({
      ok: true,
      appointment_id: appointmentId,
      lead_id: result.lead_id,
      ghl_contact_id: result.ghl_contact_id,
      created: result.created,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'GHL pull failed';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

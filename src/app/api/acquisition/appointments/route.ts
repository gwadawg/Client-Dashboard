import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requirePermission } from '@/lib/api-auth';
import { ENRICHED_APPOINTMENT_COLUMNS } from '@/lib/acquisition-appointment-enriched';
import {
  normalizeAcquisitionAppointmentStatus,
  setAcquisitionAppointmentStatus,
} from '@/lib/acquisition-appointments';

export async function GET(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requirePermission(ctx, 'acquisition');
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const appointmentType = searchParams.get('appointment_type');
  const status = searchParams.get('status');
  const queueAction = searchParams.get('queue_action');
  const setter = searchParams.get('setter');
  const leadId = searchParams.get('lead_id');
  const search = searchParams.get('search')?.trim() ?? '';
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const limit = Math.min(200, parseInt(searchParams.get('limit') ?? '50', 10));
  const offset = (page - 1) * limit;

  let query = ctx.service
    .from('v_acquisition_appointment_enriched')
    .select(ENRICHED_APPOINTMENT_COLUMNS, { count: 'exact' })
    .order('booked_at', { ascending: false, nullsFirst: false })
    .range(offset, offset + limit - 1);

  if (from) query = query.gte('booked_at', `${from}T00:00:00.000Z`);
  if (to) query = query.lte('booked_at', `${to}T23:59:59.999Z`);
  if (appointmentType) query = query.eq('appointment_type', appointmentType);
  if (status) query = query.eq('status', status);
  if (queueAction) query = query.eq('queue_action', queueAction);
  if (setter) query = query.ilike('setter_name', `%${setter}%`);
  if (leadId) query = query.eq('lead_id', leadId);

  if (search) {
    const term = `*${search.replace(/[%,()]/g, ' ')}*`;
    query = query.or(`lead_name.ilike.${term},phone.ilike.${term},setter_name.ilike.${term}`);
  }

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let pendingDispositionCount = 0;
  if (!queueAction) {
    let pendingQuery = ctx.service
      .from('v_acquisition_appointment_enriched')
      .select('id', { count: 'exact', head: true })
      .eq('queue_action', 'needs_disposition');
    if (from) pendingQuery = pendingQuery.gte('booked_at', `${from}T00:00:00.000Z`);
    if (to) pendingQuery = pendingQuery.lte('booked_at', `${to}T23:59:59.999Z`);
    if (appointmentType) pendingQuery = pendingQuery.eq('appointment_type', appointmentType);
    const { count: pendingCount } = await pendingQuery;
    pendingDispositionCount = pendingCount ?? 0;
  }

  return NextResponse.json({
    rows: data ?? [],
    total: count ?? 0,
    page,
    pending_disposition_count: pendingDispositionCount,
  });
}

export async function PATCH(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requirePermission(ctx, 'acquisition');
  if (denied) return denied;

  let payload: { appointment_id?: string; status?: string };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const appointmentId = payload.appointment_id?.trim();
  if (!appointmentId) {
    return NextResponse.json({ error: 'appointment_id is required' }, { status: 400 });
  }

  const status = normalizeAcquisitionAppointmentStatus(payload.status);
  if (!status) {
    return NextResponse.json(
      {
        error:
          'status must be "pending", "showed", "no_show", "cancelled", or "team_no_show"',
      },
      { status: 400 },
    );
  }

  const result = await setAcquisitionAppointmentStatus(ctx.service, appointmentId, status);
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true, appointment_id: appointmentId, status });
}

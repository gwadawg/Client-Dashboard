import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requirePermission } from '@/lib/api-auth';

const CALL_FIELDS =
  'id, lead_id, client_id, call_type, called_at, status, handled_by, co_handler, recording_url, transcript_url, disposition, notes, details, appointment_id, linked_demo_appointment_id, acquisition_leads(lead_name, phone)';

export async function GET(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requirePermission(ctx, 'acquisition');
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const callType = searchParams.get('call_type');
  const includeDials = searchParams.get('include_dials') === 'true';
  const leadId = searchParams.get('lead_id');
  const callId = searchParams.get('call_id');
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const limit = Math.min(200, parseInt(searchParams.get('limit') ?? '50', 10));
  const offset = (page - 1) * limit;

  let query = ctx.service
    .from('acquisition_calls')
    .select(CALL_FIELDS, { count: 'exact' })
    .order('called_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (from) query = query.gte('called_at', `${from}T00:00:00.000Z`);
  if (to) query = query.lte('called_at', `${to}T23:59:59.999Z`);
  if (callType) query = query.eq('call_type', callType);
  if (leadId) query = query.eq('lead_id', leadId);
  if (!includeDials) query = query.neq('call_type', 'dial');

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let rows = data ?? [];
  if (callId && !rows.some(r => r.id === callId)) {
    const { data: focused } = await ctx.service
      .from('acquisition_calls')
      .select(CALL_FIELDS)
      .eq('id', callId)
      .maybeSingle();
    if (focused) rows = [focused, ...rows];
  }

  return NextResponse.json({
    rows,
    total: count ?? rows.length,
    page,
    highlighted_call_id: callId,
  });
}

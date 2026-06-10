import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requireAnyPermission } from '@/lib/api-auth';
import { CLIENT_CALL_FIELDS, isValidCallType } from '@/lib/client-calls';
import { parseCheckinFormInput, validateCheckinFormForSave } from '@/lib/checkin-form';

function optionalText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function parseCalledAt(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requireAnyPermission(ctx, ['admin_clients', 'admin_billing', 'client_calls']);
  if (denied) return denied;

  const { id: clientId } = await params;

  const { data, error } = await ctx.service
    .from('client_calls')
    .select(CLIENT_CALL_FIELDS)
    .eq('client_id', clientId)
    .order('called_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ calls: data ?? [] });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requireAnyPermission(ctx, ['admin_clients', 'admin_billing', 'client_calls']);
  if (denied) return denied;

  const { id: clientId } = await params;
  const body = await req.json();

  const callType =
    typeof body.call_type === 'string' && body.call_type.trim()
      ? body.call_type.trim()
      : null;
  const calledAt = parseCalledAt(body.called_at);

  if (!callType || !isValidCallType(callType)) {
    return NextResponse.json({ error: 'Valid call_type is required' }, { status: 400 });
  }
  if (!calledAt) {
    return NextResponse.json({ error: 'Valid called_at is required' }, { status: 400 });
  }

  const { data: client, error: clientError } = await ctx.service
    .from('clients')
    .select('id')
    .eq('id', clientId)
    .single();

  if (clientError) {
    const status = clientError.code === 'PGRST116' ? 404 : 500;
    return NextResponse.json({ error: clientError.message }, { status });
  }
  if (!client) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 });
  }

  const statusHistoryId =
    typeof body.status_history_id === 'string' && body.status_history_id.trim()
      ? body.status_history_id.trim()
      : null;

  let checkinForm = null;
  if (callType === 'checkin' && body.checkin_form !== undefined) {
    checkinForm = parseCheckinFormInput(body.checkin_form);
    const formError = validateCheckinFormForSave(checkinForm);
    if (formError) {
      return NextResponse.json({ error: formError }, { status: 400 });
    }
  }

  const now = new Date().toISOString();
  const { data, error } = await ctx.service
    .from('client_calls')
    .insert({
      client_id: clientId,
      call_type: callType,
      called_at: calledAt,
      recording_url: optionalText(body.recording_url),
      transcript: optionalText(body.transcript),
      notes: optionalText(body.notes),
      attendees: optionalText(body.attendees),
      checkin_form: checkinForm,
      status_history_id: statusHistoryId,
      created_by: ctx.userId,
      updated_by: ctx.userId,
      updated_at: now,
    })
    .select(CLIENT_CALL_FIELDS)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ call: data });
}

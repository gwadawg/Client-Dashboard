import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requireAnyPermission } from '@/lib/api-auth';
import { isValidNoteType, isValidReasonCode } from '@/lib/client-feedback';

const SELECT =
  'id, client_id, note_type, reason_code, body, related_call_id, created_at, created_by';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requireAnyPermission(ctx, ['admin_clients', 'admin_billing']);
  if (denied) return denied;

  const { id: clientId } = await params;
  const body = await req.json();

  const noteType =
    typeof body.note_type === 'string' && body.note_type.trim()
      ? body.note_type.trim()
      : 'general';
  const noteBody = typeof body.body === 'string' ? body.body.trim() : '';
  const reasonCode =
    typeof body.reason_code === 'string' && body.reason_code.trim()
      ? body.reason_code.trim()
      : null;

  if (!noteBody) {
    return NextResponse.json({ error: 'body is required' }, { status: 400 });
  }
  if (!isValidNoteType(noteType)) {
    return NextResponse.json({ error: 'Invalid note_type' }, { status: 400 });
  }
  if (reasonCode && !isValidReasonCode(reasonCode)) {
    return NextResponse.json({ error: 'Invalid reason_code' }, { status: 400 });
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

  const relatedCallId =
    typeof body.related_call_id === 'string' && body.related_call_id.trim()
      ? body.related_call_id.trim()
      : null;

  const { data, error } = await ctx.service
    .from('client_notes')
    .insert({
      client_id: clientId,
      note_type: noteType,
      reason_code: reasonCode,
      body: noteBody,
      related_call_id: relatedCallId,
      created_by: ctx.userId,
    })
    .select(SELECT)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ note: data });
}

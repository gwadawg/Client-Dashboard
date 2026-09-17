import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requireAnyPermission } from '@/lib/api-auth';
import { isValidNoteType, isValidReasonCode } from '@/lib/client-feedback';

const SELECT =
  'id, client_id, note_type, reason_code, body, related_call_id, created_at, created_by, updated_at';

// PATCH /api/clients/[id]/notes/[noteId] — correct a note (keeps audit via updated_at).
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; noteId: string }> },
) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requireAnyPermission(ctx, ['admin_clients', 'admin_billing']);
  if (denied) return denied;

  const { id: clientId, noteId } = await params;
  const body = await req.json();
  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    updated_by: ctx.userId,
  };

  if ('body' in body) {
    const text = typeof body.body === 'string' ? body.body.trim() : '';
    if (!text) return NextResponse.json({ error: 'body cannot be empty' }, { status: 400 });
    updates.body = text;
  }
  if ('note_type' in body) {
    if (!isValidNoteType(body.note_type)) {
      return NextResponse.json({ error: 'Invalid note_type' }, { status: 400 });
    }
    updates.note_type = body.note_type;
  }
  if ('reason_code' in body) {
    const code = body.reason_code === null || body.reason_code === '' ? null : body.reason_code;
    if (code && !isValidReasonCode(code)) {
      return NextResponse.json({ error: 'Invalid reason_code' }, { status: 400 });
    }
    updates.reason_code = code;
  }
  if ('related_call_id' in body) {
    updates.related_call_id =
      typeof body.related_call_id === 'string' && body.related_call_id.trim()
        ? body.related_call_id.trim()
        : null;
  }

  if (Object.keys(updates).length <= 2) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  const { data, error } = await ctx.service
    .from('client_notes')
    .update(updates)
    .eq('id', noteId)
    .eq('client_id', clientId)
    .is('deleted_at', null)
    .select(SELECT)
    .single();

  if (error) {
    const status = error.code === 'PGRST116' ? 404 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }
  return NextResponse.json({ note: data });
}

// DELETE — soft-delete (sets deleted_at).
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; noteId: string }> },
) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requireAnyPermission(ctx, ['admin_clients', 'admin_billing']);
  if (denied) return denied;

  const { id: clientId, noteId } = await params;
  const { data, error } = await ctx.service
    .from('client_notes')
    .update({ deleted_at: new Date().toISOString(), updated_by: ctx.userId })
    .eq('id', noteId)
    .eq('client_id', clientId)
    .is('deleted_at', null)
    .select('id')
    .single();

  if (error) {
    const status = error.code === 'PGRST116' ? 404 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }
  return NextResponse.json({ deleted: true, id: data.id });
}

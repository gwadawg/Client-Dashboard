import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requireAnyPermission } from '@/lib/api-auth';
import { CLIENT_CALL_FIELDS, isValidCallType } from '@/lib/client-calls';
import { parseCheckinFormInput, validateCheckinFormForSave } from '@/lib/checkin-form';

function optionalText(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || null;
}

function parseCalledAt(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !value.trim()) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; callId: string }> }) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requireAnyPermission(ctx, ['admin_clients', 'admin_billing', 'client_calls']);
  if (denied) return denied;

  const { id: clientId, callId } = await params;
  const body = await req.json();

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    updated_by: ctx.userId,
  };

  if (body.call_type !== undefined) {
    const callType =
      typeof body.call_type === 'string' && body.call_type.trim()
        ? body.call_type.trim()
        : null;
    if (!callType || !isValidCallType(callType)) {
      return NextResponse.json({ error: 'Invalid call_type' }, { status: 400 });
    }
    updates.call_type = callType;
  }

  const calledAt = parseCalledAt(body.called_at);
  if (body.called_at !== undefined) {
    if (!calledAt) {
      return NextResponse.json({ error: 'Invalid called_at' }, { status: 400 });
    }
    updates.called_at = calledAt;
  }

  const recordingUrl = optionalText(body.recording_url);
  if (body.recording_url !== undefined) updates.recording_url = recordingUrl;

  const transcript = optionalText(body.transcript);
  if (body.transcript !== undefined) updates.transcript = transcript;

  const notes = optionalText(body.notes);
  if (body.notes !== undefined) updates.notes = notes;

  const attendees = optionalText(body.attendees);
  if (body.attendees !== undefined) updates.attendees = attendees;

  if (body.status_history_id !== undefined) {
    const sid =
      typeof body.status_history_id === 'string' && body.status_history_id.trim()
        ? body.status_history_id.trim()
        : null;
    updates.status_history_id = sid;
  }

  if (body.checkin_form !== undefined) {
    const parsed = parseCheckinFormInput(body.checkin_form);
    const effectiveType =
      typeof updates.call_type === 'string'
        ? updates.call_type
        : undefined;
    if (effectiveType === 'checkin' || body.call_type === 'checkin') {
      const formError = validateCheckinFormForSave(parsed);
      if (formError) {
        return NextResponse.json({ error: formError }, { status: 400 });
      }
    }
    updates.checkin_form = parsed;
  }

  if (Object.keys(updates).length <= 2) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  const { data, error } = await ctx.service
    .from('client_calls')
    .update(updates)
    .eq('id', callId)
    .eq('client_id', clientId)
    .select(CLIENT_CALL_FIELDS)
    .single();

  if (error) {
    const status = error.code === 'PGRST116' ? 404 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }
  if (!data) {
    return NextResponse.json({ error: 'Call not found' }, { status: 404 });
  }

  return NextResponse.json({ call: data });
}

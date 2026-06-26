import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requireManageUsers } from '@/lib/api-auth';
import {
  TEAM_CALL_FIELDS,
  cleanTeamCallTags,
  highlightsToSearchText,
  isValidTeamCallType,
  normalizeHighlights,
} from '@/lib/team-calls';

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

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requireManageUsers(ctx);
  if (denied) return denied;

  const { id } = await params;
  const body = await req.json();

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    updated_by: ctx.userId,
  };

  if (body.title !== undefined) {
    const title = optionalText(body.title);
    if (!title) return NextResponse.json({ error: 'title cannot be empty' }, { status: 400 });
    updates.title = title;
  }

  if (body.call_type !== undefined) {
    const callType = optionalText(body.call_type);
    if (!callType || !isValidTeamCallType(callType)) {
      return NextResponse.json({ error: 'Invalid call_type' }, { status: 400 });
    }
    updates.call_type = callType;
  }

  const calledAt = parseCalledAt(body.called_at);
  if (body.called_at !== undefined) {
    if (!calledAt) return NextResponse.json({ error: 'Invalid called_at' }, { status: 400 });
    updates.called_at = calledAt;
  }

  const recordingUrl = optionalText(body.recording_url);
  if (body.recording_url !== undefined) updates.recording_url = recordingUrl;

  const transcript = optionalText(body.transcript);
  if (body.transcript !== undefined) updates.transcript = transcript;

  const summary = optionalText(body.summary);
  if (body.summary !== undefined) updates.summary = summary;

  const participants = optionalText(body.participants);
  if (body.participants !== undefined) updates.participants = participants;

  if (body.tags !== undefined) updates.tags = cleanTeamCallTags(body.tags);

  if (body.highlights !== undefined) {
    const highlights = normalizeHighlights(body.highlights);
    updates.highlights = highlights;
    updates.highlights_text = highlightsToSearchText(highlights) || null;
  }

  if (body.duration_seconds !== undefined) {
    const n = body.duration_seconds === null || body.duration_seconds === '' ? null : Number(body.duration_seconds);
    updates.duration_seconds = Number.isFinite(n) ? Math.floor(n!) : null;
  }

  if (Object.keys(updates).length <= 2) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  const { data, error } = await ctx.service
    .from('team_calls')
    .update(updates)
    .eq('id', id)
    .is('deleted_at', null)
    .select(TEAM_CALL_FIELDS)
    .single();

  if (error) {
    const status = error.code === 'PGRST116' ? 404 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }

  return NextResponse.json({ call: { ...data, highlights: normalizeHighlights(data.highlights) } });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requireManageUsers(ctx);
  if (denied) return denied;

  const { id } = await params;
  const { data, error } = await ctx.service
    .from('team_calls')
    .update({
      deleted_at: new Date().toISOString(),
      updated_by: ctx.userId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .is('deleted_at', null)
    .select('id')
    .single();

  if (error) {
    const status = error.code === 'PGRST116' ? 404 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }

  return NextResponse.json({ deleted: true, id: data.id });
}

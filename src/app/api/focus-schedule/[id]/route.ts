import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requireAnyPermission } from '@/lib/api-auth';
import { validateFocusPatch } from '@/lib/focus-schedule';

const SCHEDULE_PERMS = ['agents', 'schedule'] as const;

const SELECT =
  'id, client_id, agent_id, scheduled_date, time_start, time_end, status, notes, created_at, clients(name), agents(name)';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requireAnyPermission(ctx, [...SCHEDULE_PERMS]);
  if (denied) return denied;

  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { data: existing, error: fetchError } = await ctx.service
    .from('focus_schedule')
    .select('time_start, time_end')
    .eq('id', id)
    .maybeSingle();

  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const parsed = validateFocusPatch(body, existing);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const { data, error } = await ctx.service
    .from('focus_schedule')
    .update(parsed.value)
    .eq('id', id)
    .select(SELECT)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ row: data });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requireAnyPermission(ctx, [...SCHEDULE_PERMS]);
  if (denied) return denied;

  const { id } = await params;
  const { error } = await ctx.service.from('focus_schedule').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

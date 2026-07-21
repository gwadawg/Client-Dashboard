import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requireAnyPermission } from '@/lib/api-auth';

export async function GET(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requireAnyPermission(ctx, ['agents', 'schedule']);
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const week_start = searchParams.get('week_start');
  if (!week_start) return NextResponse.json({ error: 'week_start required' }, { status: 400 });

  const weekEnd = new Date(week_start + 'T12:00:00Z');
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
  const week_end = weekEnd.toISOString().split('T')[0];

  const { data, error } = await ctx.service
    .from('watch_schedule')
    .select('id, agent_id, scheduled_date, slot_hour, agents(name)')
    .gte('scheduled_date', week_start)
    .lte('scheduled_date', week_end)
    .order('slot_hour');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rows: data });
}

function normalizeHours(body: {
  slot_hour?: unknown;
  slot_hour_start?: unknown;
  slot_hour_end?: unknown;
  hours?: unknown;
}): number[] | null {
  if (Array.isArray(body.hours)) {
    const hours = body.hours
      .map(h => (typeof h === 'number' ? h : Number(h)))
      .filter(h => Number.isInteger(h) && h >= 8 && h <= 20);
    return [...new Set(hours)].sort((a, b) => a - b);
  }

  const start =
    body.slot_hour_start !== undefined
      ? Number(body.slot_hour_start)
      : body.slot_hour !== undefined
        ? Number(body.slot_hour)
        : NaN;
  const end =
    body.slot_hour_end !== undefined ? Number(body.slot_hour_end) : start;

  if (!Number.isInteger(start) || !Number.isInteger(end)) return null;
  if (start < 8 || start > 20 || end < 8 || end > 20) return null;

  const lo = Math.min(start, end);
  const hi = Math.max(start, end);
  const hours: number[] = [];
  for (let h = lo; h <= hi; h++) hours.push(h);
  return hours;
}

export async function POST(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requireAnyPermission(ctx, ['agents', 'schedule']);
  if (denied) return denied;

  const body = await req.json();
  const { agent_id, scheduled_date } = body;
  if (!agent_id || !scheduled_date) {
    return NextResponse.json({ error: 'agent_id, scheduled_date required' }, { status: 400 });
  }

  const hours = normalizeHours(body);
  if (!hours || hours.length === 0) {
    return NextResponse.json(
      { error: 'slot_hour, slot_hour_start/slot_hour_end, or hours[] required (8–20)' },
      { status: 400 },
    );
  }

  const inserts = hours.map(slot_hour => ({ agent_id, scheduled_date, slot_hour }));
  const { data, error } = await ctx.service
    .from('watch_schedule')
    .upsert(inserts, { onConflict: 'agent_id,scheduled_date,slot_hour', ignoreDuplicates: true })
    .select('id, agent_id, scheduled_date, slot_hour, agents(name)');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Upsert with ignoreDuplicates may omit existing rows — return all slots for this agent/date in range
  const { data: rows, error: fetchError } = await ctx.service
    .from('watch_schedule')
    .select('id, agent_id, scheduled_date, slot_hour, agents(name)')
    .eq('agent_id', agent_id)
    .eq('scheduled_date', scheduled_date)
    .in('slot_hour', hours)
    .order('slot_hour');

  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });

  if (hours.length === 1) {
    return NextResponse.json({ row: rows?.[0] ?? data?.[0] ?? null, rows: rows ?? data ?? [] });
  }
  return NextResponse.json({ rows: rows ?? data ?? [] });
}

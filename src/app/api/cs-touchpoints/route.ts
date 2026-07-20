import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requirePermission } from '@/lib/api-auth';
import {
  CS_TOUCHPOINT_LABELS,
  endOfUtcDayIso,
  startOfUtcDayIso,
  type CsTouchpointStatus,
} from '@/lib/cs-touchpoints';

export async function GET(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requirePermission(ctx, 'client_health');
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const due = searchParams.get('due') ?? 'open'; // overdue | today | upcoming | open | all
  const status = searchParams.get('status'); // open | snoozed | done | skipped | all
  const search = searchParams.get('search')?.trim() ?? '';
  const clientId = searchParams.get('client_id');
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const limit = 50;
  const offset = (page - 1) * limit;

  const now = new Date();
  const todayStart = startOfUtcDayIso(now);
  const todayEnd = endOfUtcDayIso(now);

  let query = ctx.service
    .from('cs_touchpoints')
    .select(
      'id, client_id, touchpoint_type, cycle_key, status, due_at, triggered_at, completed_at, snoozed_until, trigger_source, source_ref, playbook_stage, slack_sent, slack_snippet, completion_note, created_at, updated_at, clients(id, name, launch_date, date_signed, lifecycle_status)',
      { count: 'exact' },
    )
    .order('due_at', { ascending: true })
    .range(offset, offset + limit - 1);

  if (clientId) query = query.eq('client_id', clientId);

  if (status && status !== 'all') {
    query = query.eq('status', status as CsTouchpointStatus);
  } else if (due !== 'all' && !status) {
    query = query.in('status', ['open', 'snoozed']);
  }

  if (due === 'overdue') {
    query = query.in('status', ['open', 'snoozed']).lt('due_at', todayStart);
  } else if (due === 'today') {
    query = query
      .in('status', ['open', 'snoozed'])
      .gte('due_at', todayStart)
      .lte('due_at', todayEnd);
  } else if (due === 'upcoming') {
    query = query.in('status', ['open', 'snoozed']).gt('due_at', todayEnd);
  } else if (due === 'open') {
    query = query.in('status', ['open', 'snoozed']);
  }

  if (search) {
    const escaped = search.replace(/[%,()]/g, ' ');
    const { data: matchedClients } = await ctx.service
      .from('clients')
      .select('id')
      .ilike('name', `%${escaped}%`)
      .limit(50);
    const ids = (matchedClients ?? []).map(c => c.id as string);
    if (ids.length === 0) {
      return NextResponse.json({
        rows: [],
        total: 0,
        page,
        labels: CS_TOUCHPOINT_LABELS,
      });
    }
    query = query.in('client_id', ids);
  }

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    rows: data ?? [],
    total: count ?? 0,
    page,
    labels: CS_TOUCHPOINT_LABELS,
  });
}

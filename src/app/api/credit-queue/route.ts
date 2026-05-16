import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError } from '@/lib/api-auth';
import { getLiveClientIds, liveClientFilter } from '@/lib/db-helpers';

const CREDITABLE_EVENT_TYPES = ['appointment_booked', 'live_transfer', 'callback_booked'];

type CreditQueueStatus = 'uncredited' | 'credited' | 'all';

export async function GET(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;

  const { searchParams } = new URL(req.url);
  const clientId = searchParams.get('client_id');
  const liveOnly = searchParams.get('live_only') === 'true';
  const startDate = searchParams.get('start_date');
  const endDate = searchParams.get('end_date');
  const status = (searchParams.get('status') ?? 'uncredited') as CreditQueueStatus;
  const page = parseInt(searchParams.get('page') ?? '1', 10);
  const limit = 50;
  const offset = (Math.max(page, 1) - 1) * limit;

  if (!['uncredited', 'credited', 'all'].includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }

  let liveClientIds: string[] | null = null;
  if (liveOnly && !clientId) {
    liveClientIds = await getLiveClientIds(ctx.service);
  }

  let query = ctx.service
    .from('events')
    .select(
      'id, client_id, event_type, occurred_at, scheduled_at, calendar_name, lead_name, lead_phone, agent_name, clients(name)',
      { count: 'exact' }
    )
    .in('event_type', CREDITABLE_EVENT_TYPES)
    .order('occurred_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (clientId) query = query.eq('client_id', clientId);
  else if (liveClientIds) query = query.in('client_id', liveClientFilter(liveClientIds));
  if (startDate) query = query.gte('occurred_at', `${startDate}T00:00:00.000Z`);
  if (endDate) query = query.lte('occurred_at', `${endDate}T23:59:59.999Z`);
  if (status === 'uncredited') query = query.or('agent_name.is.null,agent_name.eq.');
  if (status === 'credited') query = query.not('agent_name', 'is', null).neq('agent_name', '');

  const [{ data: rows, error, count }, { data: agents, error: agentsError }, { data: userData }] = await Promise.all([
    query,
    ctx.service.from('agents').select('id, name, phone').order('name'),
    ctx.service.auth.admin.getUserById(ctx.userId),
  ]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (agentsError) return NextResponse.json({ error: agentsError.message }, { status: 500 });

  return NextResponse.json({
    rows,
    total: count,
    agents,
    currentUser: {
      id: ctx.userId,
      email: userData.user?.email ?? null,
    },
  });
}

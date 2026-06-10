import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requireAnyPermission } from '@/lib/api-auth';
import { isValidCallType } from '@/lib/client-calls';

const SELECT =
  'id, client_id, call_type, called_at, recording_url, transcript, notes, attendees, checkin_form, created_at, updated_at, clients(name)';

export async function GET(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requireAnyPermission(ctx, ['admin_clients', 'admin_billing', 'client_calls']);
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const clientId = searchParams.get('clientId');
  const callType = searchParams.get('callType');
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const search = searchParams.get('search')?.trim();
  const page = Math.max(1, Number(searchParams.get('page') ?? 1));
  const pageSize = Math.min(100, Math.max(1, Number(searchParams.get('limit') ?? 50)));
  const offset = Math.max(0, Number(searchParams.get('offset') ?? (page - 1) * pageSize));

  if (callType && !isValidCallType(callType)) {
    return NextResponse.json({ error: 'Invalid callType' }, { status: 400 });
  }

  let query = ctx.service
    .from('client_calls')
    .select(SELECT, { count: 'exact' })
    .is('deleted_at', null)
    .order('called_at', { ascending: false })
    .range(offset, offset + pageSize - 1);

  if (clientId) query = query.eq('client_id', clientId);
  if (callType) query = query.eq('call_type', callType);
  if (startDate) query = query.gte('called_at', `${startDate}T00:00:00.000Z`);
  if (endDate) query = query.lte('called_at', `${endDate}T23:59:59.999Z`);
  if (search) {
    const safe = search.replace(/[^\w\s-]/g, ' ').trim();
    if (safe) {
      const tsQuery = safe.split(/\s+/).filter(Boolean).join(' & ');
      if (tsQuery) {
        query = query.textSearch('search_vector', tsQuery, { type: 'plain' });
      } else {
        query = query.or(
          `transcript.ilike.%${safe}%,notes.ilike.%${safe}%,attendees.ilike.%${safe}%`,
        );
      }
    }
  }

  const { data, count, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ rows: data ?? [], total: count ?? 0 });
}

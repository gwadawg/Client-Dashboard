import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requirePermission } from '@/lib/api-auth';
import { replayPendingEventsForClient } from '@/lib/pending-events';

export async function POST(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requirePermission(ctx, 'admin_clients');
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const client_id = typeof body.client_id === 'string' ? body.client_id.trim() : '';
  const client_name = typeof body.client_name === 'string' ? body.client_name.trim() : '';

  if (!client_id) {
    return NextResponse.json({ error: 'client_id is required' }, { status: 400 });
  }

  const { data: client, error: clientErr } = await ctx.service
    .from('clients')
    .select('id, name, ghl_location_id')
    .eq('id', client_id)
    .maybeSingle();
  if (clientErr) return NextResponse.json({ error: clientErr.message }, { status: 500 });
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 });

  if (client_name && !client.name.toLowerCase().includes(client_name.toLowerCase().slice(0, 4))) {
    // Optional sanity check when UI passes the pending group name
  }

  try {
    const result = await replayPendingEventsForClient(ctx.service, client);
    return NextResponse.json({ success: true, client, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

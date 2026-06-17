import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requirePermission } from '@/lib/api-auth';
import { linkAcquisitionCloseFromClient } from '@/lib/acquisition-ingest';

export async function GET() {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requirePermission(ctx, 'acquisition');
  if (denied) return denied;

  const { data, error } = await ctx.service
    .from('acquisition_closes')
    .select(
      'id, lead_id, closed_at, cash_collected, offer_type, reporting_type, service_program, call_id, acquisition_leads(lead_name, email, phone)',
    )
    .eq('mapping_status', 'pending_client')
    .is('client_id', null)
    .order('closed_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: clients } = await ctx.service
    .from('clients')
    .select('id, name, email, phone');

  return NextResponse.json({
    total: data?.length ?? 0,
    closes: data ?? [],
    clients: clients ?? [],
  });
}

export async function POST(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requirePermission(ctx, 'acquisition');
  if (denied) return denied;

  const body = await req.json();
  const action = body.action as string;
  const closeId = typeof body.close_id === 'string' ? body.close_id : null;

  if (!closeId) {
    return NextResponse.json({ error: 'close_id is required' }, { status: 400 });
  }

  try {
    if (action === 'dismiss') {
      const { error } = await ctx.service
        .from('acquisition_closes')
        .update({ mapping_status: 'dismissed' })
        .eq('id', closeId);
      if (error) throw new Error(error.message);
      return NextResponse.json({ success: true });
    }

    if (action === 'assign') {
      const clientId = typeof body.client_id === 'string' ? body.client_id : null;
      if (!clientId) {
        return NextResponse.json({ error: 'client_id is required' }, { status: 400 });
      }

      const { data: close, error: closeErr } = await ctx.service
        .from('acquisition_closes')
        .select('lead_id, closed_at, reporting_type, service_program')
        .eq('id', closeId)
        .single();
      if (closeErr || !close) {
        return NextResponse.json({ error: 'Close not found' }, { status: 404 });
      }

      const clientPatch: Record<string, unknown> = {};
      if (close.reporting_type) clientPatch.reporting_type = close.reporting_type;
      if (close.service_program) clientPatch.service_program = close.service_program;
      if (Object.keys(clientPatch).length) {
        await ctx.service.from('clients').update(clientPatch).eq('id', clientId);
      }

      await ctx.service
        .from('acquisition_closes')
        .update({
          client_id: clientId,
          mapping_status: 'mapped',
        })
        .eq('id', closeId);

      if (close.lead_id) {
        await ctx.service
          .from('acquisition_leads')
          .update({ converted_client_id: clientId })
          .eq('id', close.lead_id);
      }

      await linkAcquisitionCloseFromClient(ctx.service, clientId, {
        closedAt: close.closed_at,
      });

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

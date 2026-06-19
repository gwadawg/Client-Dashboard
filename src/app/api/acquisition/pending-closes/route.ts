import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requirePermission } from '@/lib/api-auth';
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
        .select('lead_id, closed_at, reporting_type, service_program, client_id, mapping_status')
        .eq('id', closeId)
        .single();
      if (closeErr || !close) {
        return NextResponse.json({ error: 'Close not found' }, { status: 404 });
      }

      if (close.client_id === clientId && close.mapping_status === 'mapped') {
        return NextResponse.json({ success: true });
      }

      const { data: conflict } = await ctx.service
        .from('acquisition_closes')
        .select('id')
        .eq('client_id', clientId)
        .neq('id', closeId)
        .maybeSingle();
      if (conflict) {
        return NextResponse.json(
          { error: 'That client is already linked to another close' },
          { status: 409 },
        );
      }

      const clientPatch: Record<string, unknown> = {};
      if (close.reporting_type) clientPatch.reporting_type = close.reporting_type;
      if (close.service_program) clientPatch.service_program = close.service_program;
      if (Object.keys(clientPatch).length) {
        await ctx.service.from('clients').update(clientPatch).eq('id', clientId);
      }

      const { error: closeUpdateErr } = await ctx.service
        .from('acquisition_closes')
        .update({
          client_id: clientId,
          mapping_status: 'mapped',
        })
        .eq('id', closeId);
      if (closeUpdateErr) throw new Error(closeUpdateErr.message);

      if (close.lead_id) {
        const { error: leadErr } = await ctx.service
          .from('acquisition_leads')
          .update({ converted_client_id: clientId, updated_at: new Date().toISOString() })
          .eq('id', close.lead_id);
        if (leadErr) throw new Error(leadErr.message);
      }

      return NextResponse.json({ success: true });
    }

    if (action === 'restore') {
      const { data: close, error: closeErr } = await ctx.service
        .from('acquisition_closes')
        .select('client_id')
        .eq('id', closeId)
        .single();
      if (closeErr || !close) {
        return NextResponse.json({ error: 'Close not found' }, { status: 404 });
      }

      const { error } = await ctx.service
        .from('acquisition_closes')
        .update({
          mapping_status: close.client_id ? 'mapped' : 'pending_client',
        })
        .eq('id', closeId);
      if (error) throw new Error(error.message);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requirePermission } from '@/lib/api-auth';
import { assignClientToClose } from '@/lib/acquisition-close-update';
import {
  deleteAcquisitionClose,
  excludeAcquisitionClose,
  restoreAcquisitionClose,
} from '@/lib/acquisition-close-lifecycle';
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
    .is('deleted_at', null)
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
      await excludeAcquisitionClose(ctx.service, closeId);
      return NextResponse.json({ success: true });
    }

    if (action === 'assign') {
      const clientId = typeof body.client_id === 'string' ? body.client_id : null;
      if (!clientId) {
        return NextResponse.json({ error: 'client_id is required' }, { status: 400 });
      }

      try {
        await assignClientToClose(ctx.service, closeId, clientId);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        const status = message.includes('already linked') ? 409 : 404;
        return NextResponse.json({ error: message }, { status });
      }
      return NextResponse.json({ success: true });
    }

    if (action === 'restore') {
      await restoreAcquisitionClose(ctx.service, closeId);
      return NextResponse.json({ success: true });
    }

    if (action === 'delete') {
      await deleteAcquisitionClose(ctx.service, closeId);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

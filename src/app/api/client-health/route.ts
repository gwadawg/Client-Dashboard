import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requirePermission } from '@/lib/api-auth';
import { loadClientHealthBundle } from '@/lib/load-client-health';

export async function GET(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requirePermission(ctx, 'client_health');
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const start_date = searchParams.get('start_date');
  const end_date = searchParams.get('end_date');
  const live_only = searchParams.get('live_only') === 'true';

  if (!start_date || !end_date) {
    return NextResponse.json({ error: 'start_date and end_date are required' }, { status: 400 });
  }

  try {
    const bundle = await loadClientHealthBundle(ctx.service, {
      start_date,
      end_date,
      live_only,
    });
    return NextResponse.json(bundle);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

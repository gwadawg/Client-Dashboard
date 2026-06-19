import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requirePermission } from '@/lib/api-auth';
import { calculateCallQuality } from '@/lib/acquisition-call-quality';

export async function GET(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requirePermission(ctx, 'acquisition');
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  if (!from || !to) {
    return NextResponse.json({ error: 'from and to required' }, { status: 400 });
  }

  const closerFilter = searchParams.get('closer') ?? null;

  const { data, error } = await ctx.service
    .from('acquisition_calls')
    .select('id, call_type, called_at, handled_by, details')
    .gte('called_at', `${from}T00:00:00.000Z`)
    .lte('called_at', `${to}T23:59:59.999Z`)
    .not('details', 'is', null)
    .limit(5000);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const quality = calculateCallQuality(data ?? [], from, to, closerFilter);

  return NextResponse.json({ quality, from, to });
}

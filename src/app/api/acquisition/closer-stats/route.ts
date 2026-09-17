import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requirePermission } from '@/lib/api-auth';
import { DISMISSED_CLOSE_STATUS } from '@/lib/acquisition-close-filter';
import { calculateCloserMetrics } from '@/lib/acquisition-closer-metrics';
import type { OfferScope } from '@/lib/acquisition-metrics';

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

  const rawScope = searchParams.get('offer_scope');
  const offerScope: OfferScope =
    rawScope === 'skool' ? 'skool' :
    rawScope === 'all_downsells' ? 'all_downsells' :
    rawScope === 'all' ? 'all' :
    'core';

  const closerFilter = searchParams.get('closer') ?? null;

  const [callsRes, offersRes, closesRes] = await Promise.all([
    ctx.service.from('acquisition_calls')
      .select('id, call_type, called_at, status, handled_by, appointment_id, details')
      .in('call_type', ['closer', 'demo'])
      .gte('called_at', `${from}T00:00:00.000Z`)
      .lte('called_at', `${to}T23:59:59.999Z`)
      .limit(5000),
    ctx.service.from('acquisition_offers')
      .select('id, lead_id, appointment_id, offered_at, offer_type, is_closed, cash_collected, setter_name')
      .gte('offered_at', `${from}T00:00:00.000Z`)
      .lte('offered_at', `${to}T23:59:59.999Z`),
    ctx.service.from('acquisition_closes')
      .select('id, lead_id, closed_at, offer_type, cash_collected, call_id, mapping_status, close_kind, raw')
      .neq('mapping_status', DISMISSED_CLOSE_STATUS)
      .is('deleted_at', null)
      .gte('closed_at', `${from}T00:00:00.000Z`)
      .lte('closed_at', `${to}T23:59:59.999Z`),
  ]);

  if (callsRes.error) return NextResponse.json({ error: callsRes.error.message }, { status: 500 });

  let closesData = (closesRes.data ?? []) as Array<{
    id: string;
    lead_id: string | null;
    closed_at: string;
    offer_type: string | null;
    cash_collected: number | null;
    call_id?: string | null;
    mapping_status: string | null;
    close_kind?: string | null;
    raw?: Record<string, unknown> | null;
  }>;
  if (closesRes.error && /close_kind|column.*raw/i.test(closesRes.error.message)) {
    const retry = await ctx.service.from('acquisition_closes')
      .select('id, lead_id, closed_at, offer_type, cash_collected, call_id, mapping_status')
      .neq('mapping_status', DISMISSED_CLOSE_STATUS)
      .is('deleted_at', null)
      .gte('closed_at', `${from}T00:00:00.000Z`)
      .lte('closed_at', `${to}T23:59:59.999Z`);
    if (retry.error) return NextResponse.json({ error: retry.error.message }, { status: 500 });
    closesData = (retry.data ?? []) as typeof closesData;
  } else if (closesRes.error) {
    return NextResponse.json({ error: closesRes.error.message }, { status: 500 });
  }

  const closers = calculateCloserMetrics({
    calls: callsRes.data ?? [],
    offers: offersRes.data ?? [],
    closes: closesData,
    from,
    to,
    offerScope,
    closerFilter,
  });

  const namesFromCalls = (callsRes.data ?? [])
    .map(c => c.handled_by?.trim())
    .filter((s): s is string => !!s);
  const namesFromCloses = closesData
    .map(c => {
      const raw = (c as { raw?: { closer_name?: unknown } | null }).raw;
      return typeof raw?.closer_name === 'string' ? raw.closer_name.trim() : '';
    })
    .filter(Boolean);
  const allCloserNames = [...new Set([...namesFromCalls, ...namesFromCloses])].sort();

  return NextResponse.json({ closers, closer_names: allCloserNames, from, to });
}

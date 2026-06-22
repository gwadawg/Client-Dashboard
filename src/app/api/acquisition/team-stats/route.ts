import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requirePermission } from '@/lib/api-auth';
import { DISMISSED_CLOSE_STATUS } from '@/lib/acquisition-close-filter';
import { calculateSetterMetrics } from '@/lib/acquisition-team-metrics';
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

  const setterFilter = searchParams.get('setter') ?? null;

  const [apptsRes, offersRes, closesRes] = await Promise.all([
    ctx.service.from('acquisition_appointments')
      .select('id, lead_id, appointment_type, booked_at, scheduled_at, status, qualified, setter_name, how_booked')
      .or(`booked_at.gte.${from}T00:00:00.000Z,scheduled_at.gte.${from}T00:00:00.000Z`)
      .lte('scheduled_at', `${to}T23:59:59.999Z`)
      .limit(10000),
    ctx.service.from('acquisition_offers')
      .select('id, lead_id, appointment_id, offered_at, offer_type, is_closed, cash_collected, setter_name')
      .gte('offered_at', `${from}T00:00:00.000Z`)
      .lte('offered_at', `${to}T23:59:59.999Z`),
    ctx.service.from('acquisition_closes')
      .select('id, lead_id, closed_at, offer_type, cash_collected, setter_name, mapping_status')
      .neq('mapping_status', DISMISSED_CLOSE_STATUS)
      .gte('closed_at', `${from}T00:00:00.000Z`)
      .lte('closed_at', `${to}T23:59:59.999Z`),
  ]);

  if (apptsRes.error) return NextResponse.json({ error: apptsRes.error.message }, { status: 500 });

  const setters = calculateSetterMetrics({
    appointments: apptsRes.data ?? [],
    offers: offersRes.data ?? [],
    closes: (closesRes.data ?? []) as Parameters<typeof calculateSetterMetrics>[0]['closes'],
    from,
    to,
    offerScope,
    setterFilter,
  });

  // Also return unique setter names for the filter dropdown
  const allSetterNames = [...new Set(
    (apptsRes.data ?? [])
      .map(a => a.setter_name?.trim())
      .filter((s): s is string => !!s && s !== '2'),
  )].sort();

  return NextResponse.json({ setters, setter_names: allSetterNames, from, to });
}

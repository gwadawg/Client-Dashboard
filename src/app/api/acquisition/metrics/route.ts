import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requirePermission } from '@/lib/api-auth';
import { applyActiveCloseFilters } from '@/lib/acquisition-close-filter';
import { calculateAcquisitionMetrics, type OfferScope } from '@/lib/acquisition-metrics';

export async function GET(req: NextRequest) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requirePermission(ctx, 'acquisition');
  if (denied) return denied;

  const params = req.nextUrl.searchParams;
  const from = params.get('from') ?? new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const to = params.get('to') ?? new Date().toISOString().slice(0, 10);

  // offer_scope controls which offer/close types count. Defaults to 'core'.
  // Legacy include_downsells=1 maps to 'all' for backwards compat.
  const rawScope = params.get('offer_scope');
  const legacyDownsells = params.get('include_downsells') === '1';
  const offerScope: OfferScope =
    rawScope === 'skool' ? 'skool' :
    rawScope === 'all_downsells' ? 'all_downsells' :
    rawScope === 'all' ? 'all' :
    legacyDownsells ? 'all' :
    'core';

  // meta_only only affects cost denominators (CPL). Default false — use all Meta leads for CPL.
  const metaOnly = params.get('meta_only') === '1';

  const [leadsRes, apptsRes, offersRes, closesRes, spendRes] = await Promise.all([
    ctx.service.from('acquisition_leads').select('id, source, created_at, qualified')
      .gte('created_at', `${from}T00:00:00.000Z`)
      .lte('created_at', `${to}T23:59:59.999Z`),
    ctx.service.from('acquisition_appointments')
      .select('id, lead_id, appointment_type, booked_at, scheduled_at, status, qualified, setter_name, how_booked')
      .or(`booked_at.gte.${from}T00:00:00.000Z,scheduled_at.gte.${from}T00:00:00.000Z`)
      .lte('scheduled_at', `${to}T23:59:59.999Z`),
    ctx.service.from('acquisition_offers')
      .select('id, lead_id, appointment_id, offered_at, offer_type, is_closed, cash_collected, setter_name')
      .gte('offered_at', `${from}T00:00:00.000Z`)
      .lte('offered_at', `${to}T23:59:59.999Z`),
    applyActiveCloseFilters(
      ctx.service.from('acquisition_closes')
        .select('id, lead_id, closed_at, offer_type, cash_collected, mapping_status')
    )
      .gte('closed_at', `${from}T00:00:00.000Z`)
      .lte('closed_at', `${to}T23:59:59.999Z`),
    ctx.service.from('acquisition_meta_ad_insights')
      .select('insight_date, spend')
      .gte('insight_date', from)
      .lte('insight_date', to),
  ]);

  if (leadsRes.error) return NextResponse.json({ error: leadsRes.error.message }, { status: 500 });
  if (apptsRes.error) return NextResponse.json({ error: apptsRes.error.message }, { status: 500 });

  const metrics = calculateAcquisitionMetrics({
    leads: leadsRes.data ?? [],
    appointments: apptsRes.data ?? [],
    offers: offersRes.data ?? [],
    closes: closesRes.data ?? [],
    adSpend: spendRes.data ?? [],
    from,
    to,
    offerScope,
    metaOnly,
  });

  return NextResponse.json({ from, to, offer_scope: offerScope, metrics });
}

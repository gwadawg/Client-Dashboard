import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requirePermission } from '@/lib/api-auth';
import { DISMISSED_CLOSE_STATUS } from '@/lib/acquisition-close-filter';
import { calculateAcquisitionTimeseries } from '@/lib/acquisition-metrics-timeseries';
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

  const [leadsRes, apptsRes, closesRes, spendRes] = await Promise.all([
    ctx.service.from('acquisition_leads')
      .select('id, source, created_at, qualified')
      .gte('created_at', `${from}T00:00:00.000Z`)
      .lte('created_at', `${to}T23:59:59.999Z`),
    ctx.service.from('acquisition_appointments')
      .select('id, lead_id, appointment_type, booked_at, scheduled_at, status, qualified, setter_name')
      .gte('scheduled_at', `${from}T00:00:00.000Z`)
      .lte('scheduled_at', `${to}T23:59:59.999Z`),
    ctx.service.from('acquisition_closes')
      .select('id, lead_id, closed_at, offer_type, cash_collected, mapping_status')
      .neq('mapping_status', DISMISSED_CLOSE_STATUS)
      .gte('closed_at', `${from}T00:00:00.000Z`)
      .lte('closed_at', `${to}T23:59:59.999Z`),
    ctx.service.from('acquisition_meta_ad_insights')
      .select('insight_date, spend')
      .gte('insight_date', from)
      .lte('insight_date', to),
  ]);

  if (leadsRes.error) return NextResponse.json({ error: leadsRes.error.message }, { status: 500 });

  const series = calculateAcquisitionTimeseries({
    leads: leadsRes.data ?? [],
    appointments: apptsRes.data ?? [],
    closes: closesRes.data ?? [],
    adSpend: spendRes.data ?? [],
    from,
    to,
    offerScope,
  });

  return NextResponse.json({ series, from, to });
}

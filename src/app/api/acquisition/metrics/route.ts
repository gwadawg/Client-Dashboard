import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requirePermission } from '@/lib/api-auth';
import { calculateAcquisitionMetrics } from '@/lib/acquisition-metrics';

export async function GET(req: NextRequest) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requirePermission(ctx, 'acquisition');
  if (denied) return denied;

  const params = req.nextUrl.searchParams;
  const from = params.get('from') ?? new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const to = params.get('to') ?? new Date().toISOString().slice(0, 10);
  const includeDownsells = params.get('include_downsells') === '1';
  const metaOnly = params.get('meta_only') !== '0';

  const [leadsRes, apptsRes, offersRes, closesRes, spendRes] = await Promise.all([
    ctx.service.from('acquisition_leads').select('id, source, created_at, qualified'),
    ctx.service.from('acquisition_appointments').select(
      'id, lead_id, appointment_type, booked_at, scheduled_at, status, qualified, setter_name',
    ),
    ctx.service.from('acquisition_offers').select(
      'id, lead_id, appointment_id, offered_at, offer_type, is_closed, cash_collected, setter_name',
    ),
    ctx.service.from('acquisition_closes').select('id, lead_id, closed_at, offer_type'),
    ctx.service.from('acquisition_ad_insights').select('insight_date, amount_spent'),
  ]);

  if (leadsRes.error) return NextResponse.json({ error: leadsRes.error.message }, { status: 500 });

  const metrics = calculateAcquisitionMetrics({
    leads: leadsRes.data ?? [],
    appointments: apptsRes.data ?? [],
    offers: offersRes.data ?? [],
    closes: closesRes.data ?? [],
    adSpend: spendRes.data ?? [],
    from,
    to,
    includeDownsells,
    metaOnly,
  });

  return NextResponse.json({ from, to, metrics });
}

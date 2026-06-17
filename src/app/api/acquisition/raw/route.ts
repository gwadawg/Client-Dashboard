import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requirePermission } from '@/lib/api-auth';
import { enrichAppointmentsWithDemoAuditLinks } from '@/lib/acquisition-demo-audit';

const TABLE_MAP = {
  leads: 'acquisition_leads',
  appointments: 'acquisition_appointments',
  offers: 'acquisition_offers',
  closes: 'acquisition_closes',
  ads: 'acquisition_ad_insights',
  dials: 'acquisition_dials',
} as const;

export async function GET(req: NextRequest) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requirePermission(ctx, 'acquisition');
  if (denied) return denied;

  const type = req.nextUrl.searchParams.get('type') as keyof typeof TABLE_MAP | null;
  if (!type || !TABLE_MAP[type]) {
    return NextResponse.json({ error: 'type required: leads|appointments|offers|closes|ads|dials' }, { status: 400 });
  }

  const limit = Math.min(Number(req.nextUrl.searchParams.get('limit') ?? 500), 2000);
  const table = TABLE_MAP[type];
  const dateCol =
    type === 'appointments'
      ? 'booked_at'
      : type === 'offers'
        ? 'offered_at'
        : type === 'closes'
          ? 'closed_at'
          : type === 'ads'
            ? 'insight_date'
            : type === 'dials'
              ? 'occurred_at'
              : 'created_at';

  let query = ctx.service.from(table).select('*', { count: 'exact' }).order(dateCol, { ascending: false }).limit(limit);

  const from = req.nextUrl.searchParams.get('from');
  const to = req.nextUrl.searchParams.get('to');
  if (from) query = query.gte(dateCol, from);
  if (to) query = query.lte(dateCol, `${to}T23:59:59`);

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let rows = data ?? [];
  if (type === 'appointments' && rows.length > 0) {
    rows = await enrichAppointmentsWithDemoAuditLinks(ctx.service, rows);
  }

  return NextResponse.json({ type, rows, total: count ?? 0 });
}

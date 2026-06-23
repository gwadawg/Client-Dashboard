import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requirePermission } from '@/lib/api-auth';
import { enrichAppointmentsWithCloserFormLinks } from '@/lib/acquisition-closer-form';
import { enrichClosesWithCompleteness } from '@/lib/acquisition-close-enrich';
import { matchesCloseFilter, type CloseFilterMode } from '@/lib/acquisition-close-completeness';
import {
  flattenRawOfferRow,
  RAW_CLOSE_SELECT,
  RAW_OFFER_SELECT,
} from '@/lib/acquisition-raw-enriched';
import { loadDialReportStatusByDialIds } from '@/lib/acquisition-dial-linkage';

const TABLE_MAP = {
  leads: 'acquisition_leads',
  appointments: 'acquisition_appointments',
  offers: 'acquisition_offers',
  closes: 'acquisition_closes',
  ads: 'acquisition_meta_ad_insights',
  dials: 'acquisition_dials',
} as const;

type RawType = keyof typeof TABLE_MAP;

function applyDateRange<T extends { gte: (col: string, v: string) => T; lte: (col: string, v: string) => T }>(
  query: T,
  dateCol: string,
  from: string | null,
  to: string | null,
): T {
  let q = query;
  if (from) q = q.gte(dateCol, from);
  if (to) q = q.lte(dateCol, `${to}T23:59:59`);
  return q;
}

export async function GET(req: NextRequest) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requirePermission(ctx, 'acquisition');
  if (denied) return denied;

  const type = req.nextUrl.searchParams.get('type') as RawType | null;
  if (!type || !TABLE_MAP[type]) {
    return NextResponse.json({ error: 'type required: leads|appointments|offers|closes|ads|dials' }, { status: 400 });
  }

  const limit = Math.min(Number(req.nextUrl.searchParams.get('limit') ?? 500), 2000);
  const from = req.nextUrl.searchParams.get('from');
  const to = req.nextUrl.searchParams.get('to');

  if (type === 'offers') {
    const query = applyDateRange(
      ctx.service
        .from('acquisition_offers')
        .select(RAW_OFFER_SELECT, { count: 'exact' })
        .order('offered_at', { ascending: false })
        .limit(limit),
      'offered_at',
      from,
      to,
    );
    const { data, error, count } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const rows = ((data ?? []) as Record<string, unknown>[]).map(flattenRawOfferRow);
    return NextResponse.json({ type, rows, total: count ?? 0 });
  }

  if (type === 'closes') {
    const filter = (req.nextUrl.searchParams.get('filter') ?? 'all') as CloseFilterMode;
    const query = applyDateRange(
      ctx.service
        .from('acquisition_closes')
        .select(RAW_CLOSE_SELECT, { count: 'exact' })
        .order('closed_at', { ascending: false })
        .limit(limit),
      'closed_at',
      from,
      to,
    );
    const { data, error, count } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const enriched = await enrichClosesWithCompleteness(ctx.service, (data ?? []) as Record<string, unknown>[]);
    const incompleteCount = enriched.filter(
      r => r.mapping_status !== "dismissed" && r.completeness.status !== "complete",
    ).length;
    let rows = enriched;
    if (filter !== 'all') {
      rows = enriched.filter(row => matchesCloseFilter(row, filter));
    }
    const { data: clients } = await ctx.service.from('clients').select('id, name').order('name');
    return NextResponse.json({
      type,
      rows,
      total: filter === 'all' ? (count ?? 0) : rows.length,
      incomplete_count: incompleteCount,
      clients: clients ?? [],
    });
  }

  const table = TABLE_MAP[type];
  const dateCol =
    type === 'appointments'
      ? 'booked_at'
      : type === 'ads'
        ? 'insight_date'
        : type === 'dials'
          ? 'occurred_at'
          : 'created_at';

  const query = applyDateRange(
    ctx.service.from(table).select('*', { count: 'exact' }).order(dateCol, { ascending: false }).limit(limit),
    dateCol,
    from,
    to,
  );

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (type === 'dials' && (data ?? []).length > 0) {
    const dialIds = (data ?? []).map((r) => r.id as string).filter(Boolean);
    const statusByDial = await loadDialReportStatusByDialIds(ctx.service, dialIds);
    const rows = (data ?? []).map((row) => {
      const st = statusByDial.get(row.id as string);
      return {
        ...row,
        report_status: st?.documented ? 'documented' : 'missing',
        report_form_type: st?.form_type ?? null,
        report_call_id: st?.call_id ?? null,
      };
    });
    return NextResponse.json({ type, rows, total: count ?? 0 });
  }

  if (type === 'appointments' && (data ?? []).length > 0) {
    const rows = await enrichAppointmentsWithCloserFormLinks(
      ctx.service,
      (data ?? []) as Parameters<typeof enrichAppointmentsWithCloserFormLinks>[1],
    );
    return NextResponse.json({ type, rows, total: count ?? 0 });
  }

  return NextResponse.json({ type, rows: data ?? [], total: count ?? 0 });
}

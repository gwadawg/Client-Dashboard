import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requirePermission } from '@/lib/api-auth';
import { getLiveClientIds, liveClientFilter } from '@/lib/db-helpers';
import {
  aggregateAdPerformance,
  buildAdDrilldown,
  normalizeAdName,
  type AdEventRow,
  type AdMetaRow,
} from '@/lib/ad-performance';

// Funnel events we attribute to an ad (plus 'lead' which carries the ad name).
const FUNNEL_EVENT_TYPES = ['lead', 'appointment_booked', 'show', 'no_show', 'loan_funded'];

const EVENT_SELECT =
  'client_id, event_type, ghl_contact_id, lead_phone, phone_number_used, ad_name, is_qualified, is_hot, occurred_at';
const META_SELECT = 'client_id, ad_name, insight_date, spend, impressions, clicks';

type LibraryRow = {
  id: string;
  ad_name: string;
  status: string;
  platform: string | null;
  ad_format: string | null;
  product: string | null;
  summary: string | null;
  visual_notes: string | null;
  drive_url: string | null;
  thumbnail_url: string | null;
};

export async function GET(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requirePermission(ctx, 'media_buyer');
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const client_id = searchParams.get('client_id');
  const start_date = searchParams.get('start_date');
  const end_date = searchParams.get('end_date');
  const adParam = searchParams.get('ad');

  // Default to live clients only (matches the rest of the dashboard).
  let liveClientIds: string[] | null = null;
  if (!client_id) liveClientIds = await getLiveClientIds(ctx.service);

  const applyScope = <T extends { eq: (c: string, v: string) => T; in: (c: string, v: string[]) => T }>(
    q: T,
  ): T => {
    if (client_id) return q.eq('client_id', client_id);
    if (liveClientIds) return q.in('client_id', liveClientFilter(liveClientIds));
    return q;
  };

  let eventsQuery = ctx.service.from('events').select(EVENT_SELECT).in('event_type', FUNNEL_EVENT_TYPES);
  let metaQuery = ctx.service.from('meta_ad_insights').select(META_SELECT);

  eventsQuery = applyScope(eventsQuery);
  metaQuery = applyScope(metaQuery);

  if (start_date) {
    eventsQuery = eventsQuery.gte('occurred_at', `${start_date}T00:00:00.000Z`);
    metaQuery = metaQuery.gte('insight_date', start_date);
  }
  if (end_date) {
    eventsQuery = eventsQuery.lte('occurred_at', `${end_date}T23:59:59.999Z`);
    metaQuery = metaQuery.lte('insight_date', end_date);
  }
  eventsQuery = eventsQuery.limit(100000);
  metaQuery = metaQuery.limit(100000);

  const [{ data: events, error: eventsError }, { data: meta, error: metaError }, { data: library, error: libError }] =
    await Promise.all([
      eventsQuery,
      metaQuery,
      ctx.service.from('ad_library').select('id, ad_name, status, platform, ad_format, product, summary, visual_notes, drive_url, thumbnail_url'),
    ]);

  if (eventsError || metaError || libError) {
    return NextResponse.json(
      { error: eventsError?.message ?? metaError?.message ?? libError?.message },
      { status: 500 },
    );
  }

  const metaRows = (meta ?? []) as AdMetaRow[];
  const eventRows = (events ?? []) as AdEventRow[];

  // Per-ad drilldown mode.
  if (adParam) {
    const drilldown = buildAdDrilldown(adParam, metaRows, eventRows);
    const clientIds = drilldown.perClient.map((r) => r.client_id);
    let names = new Map<string, string>();
    if (clientIds.length) {
      const { data: clients } = await ctx.service
        .from('clients')
        .select('id, name')
        .in('id', clientIds);
      names = new Map((clients ?? []).map((c) => [c.id, c.name]));
    }
    return NextResponse.json({
      ...drilldown,
      perClient: drilldown.perClient.map((r) => ({
        ...r,
        client_name: names.get(r.client_id) ?? '—',
      })),
    });
  }

  // Leaderboard mode: merge in ad_library metadata by ad name.
  const libByName = new Map<string, LibraryRow>();
  for (const row of (library ?? []) as LibraryRow[]) {
    const name = normalizeAdName(row.ad_name);
    if (name) libByName.set(name.toLowerCase(), row);
  }

  const ads = aggregateAdPerformance(metaRows, eventRows).map((ad) => {
    const lib = libByName.get(ad.ad_name.toLowerCase()) ?? null;
    return {
      ...ad,
      library: lib
        ? {
            id: lib.id,
            status: lib.status,
            ad_format: lib.ad_format,
            product: lib.product,
            summary: lib.summary,
            visual_notes: lib.visual_notes,
            drive_url: lib.drive_url,
            thumbnail_url: lib.thumbnail_url,
          }
        : null,
    };
  });

  return NextResponse.json({ ads });
}

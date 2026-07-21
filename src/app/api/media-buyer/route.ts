import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requirePermission } from '@/lib/api-auth';
import { getLiveClientIds, liveClientFilter } from '@/lib/db-helpers';
import {
  AdLibraryResolver,
  aggregateAdPerformance,
  buildAdDrilldown,
  buildMultiAdDrilldown,
  rollupAdPerformanceByLibrary,
  type AdEventRow,
  type AdLibraryAliasRow,
  type AdLibraryMeta,
  type AdMetaRow,
} from '@/lib/ad-performance';
import { createTtlCache } from '@/lib/ttl-cache';

// Funnel events we attribute to an ad (plus 'lead' which carries the ad name).
const FUNNEL_EVENT_TYPES = ['lead', 'appointment_booked', 'show', 'no_show', 'loan_funded'];

const EVENT_SELECT =
  'client_id, event_type, ghl_contact_id, lead_phone, phone_number_used, ad_name, is_qualified, is_hot, occurred_at';
const META_SELECT = 'client_id, ad_name, insight_date, spend, impressions, clicks';

const LIBRARY_SELECT =
  'id, ad_name, status, platform, ad_format, product, summary, visual_notes, drive_url, thumbnail_url';

const mediaBuyerCache = createTtlCache<unknown>(45_000);

function stripClientIds<T extends { client_ids?: string[] }>(row: T): Omit<T, 'client_ids'> {
  const { client_ids: _omit, ...rest } = row;
  return rest;
}

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
  const libraryIdParam = searchParams.get('library_id');

  const cacheKey = [
    client_id ?? '',
    start_date ?? '',
    end_date ?? '',
    adParam ?? '',
    libraryIdParam ?? '',
  ].join('|');
  const cached = mediaBuyerCache.get(cacheKey);
  if (cached) {
    return NextResponse.json(cached, {
      headers: { 'Cache-Control': 'private, max-age=20' },
    });
  }

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

  const [
    { data: events, error: eventsError },
    { data: meta, error: metaError },
    { data: library, error: libError },
    { data: aliases, error: aliasError },
  ] = await Promise.all([
    eventsQuery,
    metaQuery,
    ctx.service.from('ad_library').select(LIBRARY_SELECT),
    ctx.service.from('ad_library_aliases').select('id, library_id, alias_name'),
  ]);

  if (eventsError || metaError || libError || aliasError) {
    return NextResponse.json(
      { error: eventsError?.message ?? metaError?.message ?? libError?.message ?? aliasError?.message },
      { status: 500 },
    );
  }

  const metaRows = (meta ?? []) as AdMetaRow[];
  const eventRows = (events ?? []) as AdEventRow[];
  const libraryRows = (library ?? []) as AdLibraryMeta[];
  const aliasRows = (aliases ?? []) as AdLibraryAliasRow[];
  const resolver = new AdLibraryResolver(libraryRows, aliasRows);

  const respond = (payload: unknown) => {
    mediaBuyerCache.set(cacheKey, payload);
    return NextResponse.json(payload, {
      headers: { 'Cache-Control': 'private, max-age=20' },
    });
  };

  const attachClientNames = async (
    drilldown: ReturnType<typeof buildAdDrilldown>,
  ) => {
    const clientIds = drilldown.perClient.map((r) => r.client_id);
    let names = new Map<string, string>();
    if (clientIds.length) {
      const { data: clients } = await ctx.service
        .from('clients')
        .select('id, name')
        .in('id', clientIds);
      names = new Map((clients ?? []).map((c) => [c.id, c.name]));
    }
    return {
      ...drilldown,
      perClient: drilldown.perClient.map((r) => ({
        ...r,
        client_name: names.get(r.client_id) ?? '—',
      })),
    };
  };

  if (libraryIdParam) {
    const lib = libraryRows.find((l) => l.id === libraryIdParam);
    if (!lib) {
      return NextResponse.json({ error: 'Library entry not found' }, { status: 404 });
    }
    const variantNames = resolver.variantNamesFor(lib.id, lib.ad_name);
    const drilldown = buildMultiAdDrilldown(lib.ad_name, variantNames, metaRows, eventRows, lib.id);
    return respond(await attachClientNames(drilldown));
  }

  if (adParam) {
    const drilldown = buildAdDrilldown(adParam, metaRows, eventRows);
    return respond(await attachClientNames(drilldown));
  }

  const perName = aggregateAdPerformance(metaRows, eventRows);
  const ads = rollupAdPerformanceByLibrary(perName, resolver).map((row) => {
    const stripped = stripClientIds(row);
    if (row.library) {
      return {
        ...stripped,
        library: {
          id: row.library.id,
          status: row.library.status,
          ad_format: row.library.ad_format,
          product: row.library.product,
          summary: row.library.summary,
          visual_notes: row.library.visual_notes,
          drive_url: row.library.drive_url,
          thumbnail_url: row.library.thumbnail_url,
        },
      };
    }
    return stripped;
  });

  return respond({ ads });
}

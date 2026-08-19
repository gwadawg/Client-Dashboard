import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requirePermission } from '@/lib/api-auth';
import { getLiveClientIds, liveClientFilter } from '@/lib/db-helpers';
import {
  AdLibraryResolver,
  type AdEventRow,
  type AdLibraryAliasRow,
  type AdLibraryMeta,
  type AdMetaRow,
} from '@/lib/ad-performance';
import { buildCreativeIntel } from '@/lib/ad-creative-intel';
import { createTtlCache } from '@/lib/ttl-cache';
import { tagsByLibraryId } from '@/lib/ad-tags-db';

// Same funnel surface as the leaderboard, so both views agree on every number.
const FUNNEL_EVENT_TYPES = [
  'lead',
  'appointment_booked',
  'show',
  'no_show',
  'claimed',
  'live_transfer',
  'proposal_made',
  'proposal_sent',
  'submission_made',
  'loan_processing',
  'loan_funded',
  'closed',
];

const EVENT_SELECT =
  'client_id, event_type, ghl_contact_id, lead_phone, phone_number_used, lead_email, lead_name, ad_name, is_qualified, is_hot, occurred_at';
const META_SELECT = 'client_id, ad_name, insight_date, spend, impressions, clicks';
const LIBRARY_SELECT =
  'id, ad_name, status, platform, ad_format, product, summary, visual_notes, drive_url, thumbnail_url';

const ROW_LIMIT = 100000;

const overviewCache = createTtlCache<unknown>(45_000);

export async function GET(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requirePermission(ctx, 'media_buyer');
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const client_id = searchParams.get('client_id');
  const start_date = searchParams.get('start_date');
  const end_date = searchParams.get('end_date');

  const cacheKey = [client_id ?? '', start_date ?? '', end_date ?? ''].join('|');
  const cached = overviewCache.get(cacheKey);
  if (cached) {
    return NextResponse.json(cached, { headers: { 'Cache-Control': 'private, max-age=20' } });
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
  eventsQuery = eventsQuery.limit(ROW_LIMIT);
  metaQuery = metaQuery.limit(ROW_LIMIT);

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

  const eventRows = (events ?? []) as AdEventRow[];
  const metaRows = (meta ?? []) as AdMetaRow[];
  const libraryRows = (library ?? []) as AdLibraryMeta[];
  const aliasRows = (aliases ?? []) as AdLibraryAliasRow[];

  // Tags have to ride on the library meta itself: concept clusters are grouped by
  // product x tag, and the rollup carries `library` through by reference.
  const tagLookup = await tagsByLibraryId(
    ctx.service,
    libraryRows.map((row) => row.id),
  );
  for (const row of libraryRows) {
    row.tags = tagLookup.data.get(row.id) ?? [];
  }

  const report = buildCreativeIntel({
    metaRows,
    events: eventRows,
    resolver: new AdLibraryResolver(libraryRows, aliasRows),
    start: start_date,
    end: end_date,
  });

  // A silent cap would under-report spend and mislabel ads as stopped, so say so.
  const payload = {
    ...report,
    truncated: eventRows.length >= ROW_LIMIT || metaRows.length >= ROW_LIMIT,
  };

  overviewCache.set(cacheKey, payload);
  return NextResponse.json(payload, { headers: { 'Cache-Control': 'private, max-age=20' } });
}

/**
 * Shared Media Buyer window load for Creative Command + Ad Performance.
 * In-flight requests coalesce; only the compact derived board is TTL-cached
 * (raw events/meta are too large to retain on Railway isolates).
 */

import {
  AdLibraryResolver,
  aggregateAdPerformance,
  rollupAdPerformanceByLibrary,
  type AdEventRow,
  type AdLibraryAliasRow,
  type AdLibraryMeta,
  type AdMetaRow,
  type RolledUpAdPerformanceRow,
  normalizeAdName,
} from '@/lib/ad-performance';
import { buildCreativeIntel } from '@/lib/ad-creative-intel';
import type { CreativeIntelReport } from '@/lib/ad-creative-lenses';
import { eventPhone, normalizePhone } from '@/lib/contact-key';
import { isClientLogFormRaw, parseDqReasonSlugs } from '@/lib/dq-reasons';
import { getLiveClientIds, liveClientFilter } from '@/lib/db-helpers';
import { tagsByLibraryId } from '@/lib/ad-tags-db';
import type { AdTagRef } from '@/lib/ad-tags';
import { createTtlCache } from '@/lib/ttl-cache';
import type { createServiceClient } from '@/lib/supabase';

type ServiceClient = ReturnType<typeof createServiceClient>;

export const FUNNEL_EVENT_TYPES = [
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
] as const;

export const EVENT_SELECT =
  'client_id, event_type, ghl_contact_id, lead_phone, phone_number_used, lead_email, lead_name, ad_name, utm_content, is_qualified, is_hot, occurred_at';

/** Manual DQ only — `raw` stays off the shared funnel select. */
export const DQ_EVENT_SELECT =
  'client_id, ghl_contact_id, lead_phone, phone_number_used, lead_email, lead_name, ad_name, utm_content, occurred_at, raw';

type ManualDqDbRow = {
  client_id?: string | null;
  ghl_contact_id?: string | null;
  lead_phone?: string | null;
  phone_number_used?: string | null;
  lead_email?: string | null;
  lead_name?: string | null;
  ad_name?: string | null;
  utm_content?: string | null;
  occurred_at?: string | null;
  raw?: unknown;
};

/** Form DQs only. Webhook disqualifications are a different process. */
export function formManualDqEvent(row: ManualDqDbRow): AdEventRow | null {
  if (!isClientLogFormRaw(row.raw)) return null;
  return {
    client_id: row.client_id,
    event_type: 'manual_dq',
    ghl_contact_id: row.ghl_contact_id,
    lead_phone: row.lead_phone,
    phone_number_used: row.phone_number_used,
    lead_email: row.lead_email,
    lead_name: row.lead_name,
    ad_name: row.ad_name,
    utm_content: row.utm_content,
    occurred_at: row.occurred_at,
    dq_reasons: parseDqReasonSlugs(row.raw),
  };
}

export const META_SELECT = 'client_id, ad_name, insight_date, spend, impressions, clicks';

export const LIBRARY_SELECT =
  'id, ad_name, status, platform, ad_format, product, summary, visual_notes, drive_url, thumbnail_url';

export const ROW_LIMIT = 100_000;

/** Soft cap for contact follow-up on drilldown — keeps the second query bounded. */
const DRILLDOWN_CONTACT_CAP = 2_000;
const IN_CHUNK = 150;

export type MediaBuyerScope = {
  clientId?: string | null;
  startDate?: string | null;
  endDate?: string | null;
};

export type MediaBuyerWindow = {
  events: AdEventRow[];
  meta: AdMetaRow[];
  library: AdLibraryMeta[];
  aliases: AdLibraryAliasRow[];
  tagsById: Map<string, AdTagRef[]>;
  truncated: boolean;
};

/** Leaderboard row as returned by GET /api/media-buyer (client_ids stripped). */
export type MediaBuyerAdRow = Omit<RolledUpAdPerformanceRow, 'client_ids'>;

export type MediaBuyerBoard = {
  ads: MediaBuyerAdRow[];
  overview: CreativeIntelReport;
  truncated: boolean;
};

/**
 * Derived board only — never TTL-cache the raw 100k events/meta rows. Keeping
 * those in heap across requests OOMs small Railway isolates and the proxy then
 * returns an empty body ("Unexpected end of JSON input" in the browser).
 */
const boardCache = createTtlCache<MediaBuyerBoard>(45_000);
const windowInflight = new Map<string, Promise<{ data?: MediaBuyerWindow; error?: string }>>();
const boardInflight = new Map<string, Promise<{ data?: MediaBuyerBoard; error?: string }>>();

function scopeKey(scope: MediaBuyerScope): string {
  return [scope.clientId ?? '', scope.startDate ?? '', scope.endDate ?? ''].join('|');
}

type Scopeable = {
  eq: (c: string, v: string) => Scopeable;
  in: (c: string, v: string[]) => Scopeable;
  gte: (c: string, v: string) => Scopeable;
  lte: (c: string, v: string) => Scopeable;
  limit: (n: number) => Scopeable;
  or: (filters: string) => Scopeable;
};

type ClientScope = { kind: 'one'; id: string } | { kind: 'live'; ids: string[] };

/**
 * Resolve live client ids once. Do NOT return a Supabase builder from an async
 * function — builders are thenable, so `return query.eq(...)` gets awaited into
 * `{ data, error }` and the next `.gte` throws "i.gte is not a function".
 */
async function resolveClientScope(
  service: ServiceClient,
  clientId?: string | null,
): Promise<ClientScope> {
  if (clientId) return { kind: 'one', id: clientId };
  const live = await getLiveClientIds(service);
  return { kind: 'live', ids: liveClientFilter(live) };
}

function applyClientScope(query: Scopeable, scope: ClientScope): Scopeable {
  return scope.kind === 'one'
    ? query.eq('client_id', scope.id)
    : query.in('client_id', scope.ids);
}

function withDateRange(
  query: Scopeable,
  column: string,
  startDate?: string | null,
  endDate?: string | null,
  asTimestamp = false,
): Scopeable {
  let q = query;
  if (startDate) {
    q = q.gte(column, asTimestamp ? `${startDate}T00:00:00.000Z` : startDate);
  }
  if (endDate) {
    q = q.lte(column, asTimestamp ? `${endDate}T23:59:59.999Z` : endDate);
  }
  return q;
}

function chunk<T>(items: T[], size: number): T[][] {
  if (items.length === 0) return [];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Unique, non-empty ad names for PostgREST `.in()` filters. */
export function uniqueAdNames(names: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of names) {
    const n = normalizeAdName(raw);
    if (!n) continue;
    const key = n.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(n);
  }
  return out;
}

type QueryResult<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

/**
 * Raw window for one request. Concurrent callers share one in-flight Promise;
 * nothing is retained after it settles (see loadMediaBuyerBoard for the TTL).
 */
export async function loadMediaBuyerWindow(
  service: ServiceClient,
  scope: MediaBuyerScope,
): Promise<{ data?: MediaBuyerWindow; error?: string }> {
  const key = scopeKey(scope);
  const existing = windowInflight.get(key);
  if (existing) return existing;

  const pending = (async () => {
    try {
      // Query builders are cast to a narrow Scopeable so Supabase's deep generics
      // do not blow the compiler when we chain scope + date + limit.
      let eventsQuery: Scopeable = service
        .from('events')
        .select(EVENT_SELECT)
        .in('event_type', [...FUNNEL_EVENT_TYPES]) as unknown as Scopeable;
      let dqQuery: Scopeable = service
        .from('events')
        .select(DQ_EVENT_SELECT)
        .eq('event_type', 'manual_dq') as unknown as Scopeable;
      let metaQuery: Scopeable = service
        .from('meta_ad_insights')
        .select(META_SELECT) as unknown as Scopeable;

      const clients = await resolveClientScope(service, scope.clientId);
      eventsQuery = applyClientScope(eventsQuery, clients);
      dqQuery = applyClientScope(dqQuery, clients);
      metaQuery = applyClientScope(metaQuery, clients);
      eventsQuery = withDateRange(eventsQuery, 'occurred_at', scope.startDate, scope.endDate, true);
      dqQuery = withDateRange(dqQuery, 'occurred_at', scope.startDate, scope.endDate, true);
      metaQuery = withDateRange(metaQuery, 'insight_date', scope.startDate, scope.endDate, false);
      eventsQuery = eventsQuery.limit(ROW_LIMIT);
      dqQuery = dqQuery.limit(ROW_LIMIT);
      metaQuery = metaQuery.limit(ROW_LIMIT);

      const [
        { data: events, error: eventsError },
        { data: dqRows, error: dqError },
        { data: meta, error: metaError },
        { data: library, error: libError },
        { data: aliases, error: aliasError },
      ] = await Promise.all([
        eventsQuery as unknown as QueryResult<AdEventRow>,
        dqQuery as unknown as QueryResult<ManualDqDbRow>,
        metaQuery as unknown as QueryResult<AdMetaRow>,
        service.from('ad_library').select(LIBRARY_SELECT),
        service.from('ad_library_aliases').select('id, library_id, alias_name'),
      ]);

      if (eventsError || dqError || metaError || libError || aliasError) {
        return {
          error:
            eventsError?.message ??
            dqError?.message ??
            metaError?.message ??
            libError?.message ??
            aliasError?.message ??
            'Failed to load media buyer window',
        };
      }

      const manualDqs = ((dqRows ?? []) as ManualDqDbRow[])
        .map(formManualDqEvent)
        .filter((row): row is AdEventRow => row != null);

      const libraryRows = (library ?? []) as AdLibraryMeta[];
      const tagLookup = await tagsByLibraryId(
        service,
        libraryRows.map((row) => row.id),
      );

      return {
        data: {
          events: [...((events ?? []) as AdEventRow[]), ...manualDqs],
          meta: (meta ?? []) as AdMetaRow[],
          library: libraryRows,
          aliases: (aliases ?? []) as AdLibraryAliasRow[],
          tagsById: tagLookup.data,
          truncated:
            (events?.length ?? 0) >= ROW_LIMIT ||
            (dqRows?.length ?? 0) >= ROW_LIMIT ||
            (meta?.length ?? 0) >= ROW_LIMIT,
        },
      };
    } catch (e) {
      return {
        error: e instanceof Error ? e.message : 'Failed to load media buyer window',
      };
    }
  })().finally(() => {
    windowInflight.delete(key);
  });

  windowInflight.set(key, pending);
  return pending;
}

function stripClientIds<T extends { client_ids?: string[] }>(row: T): Omit<T, 'client_ids'> {
  const rest = { ...row };
  delete rest.client_ids;
  return rest;
}

/**
 * Compact board shared by Creative Command + Ad Performance. One DB pull builds
 * both payloads; only this result is TTL-cached (not the raw event/meta arrays).
 */
export async function loadMediaBuyerBoard(
  service: ServiceClient,
  scope: MediaBuyerScope,
): Promise<{ data?: MediaBuyerBoard; error?: string }> {
  const key = scopeKey(scope);
  const cached = boardCache.get(key);
  if (cached) return { data: cached };

  const existing = boardInflight.get(key);
  if (existing) return existing;

  const pending = (async () => {
    try {
      const window = await loadMediaBuyerWindow(service, scope);
      if (window.error || !window.data) {
        return { error: window.error ?? 'Failed to load' };
      }

      const { events, meta, library, aliases, tagsById, truncated } = window.data;
      for (const row of library) {
        row.tags = tagsById.get(row.id) ?? [];
      }

      const resolver = new AdLibraryResolver(library, aliases);
      const perName = aggregateAdPerformance(meta, events);
      const ads: MediaBuyerAdRow[] = rollupAdPerformanceByLibrary(perName, resolver).map((row) => {
        const stripped = stripClientIds(row);
        if (row.library) {
          return {
            ...stripped,
            library: {
              ...row.library,
              tags: tagsById.get(row.library.id) ?? [],
            },
          };
        }
        return stripped;
      });

      const overview = buildCreativeIntel({
        metaRows: meta,
        events,
        resolver,
        start: scope.startDate,
        end: scope.endDate,
      });

      const board: MediaBuyerBoard = { ads, overview, truncated };
      boardCache.set(key, board);
      return { data: board };
    } catch (e) {
      return {
        error: e instanceof Error ? e.message : 'Failed to build media buyer board',
      };
    }
  })().finally(() => {
    boardInflight.delete(key);
  });

  boardInflight.set(key, pending);
  return pending;
}

export type MediaBuyerDrilldownRows = {
  events: AdEventRow[];
  meta: AdMetaRow[];
  truncated: boolean;
};

/**
 * Drilldown load scoped to one creative's Facebook names. Meta is filtered by
 * name; events are the named rows plus a follow-up for contacts those leads
 * produced, so funnel steps without an ad_name still attribute correctly.
 */
export async function loadMediaBuyerDrilldownRows(
  service: ServiceClient,
  scope: MediaBuyerScope,
  adNames: string[],
): Promise<{ data?: MediaBuyerDrilldownRows; error?: string }> {
  const names = uniqueAdNames(adNames);
  if (names.length === 0) {
    return { data: { events: [], meta: [], truncated: false } };
  }

  let metaQuery: Scopeable = service
    .from('meta_ad_insights')
    .select(META_SELECT)
    .in('ad_name', names) as unknown as Scopeable;
  const clients = await resolveClientScope(service, scope.clientId);
  metaQuery = applyClientScope(metaQuery, clients);
  metaQuery = withDateRange(metaQuery, 'insight_date', scope.startDate, scope.endDate, false);
  metaQuery = metaQuery.limit(ROW_LIMIT);

  let namedByAdQuery: Scopeable = service
    .from('events')
    .select(EVENT_SELECT)
    .in('event_type', [...FUNNEL_EVENT_TYPES])
    .in('ad_name', names) as unknown as Scopeable;
  namedByAdQuery = applyClientScope(namedByAdQuery, clients);
  namedByAdQuery = withDateRange(
    namedByAdQuery,
    'occurred_at',
    scope.startDate,
    scope.endDate,
    true,
  );
  namedByAdQuery = namedByAdQuery.limit(ROW_LIMIT);

  let namedByUtmQuery: Scopeable = service
    .from('events')
    .select(EVENT_SELECT)
    .in('event_type', [...FUNNEL_EVENT_TYPES])
    .in('utm_content', names) as unknown as Scopeable;
  namedByUtmQuery = applyClientScope(namedByUtmQuery, clients);
  namedByUtmQuery = withDateRange(
    namedByUtmQuery,
    'occurred_at',
    scope.startDate,
    scope.endDate,
    true,
  );
  namedByUtmQuery = namedByUtmQuery.limit(ROW_LIMIT);

  const [
    { data: meta, error: metaError },
    { data: namedByAd, error: namedAdError },
    { data: namedByUtm, error: namedUtmError },
  ] = await Promise.all([
    metaQuery as unknown as QueryResult<AdMetaRow>,
    namedByAdQuery as unknown as QueryResult<AdEventRow>,
    namedByUtmQuery as unknown as QueryResult<AdEventRow>,
  ]);

  if (metaError || namedAdError || namedUtmError) {
    return {
      error:
        metaError?.message ??
        namedAdError?.message ??
        namedUtmError?.message ??
        'Drilldown query failed',
    };
  }

  const seedEvents = [...(namedByAd ?? []), ...(namedByUtm ?? [])] as AdEventRow[];
  const ghlIds: string[] = [];
  const rawPhones: string[] = [];
  const seenGhl = new Set<string>();
  const seenPhone = new Set<string>();

  for (const e of seedEvents) {
    if (ghlIds.length + rawPhones.length >= DRILLDOWN_CONTACT_CAP) break;
    const ghl = e.ghl_contact_id?.trim();
    if (ghl && !seenGhl.has(ghl)) {
      seenGhl.add(ghl);
      ghlIds.push(ghl);
      continue;
    }
    // Use the raw stored phone so PostgREST `.in()` matches the column value;
    // normalized digits would miss formatted numbers in the table.
    for (const raw of [e.lead_phone, e.phone_number_used]) {
      const phone = raw?.trim();
      if (!phone) continue;
      const phoneKey = normalizePhone(phone) || phone;
      if (seenPhone.has(phoneKey)) continue;
      seenPhone.add(phoneKey);
      rawPhones.push(phone);
      break;
    }
  }

  const byStamp = new Map<string, AdEventRow>();
  const remember = (row: AdEventRow) => {
    const stamp = [
      row.client_id ?? '',
      row.event_type,
      row.occurred_at ?? '',
      row.ghl_contact_id ?? '',
      eventPhone(row) ?? '',
      row.ad_name ?? '',
    ].join('|');
    if (!byStamp.has(stamp)) byStamp.set(stamp, row);
  };
  for (const row of seedEvents) remember(row);

  // Follow-up: funnel events for the same contacts that may not carry ad_name.
  for (const idChunk of chunk(ghlIds, IN_CHUNK)) {
    let q: Scopeable = service
      .from('events')
      .select(EVENT_SELECT)
      .in('event_type', [...FUNNEL_EVENT_TYPES])
      .in('ghl_contact_id', idChunk) as unknown as Scopeable;
    q = applyClientScope(q, clients);
    q = withDateRange(q, 'occurred_at', scope.startDate, scope.endDate, true);
    q = q.limit(ROW_LIMIT);
    const { data, error } = await (q as unknown as QueryResult<AdEventRow>);
    if (error) return { error: error.message };
    for (const row of (data ?? []) as AdEventRow[]) remember(row);
  }

  for (const phoneChunk of chunk(rawPhones, IN_CHUNK)) {
    // Quote values — ad phones are digits/punctuation, but keep the filter safe.
    const list = phoneChunk.map((p) => `"${p.replace(/"/g, '')}"`).join(',');
    let q: Scopeable = service
      .from('events')
      .select(EVENT_SELECT)
      .in('event_type', [...FUNNEL_EVENT_TYPES])
      .or(`lead_phone.in.(${list}),phone_number_used.in.(${list})`) as unknown as Scopeable;
    q = applyClientScope(q, clients);
    q = withDateRange(q, 'occurred_at', scope.startDate, scope.endDate, true);
    q = q.limit(ROW_LIMIT);
    const { data, error } = await (q as unknown as QueryResult<AdEventRow>);
    if (error) return { error: error.message };
    for (const row of (data ?? []) as AdEventRow[]) remember(row);
  }

  // Form DQs for those contacts. Attribution uses the lead's ad, not the
  // snapshot copied onto the DQ row, so this is not filtered by ad name.
  const rememberDq = (rows: ManualDqDbRow[]) => {
    for (const row of rows) {
      const ev = formManualDqEvent(row);
      if (ev) remember(ev);
    }
  };

  for (const idChunk of chunk(ghlIds, IN_CHUNK)) {
    let q: Scopeable = service
      .from('events')
      .select(DQ_EVENT_SELECT)
      .eq('event_type', 'manual_dq')
      .in('ghl_contact_id', idChunk) as unknown as Scopeable;
    q = applyClientScope(q, clients);
    q = withDateRange(q, 'occurred_at', scope.startDate, scope.endDate, true);
    q = q.limit(ROW_LIMIT);
    const { data, error } = await (q as unknown as QueryResult<ManualDqDbRow>);
    if (error) return { error: error.message };
    rememberDq((data ?? []) as ManualDqDbRow[]);
  }

  for (const phoneChunk of chunk(rawPhones, IN_CHUNK)) {
    const list = phoneChunk.map((p) => `"${p.replace(/"/g, '')}"`).join(',');
    let q: Scopeable = service
      .from('events')
      .select(DQ_EVENT_SELECT)
      .eq('event_type', 'manual_dq')
      .or(`lead_phone.in.(${list}),phone_number_used.in.(${list})`) as unknown as Scopeable;
    q = applyClientScope(q, clients);
    q = withDateRange(q, 'occurred_at', scope.startDate, scope.endDate, true);
    q = q.limit(ROW_LIMIT);
    const { data, error } = await (q as unknown as QueryResult<ManualDqDbRow>);
    if (error) return { error: error.message };
    rememberDq((data ?? []) as ManualDqDbRow[]);
  }

  const events = [...byStamp.values()];
  const metaRows = (meta ?? []) as AdMetaRow[];

  return {
    data: {
      events,
      meta: metaRows,
      truncated:
        metaRows.length >= ROW_LIMIT ||
        seedEvents.length >= ROW_LIMIT ||
        events.length >= ROW_LIMIT,
    },
  };
}

/** Resolve one library row + its aliases without loading the whole catalog. */
export async function loadLibraryVariants(
  service: ServiceClient,
  libraryId: string,
): Promise<{
  data?: { library: AdLibraryMeta; variantNames: string[] };
  error?: string;
  status?: number;
}> {
  const [{ data: lib, error: libError }, { data: aliases, error: aliasError }] =
    await Promise.all([
      service.from('ad_library').select(LIBRARY_SELECT).eq('id', libraryId).maybeSingle(),
      service
        .from('ad_library_aliases')
        .select('id, library_id, alias_name')
        .eq('library_id', libraryId),
    ]);

  if (libError || aliasError) {
    return { error: libError?.message ?? aliasError?.message, status: 500 };
  }
  if (!lib) return { error: 'Library entry not found', status: 404 };

  const library = lib as AdLibraryMeta;
  const variantNames = uniqueAdNames([
    library.ad_name,
    ...((aliases ?? []) as AdLibraryAliasRow[]).map((a) => a.alias_name),
  ]);

  return { data: { library, variantNames } };
}

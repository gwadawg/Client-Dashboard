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
  'client_id, event_type, ghl_contact_id, lead_phone, phone_number_used, lead_email, lead_name, ad_name, utm_content, is_qualified, is_hot, occurred_at, lead_id';

/** Manual DQ only — `raw` stays off the shared funnel select. */
export const DQ_EVENT_SELECT =
  'client_id, ghl_contact_id, lead_phone, phone_number_used, lead_email, lead_name, ad_name, utm_content, occurred_at, raw, lead_id';

type LeadAdEmbed =
  | { utm_content?: string | null; ad_name?: string | null }
  | { utm_content?: string | null; ad_name?: string | null }[]
  | null;

type DbEventRow = {
  client_id?: string | null;
  event_type?: string;
  ghl_contact_id?: string | null;
  lead_phone?: string | null;
  phone_number_used?: string | null;
  lead_email?: string | null;
  lead_name?: string | null;
  ad_name?: string | null;
  utm_content?: string | null;
  is_qualified?: boolean | null;
  is_hot?: boolean | null;
  occurred_at?: string | null;
  lead_id?: string | null;
  leads?: LeadAdEmbed;
  raw?: unknown;
  dq_reasons?: string[] | null;
  lead_utm_content?: string | null;
  lead_ad_name?: string | null;
};

export type LeadMilestoneRow = {
  id: string;
  client_id: string;
  utm_content: string | null;
  ad_name: string | null;
  conversation_at: string | null;
  proposal_at: string | null;
  submission_at: string | null;
  funded_at: string | null;
};

const MILESTONE_SELECT =
  'id, client_id, utm_content, ad_name, conversation_at, proposal_at, submission_at, funded_at';

type ManualDqDbRow = DbEventRow;

function leadAdOf(row: { leads?: LeadAdEmbed }): { utm_content?: string | null; ad_name?: string | null } | null {
  if (!row.leads) return null;
  return Array.isArray(row.leads) ? (row.leads[0] ?? null) : row.leads;
}

/** Flatten the lead embed and keep the lead's first-touch ad on the event. */
export function toAdEvent(row: DbEventRow, skipStageRollup = false): AdEventRow {
  const lead = leadAdOf(row);
  return {
    client_id: row.client_id,
    event_type: row.event_type ?? '',
    ghl_contact_id: row.ghl_contact_id,
    lead_phone: row.lead_phone,
    phone_number_used: row.phone_number_used,
    lead_email: row.lead_email,
    lead_name: row.lead_name,
    ad_name: row.ad_name,
    utm_content: row.utm_content,
    is_qualified: row.is_qualified,
    is_hot: row.is_hot,
    occurred_at: row.occurred_at,
    dq_reasons: row.dq_reasons,
    lead_id: row.lead_id ?? null,
    lead_utm_content: lead?.utm_content ?? row.lead_utm_content ?? null,
    lead_ad_name: lead?.ad_name ?? row.lead_ad_name ?? null,
    skip_stage_rollup: skipStageRollup,
  };
}

function milestoneInstantInRange(
  at: string | null,
  startDate?: string | null,
  endDate?: string | null,
): at is string {
  if (!at) return false;
  if (startDate && at < `${startDate}T00:00:00.000Z`) return false;
  if (endDate && at > `${endDate}T23:59:59.999Z`) return false;
  return true;
}

/** One row per stage whose date falls in the window, attributed to the lead's ad. */
export function milestoneAdEvents(
  leads: LeadMilestoneRow[],
  startDate?: string | null,
  endDate?: string | null,
): AdEventRow[] {
  const out: AdEventRow[] = [];
  for (const lead of leads) {
    const base: AdEventRow = {
      client_id: lead.client_id,
      event_type: '',
      lead_id: lead.id,
      lead_utm_content: lead.utm_content,
      lead_ad_name: lead.ad_name,
    };
    const push = (event_type: string, occurred_at: string) => {
      out.push({ ...base, event_type, occurred_at });
    };
    if (milestoneInstantInRange(lead.conversation_at, startDate, endDate)) {
      push('milestone_conversation', lead.conversation_at);
    }
    if (milestoneInstantInRange(lead.proposal_at, startDate, endDate)) {
      push('milestone_proposal', lead.proposal_at);
    }
    if (milestoneInstantInRange(lead.submission_at, startDate, endDate)) {
      push('milestone_submission', lead.submission_at);
    }
    if (milestoneInstantInRange(lead.funded_at, startDate, endDate)) {
      push('milestone_funded', lead.funded_at);
    }
  }
  return out;
}

/** Form DQs only. Webhook disqualifications are a different process. */
export function formManualDqEvent(row: ManualDqDbRow): AdEventRow | null {
  if (!isClientLogFormRaw(row.raw)) return null;
  return toAdEvent(
    {
      ...row,
      event_type: 'manual_dq',
      dq_reasons: parseDqReasonSlugs(row.raw),
    },
    false,
  );
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
  is: (c: string, v: null) => Scopeable;
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

function quoteFilterValue(value: string): string {
  return `"${value.replace(/"/g, '')}"`;
}

/** Leads with a conversation, proposal, submission, or funded date in the window. */
async function loadMilestoneLeads(
  service: ServiceClient,
  clients: ClientScope,
  startDate?: string | null,
  endDate?: string | null,
): Promise<{ data?: LeadMilestoneRow[]; error?: string }> {
  let query: Scopeable = service
    .from('leads')
    .select(MILESTONE_SELECT)
    .is('merged_into_id', null) as unknown as Scopeable;
  query = applyClientScope(query, clients);
  const start = startDate ? quoteFilterValue(`${startDate}T00:00:00.000Z`) : null;
  const end = endDate ? quoteFilterValue(`${endDate}T23:59:59.999Z`) : null;
  const columns = ['conversation_at', 'proposal_at', 'submission_at', 'funded_at'];
  if (start || end) {
    const parts = columns.map((column) => {
      const bits: string[] = [];
      if (start) bits.push(`${column}.gte.${start}`);
      if (end) bits.push(`${column}.lte.${end}`);
      return `and(${bits.join(',')})`;
    });
    query = query.or(parts.join(','));
  } else {
    query = query.or(columns.map((column) => `${column}.not.is.null`).join(','));
  }
  query = query.limit(ROW_LIMIT);
  const { data, error } = await (query as unknown as QueryResult<LeadMilestoneRow>);
  if (error) return { error: error.message };
  return { data: (data ?? []) as LeadMilestoneRow[] };
}

type LeadTouch = { id: string; utm_content: string | null; ad_name: string | null };

/**
 * First-touch ad for the leads on these rows. A PostgREST embed joins the
 * whole leads table (hash + seq scan). Looking up by id uses the primary key.
 */
async function hydrateLeadAds(
  service: ServiceClient,
  rows: DbEventRow[],
): Promise<string | null> {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const id = row.lead_id?.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  if (ids.length === 0) return null;

  const ads = new Map<string, { utm_content: string | null; ad_name: string | null }>();
  for (const idChunk of chunk(ids, 2000)) {
    const rpc = await service.rpc('lead_first_touch_ads', { p_ids: idChunk });
    if (rpc.error) {
      if (!/could not find the function|schema cache/i.test(rpc.error.message)) {
        return rpc.error.message;
      }
      const { data, error } = await service
        .from('leads')
        .select('id, utm_content, ad_name')
        .in('id', idChunk);
      if (error) return error.message;
      for (const lead of (data ?? []) as LeadTouch[]) {
        ads.set(lead.id, { utm_content: lead.utm_content, ad_name: lead.ad_name });
      }
      continue;
    }
    for (const lead of (rpc.data ?? []) as LeadTouch[]) {
      ads.set(lead.id, { utm_content: lead.utm_content, ad_name: lead.ad_name });
    }
  }

  for (const row of rows) {
    const ad = row.lead_id ? ads.get(row.lead_id) : undefined;
    if (!ad) continue;
    row.lead_utm_content = ad.utm_content;
    row.lead_ad_name = ad.ad_name;
  }
  return null;
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
        milestones,
      ] = await Promise.all([
        eventsQuery as unknown as QueryResult<DbEventRow>,
        dqQuery as unknown as QueryResult<ManualDqDbRow>,
        metaQuery as unknown as QueryResult<AdMetaRow>,
        service.from('ad_library').select(LIBRARY_SELECT),
        service.from('ad_library_aliases').select('id, library_id, alias_name'),
        loadMilestoneLeads(service, clients, scope.startDate, scope.endDate),
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
      if (milestones.error) return { error: milestones.error };

      const eventRows = (events ?? []) as DbEventRow[];
      const dqDbRows = (dqRows ?? []) as ManualDqDbRow[];
      const libraryRows = (library ?? []) as AdLibraryMeta[];
      const [leadError, tagLookup] = await Promise.all([
        hydrateLeadAds(service, [...eventRows, ...dqDbRows]),
        tagsByLibraryId(
          service,
          libraryRows.map((row) => row.id),
        ),
      ]);
      if (leadError) return { error: leadError };

      const manualDqs = dqDbRows
        .map(formManualDqEvent)
        .filter((row): row is AdEventRow => row != null);

      return {
        data: {
          events: [
            ...eventRows.map((row) => toAdEvent(row, true)),
            ...manualDqs,
            ...milestoneAdEvents(milestones.data ?? [], scope.startDate, scope.endDate),
          ],
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

  const seedEvents = [...(namedByAd ?? []), ...(namedByUtm ?? [])] as DbEventRow[];
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
      row.lead_id ?? '',
      row.ghl_contact_id ?? '',
      eventPhone(row) ?? '',
      row.ad_name ?? '',
    ].join('|');
    if (!byStamp.has(stamp)) byStamp.set(stamp, row);
  };
  const rememberDb = async (rows: DbEventRow[]): Promise<string | null> => {
    const err = await hydrateLeadAds(service, rows);
    if (err) return err;
    for (const row of rows) remember(toAdEvent(row, true));
    return null;
  };
  const seedErr = await rememberDb(seedEvents);
  if (seedErr) return { error: seedErr };

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
    const { data, error } = await (q as unknown as QueryResult<DbEventRow>);
    if (error) return { error: error.message };
    const leadError = await rememberDb((data ?? []) as DbEventRow[]);
    if (leadError) return { error: leadError };
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
    const { data, error } = await (q as unknown as QueryResult<DbEventRow>);
    if (error) return { error: error.message };
    const leadError = await rememberDb((data ?? []) as DbEventRow[]);
    if (leadError) return { error: leadError };
  }

  // Leads whose first-touch ad is this creative, including conversions that
  // never copied the ad name onto the later event.
  const leadIds: string[] = [];
  const seenLead = new Set<string>();
  const matchedLeads: LeadMilestoneRow[] = [];
  for (const column of ['utm_content', 'ad_name'] as const) {
    let leadQuery: Scopeable = service
      .from('leads')
      .select(MILESTONE_SELECT)
      .is('merged_into_id', null)
      .in(column, names) as unknown as Scopeable;
    leadQuery = applyClientScope(leadQuery, clients);
    leadQuery = leadQuery.limit(ROW_LIMIT);
    const { data, error } = await (leadQuery as unknown as QueryResult<LeadMilestoneRow>);
    if (error) return { error: error.message };
    for (const lead of (data ?? []) as LeadMilestoneRow[]) {
      if (seenLead.has(lead.id)) continue;
      seenLead.add(lead.id);
      matchedLeads.push(lead);
      if (leadIds.length < DRILLDOWN_CONTACT_CAP) leadIds.push(lead.id);
    }
  }

  for (const idChunk of chunk(leadIds, IN_CHUNK)) {
    let q: Scopeable = service
      .from('events')
      .select(EVENT_SELECT)
      .in('event_type', [...FUNNEL_EVENT_TYPES])
      .in('lead_id', idChunk) as unknown as Scopeable;
    q = applyClientScope(q, clients);
    q = withDateRange(q, 'occurred_at', scope.startDate, scope.endDate, true);
    q = q.limit(ROW_LIMIT);
    const { data, error } = await (q as unknown as QueryResult<DbEventRow>);
    if (error) return { error: error.message };
    const leadError = await rememberDb((data ?? []) as DbEventRow[]);
    if (leadError) return { error: leadError };
  }

  for (const row of milestoneAdEvents(matchedLeads, scope.startDate, scope.endDate)) {
    remember(row);
  }

  // Form DQs for those contacts. Attribution uses the lead's ad, not the
  // snapshot copied onto the DQ row, so this is not filtered by ad name.
  const rememberDq = async (rows: ManualDqDbRow[]): Promise<string | null> => {
    const err = await hydrateLeadAds(service, rows);
    if (err) return err;
    for (const row of rows) {
      const ev = formManualDqEvent(row);
      if (ev) remember(ev);
    }
    return null;
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
    const leadError = await rememberDq((data ?? []) as ManualDqDbRow[]);
    if (leadError) return { error: leadError };
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
    const leadError = await rememberDq((data ?? []) as ManualDqDbRow[]);
    if (leadError) return { error: leadError };
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

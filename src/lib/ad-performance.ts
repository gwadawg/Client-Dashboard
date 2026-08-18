import { buildContactKey, eventPhone } from '@/lib/contact-key';
import { daysInRange, leadIdentityKey, weekStartKey } from '@/lib/metrics';

// Minimal shapes (decoupled from the full EventRow / meta_ad_insights row).
export type AdMetaRow = {
  client_id?: string | null;
  ad_name?: string | null;
  insight_date?: string | null;
  spend?: number | string | null;
  impressions?: number | string | null;
  clicks?: number | string | null;
};

export type AdEventRow = {
  client_id?: string | null;
  event_type: string;
  ghl_contact_id?: string | null;
  lead_phone?: string | null;
  phone_number_used?: string | null;
  lead_email?: string | null;
  lead_name?: string | null;
  ad_name?: string | null;
  is_qualified?: boolean | null;
  is_hot?: boolean | null;
  occurred_at?: string | null;
};

const HAND_RAISE_TYPES = new Set(['appointment_booked', 'claimed', 'live_transfer']);
const CONVERSATION_TYPES = new Set(['show', 'claimed', 'live_transfer']);
const PROPOSAL_TYPES = new Set(['proposal_made', 'proposal_sent']);
const SUBMISSION_TYPES = new Set(['submission_made', 'loan_processing']);
const FUNDED_TYPES = new Set(['loan_funded', 'closed']);

export type AdPerformanceRow = {
  ad_name: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number | null;
  cpc: number | null;
  cpm: number | null;
  leads: number;
  qualified: number;
  hot: number;
  appointments: number;
  shows: number;
  no_shows: number;
  closes: number;
  unique_booked: number;
  unique_hand_raises: number;
  unique_conversations: number;
  unique_proposals: number;
  unique_submissions: number;
  unique_funded: number;
  cpl: number | null;
  cost_per_qualified: number | null;
  cost_per_appointment: number | null;
  cost_per_show: number | null;
  cost_per_close: number | null;
  cp_conversation: number | null;
  cp_proposal: number | null;
  cp_submission: number | null;
  cp_funded: number | null;
  booking_rate: number | null;
  /** Qualified leads ÷ total leads × 100. */
  qualified_rate: number | null;
  show_rate: number | null;
  /** Unique (booked ∪ claimed ∪ LT) ÷ qualified × 100. */
  hand_raise_rate: number | null;
  /** Unique (show ∪ claimed ∪ LT) ÷ qualified × 100. */
  conversation_rate: number | null;
  client_count: number;
  /** Client IDs for rollup union; omitted in API responses when empty. */
  client_ids?: string[];
  has_meta: boolean;
};

export type AdLibraryMeta = {
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
  tags?: { slug: string; label: string }[];
};

export type RolledUpAdPerformanceRow = AdPerformanceRow & {
  /** Stable key for drilldown expand state. */
  row_key: string;
  library: AdLibraryMeta | null;
  variant_names: string[];
  is_sourced: boolean;
};

export type AdLibraryAliasRow = {
  id: string;
  library_id: string;
  alias_name: string;
};

/** Maps Facebook ad names (primary + aliases) to library entries. */
export class AdLibraryResolver {
  private byName = new Map<string, AdLibraryMeta>();
  private aliasesByLibrary = new Map<string, AdLibraryAliasRow[]>();

  constructor(
    library: AdLibraryMeta[],
    aliases: AdLibraryAliasRow[] = [],
  ) {
    for (const row of library) {
      const name = normalizeAdName(row.ad_name);
      if (name) this.byName.set(adKey(name), row);
    }
    for (const alias of aliases) {
      const name = normalizeAdName(alias.alias_name);
      const lib = library.find((l) => l.id === alias.library_id);
      if (name && lib) this.byName.set(adKey(name), lib);
      const list = this.aliasesByLibrary.get(alias.library_id) ?? [];
      list.push(alias);
      this.aliasesByLibrary.set(alias.library_id, list);
    }
  }

  resolve(adName: string): AdLibraryMeta | null {
    return this.byName.get(adKey(adName)) ?? null;
  }

  /** All Facebook ad names linked to a library entry (primary + aliases). */
  variantNamesFor(libraryId: string, primaryName: string): string[] {
    const names = new Set<string>([primaryName]);
    for (const a of this.aliasesByLibrary.get(libraryId) ?? []) {
      const n = normalizeAdName(a.alias_name);
      if (n) names.add(n);
    }
    return [...names].sort((a, b) => a.localeCompare(b));
  }
}

function num(v: unknown): number {
  if (v == null || v === '') return 0;
  const n = typeof v === 'number' ? v : Number(String(v));
  return Number.isFinite(n) ? n : 0;
}

/** Trim only; same ad names are reused across clients, so casing is left intact. */
export function normalizeAdName(v: string | null | undefined): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s || null;
}

/** Lower-cased grouping key so trivial casing differences fold together. */
function adKey(name: string): string {
  return name.toLowerCase();
}

export function resolveAdGranularity(start?: string | null, end?: string | null): 'day' | 'week' {
  if (!start || !end) return 'day';
  return daysInRange(start, end) > 90 ? 'week' : 'day';
}

function bucketDate(date: string, granularity: 'day' | 'week'): string {
  const d = date.slice(0, 10);
  return granularity === 'week' ? weekStartKey(d) : d;
}

function adLeadIdentity(e: AdEventRow): string | null {
  return leadIdentityKey({
    client_id: e.client_id,
    ghl_contact_id: e.ghl_contact_id,
    lead_phone: e.lead_phone || e.phone_number_used,
    lead_email: e.lead_email,
    lead_name: e.lead_name,
  });
}

type Acc = {
  ad_name: string;
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  qualified: number;
  hot: number;
  appointments: number;
  shows: number;
  no_shows: number;
  closes: number;
  bookedKeys: Set<string>;
  handRaiseKeys: Set<string>;
  conversationKeys: Set<string>;
  proposalKeys: Set<string>;
  submissionKeys: Set<string>;
  fundedKeys: Set<string>;
  clients: Set<string>;
  has_meta: boolean;
};

function blankAcc(displayName: string): Acc {
  return {
    ad_name: displayName,
    spend: 0,
    impressions: 0,
    clicks: 0,
    leads: 0,
    qualified: 0,
    hot: 0,
    appointments: 0,
    shows: 0,
    no_shows: 0,
    closes: 0,
    bookedKeys: new Set(),
    handRaiseKeys: new Set(),
    conversationKeys: new Set(),
    proposalKeys: new Set(),
    submissionKeys: new Set(),
    fundedKeys: new Set(),
    clients: new Set(),
    has_meta: false,
  };
}

function applyFunnelEvent(
  acc: {
    leads: number;
    qualified: number;
    hot: number;
    appointments: number;
    shows: number;
    no_shows: number;
    closes: number;
    bookedKeys: Set<string>;
    handRaiseKeys: Set<string>;
    conversationKeys: Set<string>;
    proposalKeys: Set<string>;
    submissionKeys: Set<string>;
    fundedKeys: Set<string>;
  },
  e: AdEventRow,
): void {
  const id = adLeadIdentity(e);
  switch (e.event_type) {
    case 'lead':
      acc.leads += 1;
      if (e.is_qualified) acc.qualified += 1;
      if (e.is_hot) acc.hot += 1;
      break;
    case 'appointment_booked':
      acc.appointments += 1;
      break;
    case 'show':
      acc.shows += 1;
      break;
    case 'no_show':
      acc.no_shows += 1;
      break;
    case 'loan_funded':
    case 'closed':
      acc.closes += 1;
      break;
    default:
      break;
  }
  if (!id) return;
  if (e.event_type === 'appointment_booked') acc.bookedKeys.add(id);
  if (HAND_RAISE_TYPES.has(e.event_type)) acc.handRaiseKeys.add(id);
  if (CONVERSATION_TYPES.has(e.event_type)) acc.conversationKeys.add(id);
  if (PROPOSAL_TYPES.has(e.event_type) || SUBMISSION_TYPES.has(e.event_type) || FUNDED_TYPES.has(e.event_type)) {
    acc.proposalKeys.add(id);
  }
  if (SUBMISSION_TYPES.has(e.event_type) || FUNDED_TYPES.has(e.event_type)) {
    acc.submissionKeys.add(id);
  }
  if (FUNDED_TYPES.has(e.event_type)) acc.fundedKeys.add(id);
}

/**
 * Maps each contact (per client) to the ad name on its lead event, so downstream
 * events (appointments / shows / closes) that don't carry an ad name themselves
 * can still be attributed back to the ad that produced the lead.
 */
function buildContactAdMap(events: AdEventRow[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const e of events) {
    if (e.event_type !== 'lead') continue;
    const name = normalizeAdName(e.ad_name);
    if (!name) continue;
    const key = buildContactKey(
      e.client_id ?? '',
      eventPhone(e),
      e.ghl_contact_id,
    );
    if (!map.has(key)) map.set(key, name);
  }
  return map;
}

/** Resolve the ad name for any event: its own ad_name, else its contact's lead ad. */
function resolveEventAdName(e: AdEventRow, contactAd: Map<string, string>): string | null {
  const own = normalizeAdName(e.ad_name);
  if (own) return own;
  const key = buildContactKey(e.client_id ?? '', eventPhone(e), e.ghl_contact_id);
  return contactAd.get(key) ?? null;
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

function round(v: number | null, dp = 2): number | null {
  if (v == null) return null;
  const f = 10 ** dp;
  return Math.round(v * f) / f;
}

function pct(numerator: number, denominator: number): number | null {
  return round(ratio(numerator, denominator) != null ? (numerator / denominator) * 100 : null, 1);
}

function costMetrics(
  spend: number,
  leads: number,
  qualified: number,
  conversations: number,
  shows: number,
  appointments: number,
  closes: number,
  unique_proposals: number,
  unique_submissions: number,
  unique_funded: number,
) {
  return {
    cpl: round(ratio(spend, leads), 2),
    cost_per_qualified: round(ratio(spend, qualified), 2),
    cost_per_appointment: round(ratio(spend, appointments), 2),
    cost_per_show: round(ratio(spend, shows), 2),
    cost_per_close: round(ratio(spend, closes), 2),
    cp_conversation: round(ratio(spend, conversations), 2),
    cp_proposal: round(ratio(spend, unique_proposals), 2),
    cp_submission: round(ratio(spend, unique_submissions), 2),
    cp_funded: round(ratio(spend, unique_funded), 2),
  };
}

/**
 * Global, cross-client ad leaderboard grouped by ad name. Spend / platform
 * metrics come from meta_ad_insights; the funnel (leads → qualified → appts →
 * shows → closes) is attributed from our own events.
 */
export function aggregateAdPerformance(
  metaRows: AdMetaRow[],
  events: AdEventRow[],
): AdPerformanceRow[] {
  const accs = new Map<string, Acc>();

  const ensure = (displayName: string): Acc => {
    const key = adKey(displayName);
    let acc = accs.get(key);
    if (!acc) {
      acc = blankAcc(displayName);
      accs.set(key, acc);
    }
    return acc;
  };

  for (const m of metaRows) {
    const name = normalizeAdName(m.ad_name);
    if (!name) continue;
    const acc = ensure(name);
    acc.spend += num(m.spend);
    acc.impressions += num(m.impressions);
    acc.clicks += num(m.clicks);
    acc.has_meta = true;
    if (m.client_id) acc.clients.add(m.client_id);
  }

  const contactAd = buildContactAdMap(events);
  for (const e of events) {
    const name = resolveEventAdName(e, contactAd);
    if (!name) continue;
    const acc = ensure(name);
    if (e.client_id) acc.clients.add(e.client_id);
    applyFunnelEvent(acc, e);
  }

  const rows: AdPerformanceRow[] = [];
  for (const acc of accs.values()) {
    rows.push(accToRow(acc));
  }
  rows.sort((a, b) => b.spend - a.spend);
  return rows;
}

function accToRow(acc: Acc): AdPerformanceRow {
  const unique_booked = acc.bookedKeys.size;
  const unique_hand_raises = acc.handRaiseKeys.size;
  const unique_conversations = acc.conversationKeys.size;
  const unique_proposals = acc.proposalKeys.size;
  const unique_submissions = acc.submissionKeys.size;
  const unique_funded = acc.fundedKeys.size;
  const costs = costMetrics(
    acc.spend,
    acc.leads,
    acc.qualified,
    unique_conversations,
    acc.shows,
    acc.appointments,
    acc.closes,
    unique_proposals,
    unique_submissions,
    unique_funded,
  );
  return {
    ad_name: acc.ad_name,
    spend: round(acc.spend) ?? 0,
    impressions: acc.impressions,
    clicks: acc.clicks,
    ctr: round(ratio(acc.clicks, acc.impressions) != null ? (acc.clicks / acc.impressions) * 100 : null, 2),
    cpc: round(ratio(acc.spend, acc.clicks), 2),
    cpm: round(acc.impressions > 0 ? (acc.spend / acc.impressions) * 1000 : null, 2),
    leads: acc.leads,
    qualified: acc.qualified,
    hot: acc.hot,
    appointments: acc.appointments,
    shows: acc.shows,
    no_shows: acc.no_shows,
    closes: acc.closes,
    unique_booked,
    unique_hand_raises,
    unique_conversations,
    unique_proposals,
    unique_submissions,
    unique_funded,
    ...costs,
    booking_rate: pct(unique_booked, acc.qualified),
    qualified_rate: pct(acc.qualified, acc.leads),
    show_rate: round(
      acc.shows + acc.no_shows > 0 ? (acc.shows / (acc.shows + acc.no_shows)) * 100 : null,
      1,
    ),
    hand_raise_rate: pct(unique_hand_raises, acc.qualified),
    conversation_rate: pct(unique_conversations, acc.qualified),
    client_count: acc.clients.size,
    client_ids: [...acc.clients],
    has_meta: acc.has_meta,
  };
}

type RollupAcc = {
  display_name: string;
  row_key: string;
  library: AdLibraryMeta | null;
  variant_names: Set<string>;
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  qualified: number;
  hot: number;
  appointments: number;
  shows: number;
  no_shows: number;
  closes: number;
  unique_booked: number;
  unique_hand_raises: number;
  unique_conversations: number;
  unique_proposals: number;
  unique_submissions: number;
  unique_funded: number;
  clients: Set<string>;
  has_meta: boolean;
};

function rollupAccToRow(acc: RollupAcc): RolledUpAdPerformanceRow {
  const variant_names = [...acc.variant_names].sort((a, b) => a.localeCompare(b));
  const base = accToRow({
    ad_name: acc.display_name,
    spend: acc.spend,
    impressions: acc.impressions,
    clicks: acc.clicks,
    leads: acc.leads,
    qualified: acc.qualified,
    hot: acc.hot,
    appointments: acc.appointments,
    shows: acc.shows,
    no_shows: acc.no_shows,
    closes: acc.closes,
    bookedKeys: numberedSet(acc.unique_booked),
    handRaiseKeys: numberedSet(acc.unique_hand_raises),
    conversationKeys: numberedSet(acc.unique_conversations),
    proposalKeys: numberedSet(acc.unique_proposals),
    submissionKeys: numberedSet(acc.unique_submissions),
    fundedKeys: numberedSet(acc.unique_funded),
    clients: acc.clients,
    has_meta: acc.has_meta,
  });
  return {
    ...base,
    row_key: acc.row_key,
    library: acc.library,
    variant_names,
    is_sourced: acc.library != null,
  };
}

/** Placeholder unique keys so accToRow can read .size after a numeric rollup. */
function numberedSet(n: number): Set<string> {
  const s = new Set<string>();
  for (let i = 0; i < n; i++) s.add(String(i));
  return s;
}

/**
 * Roll per-ad-name performance rows into one row per library creative.
 * Unsourced ads remain as individual rows keyed by ad name.
 */
export function rollupAdPerformanceByLibrary(
  rows: AdPerformanceRow[],
  resolver: AdLibraryResolver,
): RolledUpAdPerformanceRow[] {
  const groups = new Map<string, RollupAcc>();

  const ensure = (key: string, init: () => RollupAcc): RollupAcc => {
    let acc = groups.get(key);
    if (!acc) {
      acc = init();
      groups.set(key, acc);
    }
    return acc;
  };

  for (const row of rows) {
    const lib = resolver.resolve(row.ad_name);
    const groupKey = lib ? `lib:${lib.id}` : `unsourced:${adKey(row.ad_name)}`;
    const acc = ensure(groupKey, () => ({
      display_name: lib ? lib.ad_name : row.ad_name,
      row_key: groupKey,
      library: lib ?? null,
      variant_names: new Set<string>(),
      spend: 0,
      impressions: 0,
      clicks: 0,
      leads: 0,
      qualified: 0,
      hot: 0,
      appointments: 0,
      shows: 0,
      no_shows: 0,
      closes: 0,
      unique_booked: 0,
      unique_hand_raises: 0,
      unique_conversations: 0,
      unique_proposals: 0,
      unique_submissions: 0,
      unique_funded: 0,
      clients: new Set<string>(),
      has_meta: false,
    }));

    acc.variant_names.add(row.ad_name);
    acc.spend += row.spend;
    acc.impressions += row.impressions;
    acc.clicks += row.clicks;
    acc.leads += row.leads;
    acc.qualified += row.qualified;
    acc.hot += row.hot;
    acc.appointments += row.appointments;
    acc.shows += row.shows;
    acc.no_shows += row.no_shows;
    acc.closes += row.closes;
    acc.unique_booked += row.unique_booked;
    acc.unique_hand_raises += row.unique_hand_raises;
    acc.unique_conversations += row.unique_conversations;
    acc.unique_proposals += row.unique_proposals;
    acc.unique_submissions += row.unique_submissions;
    acc.unique_funded += row.unique_funded;
    if (row.has_meta) acc.has_meta = true;
    for (const id of row.client_ids ?? []) acc.clients.add(id);
  }

  const result = [...groups.values()].map(rollupAccToRow);
  result.sort((a, b) => b.spend - a.spend);
  return result;
}

export type AdClientBreakdownRow = {
  client_id: string;
  spend: number;
  leads: number;
  qualified: number;
  appointments: number;
  shows: number;
  closes: number;
  unique_hand_raises: number;
  unique_conversations: number;
  unique_proposals: number;
  unique_submissions: number;
  unique_funded: number;
  cpl: number | null;
  cost_per_qualified: number | null;
  cp_conversation: number | null;
  cp_proposal: number | null;
  cp_submission: number | null;
  cp_funded: number | null;
  cost_per_show: number | null;
  qualified_rate: number | null;
  hand_raise_rate: number | null;
  conversation_rate: number | null;
};

export type AdDailyPoint = {
  date: string;
  spend: number;
  leads: number;
  qualified: number;
  appointments: number;
  shows: number;
  unique_hand_raises: number;
  unique_conversations: number;
  unique_proposals: number;
  unique_submissions: number;
  unique_funded: number;
  cpl: number | null;
  cost_per_qualified: number | null;
  cp_conversation: number | null;
  cp_proposal: number | null;
  cp_submission: number | null;
  cp_funded: number | null;
  qualified_rate: number | null;
  hand_raise_rate: number | null;
  conversation_rate: number | null;
};

export type AdClientDailyPoint = AdDailyPoint & { client_id: string };

export type AdVariantBreakdown = {
  ad_name: string;
  spend: number;
  leads: number;
  qualified: number;
  appointments: number;
  shows: number;
  closes: number;
  unique_conversations: number;
  unique_proposals: number;
  unique_submissions: number;
  unique_funded: number;
  cpl: number | null;
  cost_per_qualified: number | null;
  cp_conversation: number | null;
  cp_proposal: number | null;
  cp_submission: number | null;
  cp_funded: number | null;
};

export type AdDrilldown = {
  ad_name: string;
  library_id?: string | null;
  granularity: 'day' | 'week';
  perClient: AdClientBreakdownRow[];
  daily: AdDailyPoint[];
  perClientDaily: AdClientDailyPoint[];
  variants?: AdVariantBreakdown[];
};

export type AdDrilldownOptions = {
  startDate?: string | null;
  endDate?: string | null;
  granularity?: 'day' | 'week';
};

type RawBucket = {
  spend: number;
  leads: number;
  qualified: number;
  hot: number;
  appointments: number;
  shows: number;
  no_shows: number;
  closes: number;
  bookedKeys: Set<string>;
  handRaiseKeys: Set<string>;
  conversationKeys: Set<string>;
  proposalKeys: Set<string>;
  submissionKeys: Set<string>;
  fundedKeys: Set<string>;
};

function blankBucket(): RawBucket {
  return {
    spend: 0,
    leads: 0,
    qualified: 0,
    hot: 0,
    appointments: 0,
    shows: 0,
    no_shows: 0,
    closes: 0,
    bookedKeys: new Set(),
    handRaiseKeys: new Set(),
    conversationKeys: new Set(),
    proposalKeys: new Set(),
    submissionKeys: new Set(),
    fundedKeys: new Set(),
  };
}

function backendUniques(b: RawBucket) {
  return {
    unique_hand_raises: b.handRaiseKeys.size,
    unique_conversations: b.conversationKeys.size,
    unique_proposals: b.proposalKeys.size,
    unique_submissions: b.submissionKeys.size,
    unique_funded: b.fundedKeys.size,
  };
}

function finalizeDailyPoint(date: string, b: RawBucket): AdDailyPoint {
  const u = backendUniques(b);
  const costs = costMetrics(
    b.spend,
    b.leads,
    b.qualified,
    u.unique_conversations,
    b.shows,
    b.appointments,
    b.closes,
    u.unique_proposals,
    u.unique_submissions,
    u.unique_funded,
  );
  return {
    date,
    spend: round(b.spend) ?? 0,
    leads: b.leads,
    qualified: b.qualified,
    appointments: b.appointments,
    shows: b.shows,
    unique_hand_raises: u.unique_hand_raises,
    unique_conversations: u.unique_conversations,
    unique_proposals: u.unique_proposals,
    unique_submissions: u.unique_submissions,
    unique_funded: u.unique_funded,
    cpl: costs.cpl,
    cost_per_qualified: costs.cost_per_qualified,
    cp_conversation: costs.cp_conversation,
    cp_proposal: costs.cp_proposal,
    cp_submission: costs.cp_submission,
    cp_funded: costs.cp_funded,
    qualified_rate: pct(b.qualified, b.leads),
    hand_raise_rate: pct(u.unique_hand_raises, b.qualified),
    conversation_rate: pct(u.unique_conversations, b.qualified),
  };
}

function finalizeClientRow(client_id: string, b: RawBucket): AdClientBreakdownRow {
  const u = backendUniques(b);
  const costs = costMetrics(
    b.spend,
    b.leads,
    b.qualified,
    u.unique_conversations,
    b.shows,
    b.appointments,
    b.closes,
    u.unique_proposals,
    u.unique_submissions,
    u.unique_funded,
  );
  return {
    client_id,
    spend: round(b.spend) ?? 0,
    leads: b.leads,
    qualified: b.qualified,
    appointments: b.appointments,
    shows: b.shows,
    closes: b.closes,
    unique_hand_raises: u.unique_hand_raises,
    unique_conversations: u.unique_conversations,
    unique_proposals: u.unique_proposals,
    unique_submissions: u.unique_submissions,
    unique_funded: u.unique_funded,
    cpl: costs.cpl,
    cost_per_qualified: costs.cost_per_qualified,
    cp_conversation: costs.cp_conversation,
    cp_proposal: costs.cp_proposal,
    cp_submission: costs.cp_submission,
    cp_funded: costs.cp_funded,
    cost_per_show: costs.cost_per_show,
    qualified_rate: pct(b.qualified, b.leads),
    hand_raise_rate: pct(u.unique_hand_raises, b.qualified),
    conversation_rate: pct(u.unique_conversations, b.qualified),
  };
}

function addBucketSpend(b: RawBucket, spend: number): void {
  b.spend += spend;
}

function matchesAd(name: string | null, targets: Set<string>): boolean {
  if (!name) return false;
  return targets.has(adKey(name));
}

/** Per-client breakdown + daily trend for one ad name. */
export function buildAdDrilldown(
  adName: string,
  metaRows: AdMetaRow[],
  events: AdEventRow[],
  options: AdDrilldownOptions = {},
): AdDrilldown {
  return buildMultiAdDrilldown(adName, [adName], metaRows, events, null, options);
}

/** Merge drilldowns for multiple Facebook ad names (library variants). */
export function buildMultiAdDrilldown(
  displayName: string,
  adNames: string[],
  metaRows: AdMetaRow[],
  events: AdEventRow[],
  libraryId?: string | null,
  options: AdDrilldownOptions = {},
): AdDrilldown {
  const granularity = options.granularity ?? resolveAdGranularity(options.startDate, options.endDate);
  if (adNames.length === 0) {
    return {
      ad_name: displayName,
      library_id: libraryId,
      granularity,
      perClient: [],
      daily: [],
      perClientDaily: [],
      variants: [],
    };
  }

  const targets = new Set(adNames.map((n) => adKey(n)).filter(Boolean));
  const contactAd = buildContactAdMap(events);

  const perClient = new Map<string, RawBucket>();
  const daily = new Map<string, RawBucket>();
  const perClientDaily = new Map<string, RawBucket>();
  const variants = new Map<string, RawBucket>();

  const ensure = (map: Map<string, RawBucket>, key: string): RawBucket => {
    let b = map.get(key);
    if (!b) {
      b = blankBucket();
      map.set(key, b);
    }
    return b;
  };

  const clientDayKey = (clientId: string, date: string) => `${clientId}|${date}`;

  for (const m of metaRows) {
    const name = normalizeAdName(m.ad_name);
    if (!matchesAd(name, targets)) continue;
    const spend = num(m.spend);
    const date = m.insight_date ? bucketDate(m.insight_date, granularity) : null;
    if (name) addBucketSpend(ensure(variants, name), spend);
    if (m.client_id) {
      addBucketSpend(ensure(perClient, m.client_id), spend);
      if (date) addBucketSpend(ensure(perClientDaily, clientDayKey(m.client_id, date)), spend);
    }
    if (date) addBucketSpend(ensure(daily, date), spend);
  }

  for (const e of events) {
    const name = resolveEventAdName(e, contactAd);
    if (!matchesAd(name, targets)) continue;
    const date = e.occurred_at ? bucketDate(e.occurred_at, granularity) : null;
    if (name) applyFunnelEvent(ensure(variants, name), e);
    if (e.client_id) {
      applyFunnelEvent(ensure(perClient, e.client_id), e);
      if (date) applyFunnelEvent(ensure(perClientDaily, clientDayKey(e.client_id, date)), e);
    }
    if (date) applyFunnelEvent(ensure(daily, date), e);
  }

  const variantRows: AdVariantBreakdown[] = [...variants.entries()].map(([ad_name, b]) => {
    const u = backendUniques(b);
    const costs = costMetrics(
      b.spend,
      b.leads,
      b.qualified,
      u.unique_conversations,
      b.shows,
      b.appointments,
      b.closes,
      u.unique_proposals,
      u.unique_submissions,
      u.unique_funded,
    );
    return {
      ad_name,
      spend: round(b.spend) ?? 0,
      leads: b.leads,
      qualified: b.qualified,
      appointments: b.appointments,
      shows: b.shows,
      closes: b.closes,
      unique_conversations: u.unique_conversations,
      unique_proposals: u.unique_proposals,
      unique_submissions: u.unique_submissions,
      unique_funded: u.unique_funded,
      cpl: costs.cpl,
      cost_per_qualified: costs.cost_per_qualified,
      cp_conversation: costs.cp_conversation,
      cp_proposal: costs.cp_proposal,
      cp_submission: costs.cp_submission,
      cp_funded: costs.cp_funded,
    };
  }).sort((a, b) => b.spend - a.spend);

  return {
    ad_name: displayName,
    library_id: libraryId,
    granularity,
    perClient: [...perClient.entries()]
      .map(([id, b]) => finalizeClientRow(id, b))
      .sort((a, b) => {
        const ac = a.cp_conversation;
        const bc = b.cp_conversation;
        if (ac == null && bc == null) return b.spend - a.spend;
        if (ac == null) return 1;
        if (bc == null) return -1;
        return ac - bc;
      }),
    daily: [...daily.entries()]
      .map(([date, b]) => finalizeDailyPoint(date, b))
      .sort((a, b) => a.date.localeCompare(b.date)),
    perClientDaily: [...perClientDaily.entries()]
      .map(([key, b]) => {
        const sep = key.indexOf('|');
        const client_id = key.slice(0, sep);
        const date = key.slice(sep + 1);
        return { client_id, ...finalizeDailyPoint(date, b) };
      })
      .sort((a, b) => a.date.localeCompare(b.date) || a.client_id.localeCompare(b.client_id)),
    variants: variantRows,
  };
}

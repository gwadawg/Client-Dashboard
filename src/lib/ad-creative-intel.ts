/**
 * Creative Command intel layer.
 *
 * Sits on top of the ad-performance engine without modifying it: the funnel math,
 * unique-lead dedupe and library rollup all come from `ad-performance.ts`. What is
 * added here is the comparison the leaderboard cannot express — the same ads scored
 * against each other, against their own recent past, and against their concept
 * cluster — so "which of these is fatiguing" becomes answerable in one pass.
 *
 * Pure functions only (no Supabase imports) so the API route and the client
 * component can share the same definitions.
 */
import { buildContactKey, eventPhone } from './contact-key';
import { daysInRange } from './metrics';
import {
  aggregateAdPerformance,
  normalizeAdName,
  rollupAdPerformanceByLibrary,
  type AdEventRow,
  type AdLibraryResolver,
  type AdMetaRow,
  type RolledUpAdPerformanceRow,
} from './ad-performance';
import {
  DEAD_CPCONV_INDEX,
  DECAY_CPCONV_RISE_PCT,
  DECAY_CTR_SPLIT_PCT,
  LEADERBOARD_FLOOR,
  MAX_RECENT_DAYS,
  MIN_WINDOW_FOR_CLEAN_SPLIT,
  PRODUCT_KEYS,
  PRODUCT_LABELS,
  SIGNAL_MIN_CONVERSATIONS,
  SIGNAL_MIN_SPEND,
  ZOMBIE_DAYS,
  type AdDiagnosis,
  type AdProductKey,
  type ClusterRow,
  type CreativeIntelReport,
  type CreativeIntelRow,
  type IntelWindow,
  type PeriodBlock,
  type ProductRollup,
} from './ad-creative-lenses';

export * from './ad-creative-lenses';

/* ------------------------------------------------------------------ *
 * Small helpers
 * ------------------------------------------------------------------ */

function round(v: number | null, dp = 2): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  const f = 10 ** dp;
  return Math.round(v * f) / f;
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

export function median(values: number[]): number | null {
  const nums = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!nums.length) return null;
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
}

export function addDays(date: string, delta: number): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** Percent change. Null when there is no baseline to compare against. */
function deltaPct(recent: number | null, prior: number | null): number | null {
  if (recent == null || prior == null || prior === 0) return null;
  return round(((recent - prior) / prior) * 100, 1);
}

function toProduct(value: string | null | undefined): AdProductKey {
  if (value === 'reverse' || value === 'dscr' || value === 'broad_forward') return value;
  return 'untagged';
}

/* ------------------------------------------------------------------ *
 * Window
 * ------------------------------------------------------------------ */

/**
 * Split the selected range into a trailing block and the equal-length block
 * before it. Both sit *inside* the range because the route only fetches rows
 * within it — widening the fetch to get a true prior period would double the
 * query cost on every load.
 */
export function resolveIntelWindow(start?: string | null, end?: string | null): IntelWindow {
  const blank: IntelWindow = {
    start: start ?? null,
    end: end ?? null,
    days: 0,
    recent_start: null,
    recent_end: null,
    prior_start: null,
    prior_end: null,
    recent_days: 0,
    comparable: false,
    clean_split: false,
  };
  if (!start || !end) return blank;

  const days = daysInRange(start, end);
  const recentDays = Math.min(MAX_RECENT_DAYS, Math.floor(days / 2));
  if (days < 4 || recentDays < 2) return { ...blank, days };

  const recentStart = addDays(end, -(recentDays - 1));
  const priorEnd = addDays(recentStart, -1);
  const priorStartRaw = addDays(priorEnd, -(recentDays - 1));
  const priorStart = priorStartRaw < start ? start : priorStartRaw;

  return {
    start,
    end,
    days,
    recent_start: recentStart,
    recent_end: end,
    prior_start: priorStart,
    prior_end: priorEnd,
    recent_days: recentDays,
    comparable: true,
    clean_split: days >= MIN_WINDOW_FOR_CLEAN_SPLIT,
  };
}

/* ------------------------------------------------------------------ *
 * Attribution
 * ------------------------------------------------------------------ */

/**
 * Stamp each event with the ad name from its contact's lead event.
 *
 * The engine does this internally, but it rebuilds the contact map from whatever
 * events it is handed. Slicing events by date first would orphan any show whose
 * lead landed in the earlier block, so the map is built once over the full window
 * and written onto the rows before slicing.
 */
export function withResolvedAdNames(events: AdEventRow[]): AdEventRow[] {
  const contactAd = new Map<string, string>();
  for (const e of events) {
    if (e.event_type !== 'lead') continue;
    const name = normalizeAdName(e.ad_name);
    if (!name) continue;
    const key = buildContactKey(e.client_id ?? '', eventPhone(e), e.ghl_contact_id);
    if (!contactAd.has(key)) contactAd.set(key, name);
  }
  return events.map((e) => {
    if (normalizeAdName(e.ad_name)) return e;
    const key = buildContactKey(e.client_id ?? '', eventPhone(e), e.ghl_contact_id);
    const name = contactAd.get(key);
    return name ? { ...e, ad_name: name } : e;
  });
}

function sliceEvents(events: AdEventRow[], start: string, end: string): AdEventRow[] {
  return events.filter((e) => {
    const day = e.occurred_at?.slice(0, 10);
    return !!day && day >= start && day <= end;
  });
}

function sliceMeta(rows: AdMetaRow[], start: string, end: string): AdMetaRow[] {
  return rows.filter((m) => {
    const day = m.insight_date?.slice(0, 10);
    return !!day && day >= start && day <= end;
  });
}

function rollupFor(
  metaRows: AdMetaRow[],
  events: AdEventRow[],
  resolver: AdLibraryResolver,
): Map<string, RolledUpAdPerformanceRow> {
  const rows = rollupAdPerformanceByLibrary(aggregateAdPerformance(metaRows, events), resolver);
  return new Map(rows.map((r) => [r.row_key, r]));
}

function toPeriodBlock(row: RolledUpAdPerformanceRow | undefined): PeriodBlock | null {
  if (!row) return null;
  return {
    spend: row.spend,
    impressions: row.impressions,
    clicks: row.clicks,
    ctr: row.ctr,
    optin_rate: row.optin_rate,
    leads: row.leads,
    qualified: row.qualified,
    unique_conversations: row.unique_conversations,
    cpl: row.cpl,
    cost_per_qualified: row.cost_per_qualified,
    cp_conversation: row.cp_conversation,
    qualified_rate: row.qualified_rate,
    show_rate: row.show_rate,
  };
}

/* ------------------------------------------------------------------ *
 * Lifecycle
 * ------------------------------------------------------------------ */

type Lifecycle = { first: string; last: string; activeDays: number };

/**
 * Days with real spend, per Facebook ad name. Keyed lower-case and kept as a day
 * set so a creative's variants can be unioned without double-counting the days
 * they ran alongside each other.
 */
function spendDaysByAdName(metaRows: AdMetaRow[]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const m of metaRows) {
    const name = normalizeAdName(m.ad_name);
    const day = m.insight_date?.slice(0, 10);
    if (!name || !day) continue;
    const spend = Number(m.spend ?? 0);
    if (!Number.isFinite(spend) || spend <= 0) continue;
    const key = name.toLowerCase();
    const days = map.get(key);
    if (days) days.add(day);
    else map.set(key, new Set([day]));
  }
  return map;
}

function lifecycleForRow(
  row: RolledUpAdPerformanceRow,
  byName: Map<string, Set<string>>,
): Lifecycle | null {
  const days = new Set<string>();
  for (const name of row.variant_names) {
    for (const day of byName.get(name.toLowerCase()) ?? []) days.add(day);
  }
  if (!days.size) return null;
  const sorted = [...days].sort();
  return { first: sorted[0], last: sorted[sorted.length - 1], activeDays: sorted.length };
}

/* ------------------------------------------------------------------ *
 * Diagnosis
 * ------------------------------------------------------------------ */

type ProductStats = {
  spend: number;
  medianCpconv: number | null;
  medianCpl: number | null;
  medianQual: number | null;
  medianShow: number | null;
  medianCtr: number | null;
  medianOptin: number | null;
  p75Spend: number | null;
};

function fmtMoney(v: number | null): string {
  if (v == null) return 'n/a';
  return `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function fmtPct(v: number | null): string {
  return v == null ? 'n/a' : `${v > 0 ? '+' : ''}${Math.round(v)}%`;
}

function diagnose(
  row: {
    signal: boolean;
    spend: number;
    days_since_spend: number | null;
    ctr_delta_pct: number | null;
    cpconv_delta_pct: number | null;
    cpconv_index: number | null;
    cpl: number | null;
    cp_conversation: number | null;
    qualified_rate: number | null;
    show_rate: number | null;
    beats_cluster_ctr: boolean;
    beats_cluster_optin: boolean;
    ctr: number | null;
    optin_rate: number | null;
  },
  stats: ProductStats,
): { diagnosis: AdDiagnosis; why: string } {
  const ctrD = row.ctr_delta_pct;
  const convD = row.cpconv_delta_pct;

  if (!row.signal) {
    const promising = row.beats_cluster_ctr && row.beats_cluster_optin;
    return {
      diagnosis: 'thin',
      why: promising
        ? `Only ${fmtMoney(row.spend)} spend, but CTR ${row.ctr}% and opt-in ${row.optin_rate}% both beat its cluster median. Leading indicators without budget — fund it.`
        : `Only ${fmtMoney(row.spend)} spend — not enough delivery to judge. Fund it or cut it.`,
    };
  }

  if (row.days_since_spend != null && row.days_since_spend > ZOMBIE_DAYS) {
    return {
      diagnosis: 'zombie',
      why: `No spend in the last ${row.days_since_spend} days of the window. It is still on the board but not running.`,
    };
  }

  // These two rules partition the decay space by CTR direction, so an ad whose
  // conversations got materially more expensive always gets a cause.
  if (convD != null && convD >= DECAY_CPCONV_RISE_PCT) {
    if (ctrD != null && ctrD <= DECAY_CTR_SPLIT_PCT) {
      return {
        diagnosis: 'creative_fatigue',
        why: `CTR ${fmtPct(ctrD)} and CPCONV ${fmtPct(convD)} versus the prior block — the market is tiring of this message.`,
      };
    }
    return {
      diagnosis: 'funnel_or_ops',
      why: `CPCONV ${fmtPct(convD)} while CTR held at ${fmtPct(ctrD)} — the creative is still pulling. Look at landing, speed-to-lead or one account before touching it.`,
    };
  }

  // Not decaying, but still far more expensive than its peers.
  if (row.cpconv_index != null && row.cpconv_index >= DEAD_CPCONV_INDEX) {
    return {
      diagnosis: 'underperforming',
      why: `CPCONV ${fmtMoney(row.cp_conversation)} is ${row.cpconv_index.toFixed(2)}x the product median with no sign of recovery — it is not earning its slot.`,
    };
  }

  const cheapLead = row.cpl != null && stats.medianCpl != null && row.cpl <= stats.medianCpl;
  const weakQual =
    row.qualified_rate != null && stats.medianQual != null && row.qualified_rate < stats.medianQual;
  const weakShow = row.show_rate != null && stats.medianShow != null && row.show_rate < stats.medianShow;
  if (cheapLead && (weakQual || weakShow)) {
    const reason = weakQual
      ? `qual ${row.qualified_rate}% vs ${stats.medianQual}% median`
      : `show ${row.show_rate}% vs ${stats.medianShow}% median`;
    return {
      diagnosis: 'wrong_person',
      why: `Cheap leads at ${fmtMoney(row.cpl)} CPL but ${reason} — it is buying volume, not buyers.`,
    };
  }

  if (
    stats.p75Spend != null &&
    row.spend >= stats.p75Spend &&
    row.cpconv_index != null &&
    row.cpconv_index <= 1
  ) {
    return {
      diagnosis: 'scaled',
      why: `Carrying ${fmtMoney(row.spend)} at ${row.cpconv_index.toFixed(2)}x the product's median CPCONV — scaled, not tired.`,
    };
  }

  const idx = row.cpconv_index;
  return {
    diagnosis: 'healthy',
    why:
      idx != null
        ? `CPCONV at ${idx.toFixed(2)}x the product median with no decay signal.`
        : 'No decay signal in this window.',
  };
}

function scoreHealth(row: {
  diagnosis: AdDiagnosis;
  cpconv_index: number | null;
  ctr_delta_pct: number | null;
  cpconv_delta_pct: number | null;
  days_since_spend: number | null;
}): number {
  let penalty = 0;
  if (row.cpconv_index != null) penalty += clamp((row.cpconv_index - 1) * 40, -20, 40);
  if (row.cpconv_delta_pct != null) penalty += clamp(row.cpconv_delta_pct * 0.5, 0, 25);
  if (row.ctr_delta_pct != null) penalty += clamp(-row.ctr_delta_pct * 0.5, 0, 20);
  if (row.days_since_spend != null && row.days_since_spend > ZOMBIE_DAYS) penalty += 25;
  if (row.diagnosis === 'wrong_person' || row.diagnosis === 'underperforming') penalty += 20;
  return Math.round(clamp(100 - penalty, 0, 100));
}

/* ------------------------------------------------------------------ *
 * Report
 * ------------------------------------------------------------------ */

export type BuildCreativeIntelInput = {
  metaRows: AdMetaRow[];
  events: AdEventRow[];
  resolver: AdLibraryResolver;
  start?: string | null;
  end?: string | null;
};

export function buildCreativeIntel(input: BuildCreativeIntelInput): CreativeIntelReport {
  const { metaRows, resolver } = input;
  const win = resolveIntelWindow(input.start, input.end);
  const events = withResolvedAdNames(input.events);

  const full = rollupAdPerformanceByLibrary(aggregateAdPerformance(metaRows, events), resolver);

  let recentMap = new Map<string, RolledUpAdPerformanceRow>();
  let priorMap = new Map<string, RolledUpAdPerformanceRow>();
  if (win.comparable && win.recent_start && win.recent_end && win.prior_start && win.prior_end) {
    recentMap = rollupFor(
      sliceMeta(metaRows, win.recent_start, win.recent_end),
      sliceEvents(events, win.recent_start, win.recent_end),
      resolver,
    );
    priorMap = rollupFor(
      sliceMeta(metaRows, win.prior_start, win.prior_end),
      sliceEvents(events, win.prior_start, win.prior_end),
      resolver,
    );
  }

  const lifecycle = spendDaysByAdName(metaRows);

  // Pass 1 — attach product, lifecycle and period blocks.
  type Draft = Omit<
    CreativeIntelRow,
    | 'cpconv_index'
    | 'spend_share'
    | 'cluster_ctr_median'
    | 'cluster_optin_median'
    | 'beats_cluster_ctr'
    | 'beats_cluster_optin'
    | 'diagnosis'
    | 'health_score'
    | 'why'
  >;

  const drafts: Draft[] = full.map((row) => {
    // Client ids stay server-side; the leaderboard route strips them too.
    const rest = { ...row };
    delete (rest as Partial<RolledUpAdPerformanceRow>).client_ids;
    const product = toProduct(row.library?.product);
    const life = lifecycleForRow(row, lifecycle);
    const recent = toPeriodBlock(recentMap.get(row.row_key));
    const prior = toPeriodBlock(priorMap.get(row.row_key));
    const signal =
      row.spend >= SIGNAL_MIN_SPEND && row.unique_conversations >= SIGNAL_MIN_CONVERSATIONS;

    return {
      ...rest,
      product,
      first_spend_date: life?.first ?? null,
      last_spend_date: life?.last ?? null,
      days_live: life ? daysInRange(life.first, life.last) : null,
      active_days: life?.activeDays ?? 0,
      days_since_spend: life && win.end ? daysInRange(life.last, win.end) - 1 : null,
      recent,
      prior,
      ctr_delta_pct: deltaPct(recent?.ctr ?? null, prior?.ctr ?? null),
      cpconv_delta_pct: deltaPct(recent?.cp_conversation ?? null, prior?.cp_conversation ?? null),
      signal,
      below_floor: row.spend < LEADERBOARD_FLOOR,
      supabase_ref: row.library ? `supabase:ad:${row.library.id}` : null,
    };
  });

  // Pass 2 — product baselines, computed over signal ads only.
  const statsByProduct = new Map<AdProductKey, ProductStats>();
  for (const product of PRODUCT_KEYS) {
    const inProduct = drafts.filter((d) => d.product === product);
    const signalRows = inProduct.filter((d) => d.signal);
    const pick = (fn: (d: Draft) => number | null) =>
      median(signalRows.map(fn).filter((v): v is number => v != null));
    const spends = inProduct.map((d) => d.spend).sort((a, b) => a - b);
    statsByProduct.set(product, {
      spend: inProduct.reduce((s, d) => s + d.spend, 0),
      medianCpconv: pick((d) => d.cp_conversation),
      medianCpl: pick((d) => d.cpl),
      medianQual: pick((d) => d.qualified_rate),
      medianShow: pick((d) => d.show_rate),
      medianCtr: pick((d) => d.ctr),
      medianOptin: pick((d) => d.optin_rate),
      p75Spend: spends.length ? spends[Math.floor(spends.length * 0.75)] : null,
    });
  }

  // Pass 3 — cluster baselines by product x format, for the test queue.
  const formatBaseline = new Map<string, { ctr: number | null; optin: number | null }>();
  for (const product of PRODUCT_KEYS) {
    const byFormat = new Map<string, Draft[]>();
    for (const d of drafts) {
      if (d.product !== product || !d.signal) continue;
      const slug = d.library?.ad_format;
      if (!slug) continue;
      byFormat.set(slug, [...(byFormat.get(slug) ?? []), d]);
    }
    for (const [slug, rows] of byFormat) {
      formatBaseline.set(`${product}|${slug}`, {
        ctr: median(rows.map((r) => r.ctr).filter((v): v is number => v != null)),
        optin: median(rows.map((r) => r.optin_rate).filter((v): v is number => v != null)),
      });
    }
  }

  // Pass 4 — finalize.
  const ads: CreativeIntelRow[] = drafts.map((d) => {
    const stats = statsByProduct.get(d.product)!;
    const cpconv_index =
      d.cp_conversation != null && stats.medianCpconv
        ? round(d.cp_conversation / stats.medianCpconv, 2)
        : null;
    const spend_share = stats.spend > 0 ? round((d.spend / stats.spend) * 100, 1) : null;

    const fmtKey = d.library?.ad_format ? `${d.product}|${d.library.ad_format}` : null;
    const baseline = fmtKey ? formatBaseline.get(fmtKey) : undefined;
    const cluster_ctr_median = baseline?.ctr ?? stats.medianCtr;
    const cluster_optin_median = baseline?.optin ?? stats.medianOptin;

    const enriched = {
      ...d,
      cpconv_index,
      spend_share,
      cluster_ctr_median: round(cluster_ctr_median, 2),
      cluster_optin_median: round(cluster_optin_median, 1),
      beats_cluster_ctr: d.ctr != null && cluster_ctr_median != null && d.ctr >= cluster_ctr_median,
      beats_cluster_optin:
        d.optin_rate != null && cluster_optin_median != null && d.optin_rate >= cluster_optin_median,
    };

    const { diagnosis, why } = diagnose(enriched, stats);
    return {
      ...enriched,
      diagnosis,
      why,
      health_score: scoreHealth({ ...enriched, diagnosis }),
    };
  });

  return {
    window: win,
    ads,
    clusters: buildClusters(ads, statsByProduct, recentMap, priorMap),
    products: buildProductRollups(ads, statsByProduct),
  };
}

/* ------------------------------------------------------------------ *
 * Clusters
 * ------------------------------------------------------------------ */

type ClusterAcc = {
  kind: 'tag' | 'format';
  key: string;
  label: string;
  product: AdProductKey;
  spend: number;
  conversations: number;
  ctrs: number[];
  optins: number[];
  ad_count: number;
  signal_ad_count: number;
  recentSpend: number;
  recentConversations: number;
  priorSpend: number;
  priorConversations: number;
};

/**
 * Concept clusters. Fatigue is usually the message rather than the format, so
 * spend soak is tracked per cluster and compared against the cluster's own
 * CPCONV drift — a format only looks tired when one message inside it ate the budget.
 */
function buildClusters(
  ads: CreativeIntelRow[],
  statsByProduct: Map<AdProductKey, ProductStats>,
  recentMap: Map<string, RolledUpAdPerformanceRow>,
  priorMap: Map<string, RolledUpAdPerformanceRow>,
): ClusterRow[] {
  const accs = new Map<string, ClusterAcc>();

  const add = (
    kind: 'tag' | 'format',
    key: string,
    label: string,
    ad: CreativeIntelRow,
  ): void => {
    const id = `${kind}|${ad.product}|${key}`;
    let acc = accs.get(id);
    if (!acc) {
      acc = {
        kind,
        key,
        label,
        product: ad.product,
        spend: 0,
        conversations: 0,
        ctrs: [],
        optins: [],
        ad_count: 0,
        signal_ad_count: 0,
        recentSpend: 0,
        recentConversations: 0,
        priorSpend: 0,
        priorConversations: 0,
      };
      accs.set(id, acc);
    }
    acc.spend += ad.spend;
    acc.conversations += ad.unique_conversations;
    acc.ad_count += 1;
    if (ad.signal) {
      acc.signal_ad_count += 1;
      if (ad.ctr != null) acc.ctrs.push(ad.ctr);
      if (ad.optin_rate != null) acc.optins.push(ad.optin_rate);
    }
    const r = recentMap.get(ad.row_key);
    if (r) {
      acc.recentSpend += r.spend;
      acc.recentConversations += r.unique_conversations;
    }
    const p = priorMap.get(ad.row_key);
    if (p) {
      acc.priorSpend += p.spend;
      acc.priorConversations += p.unique_conversations;
    }
  };

  for (const ad of ads) {
    for (const tag of ad.library?.tags ?? []) add('tag', tag.slug, tag.label, ad);
    const fmt = ad.library?.ad_format;
    if (fmt) add('format', fmt, fmt, ad);
  }

  return [...accs.values()]
    .map((acc) => {
      const productSpend = statsByProduct.get(acc.product)?.spend ?? 0;
      const recentCpconv = ratio(acc.recentSpend, acc.recentConversations);
      const priorCpconv = ratio(acc.priorSpend, acc.priorConversations);
      return {
        kind: acc.kind,
        key: acc.key,
        label: acc.label,
        product: acc.product,
        ad_count: acc.ad_count,
        signal_ad_count: acc.signal_ad_count,
        spend: round(acc.spend) ?? 0,
        spend_share: productSpend > 0 ? round((acc.spend / productSpend) * 100, 1) : null,
        cp_conversation: round(ratio(acc.spend, acc.conversations), 2),
        median_ctr: round(median(acc.ctrs), 2),
        median_optin: round(median(acc.optins), 1),
        cpconv_delta_pct: deltaPct(recentCpconv, priorCpconv),
      };
    })
    .sort((a, b) => b.spend - a.spend);
}

function buildProductRollups(
  ads: CreativeIntelRow[],
  statsByProduct: Map<AdProductKey, ProductStats>,
): ProductRollup[] {
  return PRODUCT_KEYS.map((product) => {
    const rows = ads.filter((a) => a.product === product);
    const spend = rows.reduce((s, a) => s + a.spend, 0);
    const conversations = rows.reduce((s, a) => s + a.unique_conversations, 0);
    const top3 = [...rows].sort((a, b) => b.spend - a.spend).slice(0, 3);
    const top3Spend = top3.reduce((s, a) => s + a.spend, 0);
    return {
      product,
      label: PRODUCT_LABELS[product],
      ad_count: rows.length,
      signal_ad_count: rows.filter((a) => a.signal).length,
      spend: round(spend) ?? 0,
      leads: rows.reduce((s, a) => s + a.leads, 0),
      qualified: rows.reduce((s, a) => s + a.qualified, 0),
      unique_conversations: conversations,
      cp_conversation: round(ratio(spend, conversations), 2),
      median_cpconv: round(statsByProduct.get(product)?.medianCpconv ?? null, 2),
      top3_spend_share: spend > 0 ? round((top3Spend / spend) * 100, 1) : null,
      fatiguing_spend:
        round(rows.filter((a) => a.diagnosis === 'creative_fatigue').reduce((s, a) => s + a.spend, 0)) ?? 0,
      zombie_spend:
        round(rows.filter((a) => a.diagnosis === 'zombie').reduce((s, a) => s + a.spend, 0)) ?? 0,
    };
  }).filter((p) => p.ad_count > 0);
}

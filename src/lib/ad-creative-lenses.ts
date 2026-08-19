/**
 * Shared vocabulary for Creative Command: the shapes the API returns, the
 * thresholds that decide them, and the preset questions asked of them.
 *
 * Deliberately free of runtime imports so the client bundle can hold the lens
 * logic without dragging in the ad-performance engine. `buildCreativeIntel` in
 * `ad-creative-intel.ts` produces these shapes server-side.
 */
import type { RolledUpAdPerformanceRow } from './ad-performance';

/* ------------------------------------------------------------------ *
 * Thresholds
 * ------------------------------------------------------------------ */

/** Below this an ad cannot support a claim. Mirrors the ad-performance-learnings skill. */
export const SIGNAL_MIN_SPEND = 500;
export const SIGNAL_MIN_CONVERSATIONS = 2;

/** The leaderboard's own display floor — ads under it are the test-queue population. */
export const LEADERBOARD_FLOOR = 250;
/** Under this there is not enough delivery to read CTR at all. */
export const TEST_QUEUE_MIN_SPEND = 50;

/** No spend for this many days at the end of the window = not actually running. */
export const ZOMBIE_DAYS = 7;

export const MAX_RECENT_DAYS = 14;
/** Under this the recent/prior split is too short to trust; the UI says so. */
export const MIN_WINDOW_FOR_CLEAN_SPLIT = 28;

/** A CPCONV rise past this is real decay rather than noise. */
export const DECAY_CPCONV_RISE_PCT = 20;
/**
 * The CTR split that assigns a cause to that decay. Below it people stopped
 * clicking, so the creative wore out; above it they still click and the loss is
 * downstream. The two rules partition the decay space, so a decaying ad always
 * gets a cause rather than falling through to "healthy".
 */
export const DECAY_CTR_SPLIT_PCT = -10;

/** Beat the product median CPCONV by this much to count as working. */
export const WORKING_CPCONV_INDEX = 0.85;
/** At or above this multiple of the product median, it is not earning its slot. */
export const DEAD_CPCONV_INDEX = 1.5;

/* ------------------------------------------------------------------ *
 * Shapes
 * ------------------------------------------------------------------ */

export type AdProductKey = 'reverse' | 'dscr' | 'broad_forward' | 'untagged';

export const PRODUCT_KEYS: AdProductKey[] = ['reverse', 'dscr', 'broad_forward', 'untagged'];

export const PRODUCT_LABELS: Record<AdProductKey, string> = {
  reverse: 'RM',
  dscr: 'DSCR',
  broad_forward: 'Broad Forward',
  untagged: 'Untagged',
};

export const PRODUCT_COLORS: Record<AdProductKey, string> = {
  reverse: '#38bdf8',
  dscr: '#fbbf24',
  broad_forward: '#a78bfa',
  untagged: '#64748b',
};

export type PeriodBlock = {
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number | null;
  optin_rate: number | null;
  leads: number;
  qualified: number;
  unique_conversations: number;
  cpl: number | null;
  cost_per_qualified: number | null;
  cp_conversation: number | null;
  qualified_rate: number | null;
  show_rate: number | null;
};

/**
 * What is wrong (or right) with this creative, in the order we act on it.
 * `funnel_or_ops` exists to stop us refreshing creative for a landing/setter problem.
 */
export type AdDiagnosis =
  | 'thin'
  | 'zombie'
  | 'creative_fatigue'
  | 'funnel_or_ops'
  | 'underperforming'
  | 'wrong_person'
  | 'scaled'
  | 'healthy';

export const DIAGNOSIS_LABELS: Record<AdDiagnosis, string> = {
  thin: 'Too thin',
  zombie: 'Stopped',
  creative_fatigue: 'Creative fatigue',
  funnel_or_ops: 'Funnel / ops',
  underperforming: 'Underperforming',
  wrong_person: 'Wrong person',
  scaled: 'Scaled',
  healthy: 'Healthy',
};

export const DIAGNOSIS_COLORS: Record<AdDiagnosis, string> = {
  thin: '#475569',
  zombie: '#64748b',
  creative_fatigue: '#fbbf24',
  funnel_or_ops: '#38bdf8',
  underperforming: '#fb923c',
  wrong_person: '#f87171',
  scaled: '#34d399',
  healthy: '#34d399',
};

export type CreativeIntelRow = Omit<RolledUpAdPerformanceRow, 'client_ids'> & {
  product: AdProductKey;

  /** Lifecycle, derived from days with spend inside the window. */
  first_spend_date: string | null;
  last_spend_date: string | null;
  days_live: number | null;
  active_days: number;
  /** Days between the last day with spend and the window end. */
  days_since_spend: number | null;

  recent: PeriodBlock | null;
  prior: PeriodBlock | null;
  ctr_delta_pct: number | null;
  cpconv_delta_pct: number | null;

  /** CPCONV over the product's median CPCONV among signal ads. Under 1.0 is good. */
  cpconv_index: number | null;
  /** Share of the product's total spend sitting on this creative. */
  spend_share: number | null;

  signal: boolean;
  below_floor: boolean;
  cluster_ctr_median: number | null;
  cluster_optin_median: number | null;
  beats_cluster_ctr: boolean;
  beats_cluster_optin: boolean;

  diagnosis: AdDiagnosis;
  health_score: number;
  why: string;
  /** Citation for the ad-performance-learnings skill. Null for unsourced ads. */
  supabase_ref: string | null;
};

export type ClusterRow = {
  kind: 'tag' | 'format';
  key: string;
  label: string;
  product: AdProductKey;
  ad_count: number;
  signal_ad_count: number;
  spend: number;
  /** Share of the product's spend soaked by this cluster. */
  spend_share: number | null;
  cp_conversation: number | null;
  median_ctr: number | null;
  median_optin: number | null;
  cpconv_delta_pct: number | null;
};

export type ProductRollup = {
  product: AdProductKey;
  label: string;
  ad_count: number;
  signal_ad_count: number;
  spend: number;
  leads: number;
  qualified: number;
  unique_conversations: number;
  cp_conversation: number | null;
  median_cpconv: number | null;
  /** Share of product spend on its three largest creatives — concentration risk. */
  top3_spend_share: number | null;
  fatiguing_spend: number;
  zombie_spend: number;
};

export type IntelWindow = {
  start: string | null;
  end: string | null;
  days: number;
  recent_start: string | null;
  recent_end: string | null;
  prior_start: string | null;
  prior_end: string | null;
  recent_days: number;
  /** Whether a recent-vs-prior split was computed at all. */
  comparable: boolean;
  /** Whether the window is long enough for a full 14-vs-14 read. */
  clean_split: boolean;
};

export type CreativeIntelReport = {
  window: IntelWindow;
  ads: CreativeIntelRow[];
  clusters: ClusterRow[];
  products: ProductRollup[];
};

export type CreativeIntelResponse = CreativeIntelReport & { truncated: boolean };

/* ------------------------------------------------------------------ *
 * Lenses
 * ------------------------------------------------------------------ */

export type LensId =
  | 'working'
  | 'fatiguing'
  | 'funnel'
  | 'wrong_person'
  | 'test_queue'
  | 'longest'
  | 'dead'
  | 'concentration';

export type LensDef = {
  id: LensId;
  question: string;
  short: string;
  /** What the lens is actually asserting, shown under the results. */
  blurb: string;
  accent: string;
  /** Concentration is a portfolio question, not an ad list. */
  portfolio?: boolean;
};

export const LENSES: LensDef[] = [
  {
    id: 'working',
    question: "What's working right now?",
    short: 'Working',
    blurb:
      'Signal ads beating the product median CPCONV by 15% or more, with no rising cost and no quality problem. These are the ones to scale.',
    accent: '#34d399',
  },
  {
    id: 'fatiguing',
    question: "What's fatiguing?",
    short: 'Fatiguing',
    blurb:
      'CPCONV up 20% or more against the prior block while CTR fell. The market is tiring of the message — refresh the execution, keep the concept.',
    accent: '#fbbf24',
  },
  {
    id: 'funnel',
    question: 'Funnel problem, not creative?',
    short: 'Funnel / ops',
    blurb:
      'CPCONV up 20% or more while CTR held. Do not prescribe a new hook here — check landing, speed-to-lead, setters, or a single account dragging the blend.',
    accent: '#38bdf8',
  },
  {
    id: 'wrong_person',
    question: "What's attracting the wrong person?",
    short: 'Wrong person',
    blurb:
      'Cheap leads with weak qualification or show rate. A winner that books junk is not a winner.',
    accent: '#f87171',
  },
  {
    id: 'test_queue',
    question: 'What should we test more?',
    short: 'Test queue',
    blurb:
      'Under the spend floor but already beating their cluster on CTR and opt-in. These have leading indicators and no budget — fund them next.',
    accent: '#a78bfa',
  },
  {
    id: 'longest',
    question: "What's been running longest?",
    short: 'Longest running',
    blurb: 'Ranked by days between first and last spend, annotated with current diagnosis.',
    accent: '#94a3b8',
  },
  {
    id: 'dead',
    question: "What's dead?",
    short: 'Dead',
    blurb:
      'Stopped delivering, or still running at 1.5x or more of the product median CPCONV. Either way it is not earning its slot.',
    accent: '#64748b',
  },
  {
    id: 'concentration',
    question: 'Where is our spend concentrated?',
    short: 'Concentration',
    blurb:
      'Share of each product budget riding its three largest creatives, and how much of that spend is fatiguing.',
    accent: '#f59e0b',
    portfolio: true,
  },
];

export function applyLens(id: LensId, rows: CreativeIntelRow[]): CreativeIntelRow[] {
  switch (id) {
    case 'working':
      // Beating peers is not enough on its own: an ad whose CPCONV is climbing
      // should never be presented as something to put more budget behind.
      return rows
        .filter(
          (r) =>
            r.signal &&
            r.cpconv_index != null &&
            r.cpconv_index <= WORKING_CPCONV_INDEX &&
            (r.diagnosis === 'healthy' || r.diagnosis === 'scaled') &&
            (r.cpconv_delta_pct == null || r.cpconv_delta_pct < DECAY_CPCONV_RISE_PCT),
        )
        .sort((a, b) => (a.cpconv_index ?? 99) - (b.cpconv_index ?? 99));

    case 'fatiguing':
      return rows.filter((r) => r.diagnosis === 'creative_fatigue').sort((a, b) => b.spend - a.spend);

    case 'funnel':
      return rows.filter((r) => r.diagnosis === 'funnel_or_ops').sort((a, b) => b.spend - a.spend);

    case 'wrong_person':
      return rows.filter((r) => r.diagnosis === 'wrong_person').sort((a, b) => b.spend - a.spend);

    case 'test_queue':
      return rows
        .filter(
          (r) =>
            r.below_floor &&
            r.spend >= TEST_QUEUE_MIN_SPEND &&
            r.beats_cluster_ctr &&
            r.beats_cluster_optin,
        )
        .sort((a, b) => (b.ctr ?? 0) - (a.ctr ?? 0));

    case 'longest':
      return rows
        .filter((r) => r.days_live != null)
        .sort((a, b) => (b.days_live ?? 0) - (a.days_live ?? 0));

    case 'dead':
      return rows
        .filter((r) => r.diagnosis === 'zombie' || r.diagnosis === 'underperforming')
        .sort((a, b) => b.spend - a.spend);

    case 'concentration':
      return [...rows].sort((a, b) => b.spend - a.spend);

    default:
      return rows;
  }
}

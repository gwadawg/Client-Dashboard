export type AdTagProduct = 'dscr' | 'reverse' | 'broad_forward';

export const AD_TAG_PRODUCTS: AdTagProduct[] = ['dscr', 'reverse', 'broad_forward'];

export type AdTagSelectionMode = 'single' | 'multi';

export type AdTagCategoryDef = {
  key: string;
  label: string;
  sort_order: number;
  /** Exactly one tag required when saving (UI + API). */
  required: boolean;
  selection_mode: AdTagSelectionMode;
  /** Shown last / labeled legacy; not required; excluded from primary rollups. */
  deprecated?: boolean;
};

export type AdTagSeed = {
  product: AdTagProduct;
  category: string;
  slug: string;
  label: string;
  sort_order: number;
};

const DSCR_CATEGORIES: AdTagCategoryDef[] = [
  { key: 'bucket', label: 'Bucket', sort_order: 10, required: true, selection_mode: 'single' },
  {
    key: 'creative_job',
    label: 'Creative job',
    sort_order: 20,
    required: true,
    selection_mode: 'single',
  },
  { key: 'concept', label: 'Concept', sort_order: 30, required: true, selection_mode: 'single' },
  { key: 'topic', label: 'Topic', sort_order: 40, required: false, selection_mode: 'multi' },
  {
    key: 'angle',
    label: 'Angle (legacy)',
    sort_order: 90,
    required: false,
    selection_mode: 'single',
    deprecated: true,
  },
];

const REVERSE_CATEGORIES: AdTagCategoryDef[] = [
  { key: 'track', label: 'Track', sort_order: 10, required: true, selection_mode: 'single' },
  { key: 'strategy', label: 'Strategy', sort_order: 20, required: true, selection_mode: 'single' },
  { key: 'outcome', label: 'Outcome', sort_order: 30, required: true, selection_mode: 'single' },
  { key: 'stage', label: 'Stage', sort_order: 40, required: true, selection_mode: 'single' },
  {
    key: 'equity_callout',
    label: 'Equity callout',
    sort_order: 50,
    required: true,
    selection_mode: 'single',
  },
  { key: 'concept', label: 'Concept', sort_order: 60, required: true, selection_mode: 'single' },
  { key: 'trigger', label: 'Trigger', sort_order: 70, required: false, selection_mode: 'multi' },
];

export function categoriesForProduct(product: AdTagProduct): AdTagCategoryDef[] {
  if (product === 'dscr') return DSCR_CATEGORIES;
  if (product === 'reverse') return REVERSE_CATEGORIES;
  return [];
}

export function categoryDef(
  product: AdTagProduct,
  category: string,
): AdTagCategoryDef | undefined {
  return categoriesForProduct(product).find((c) => c.key === category);
}

function seeds(
  product: AdTagProduct,
  category: string,
  items: [string, string][],
  baseOrder: number,
): AdTagSeed[] {
  return items.map(([slug, label], i) => ({
    product,
    category,
    slug,
    label,
    sort_order: baseOrder + i * 10,
  }));
}

/**
 * Active seed catalog. Removed values are deactivated by migration
 * (is_active = false) and are not listed here.
 */
export function seedTagsForProduct(product: AdTagProduct): AdTagSeed[] {
  if (product === 'dscr') {
    return [
      ...seeds(
        'dscr',
        'bucket',
        [
          ['denied', 'Denied'],
          ['deadline', 'Deadline'],
          ['idle', 'Idle'],
          ['in-market', 'In-market'],
        ],
        10,
      ),
      ...seeds(
        'dscr',
        'creative_job',
        [
          ['reveal', 'Reveal'],
          ['exit', 'Exit'],
          ['belief', 'Belief'],
          ['outcome', 'Outcome'],
          ['terms', 'Terms'],
          ['authority', 'Authority'],
        ],
        100,
      ),
      ...seeds(
        'dscr',
        'concept',
        [
          ['nodocs-speed', 'Nodocs speed'],
          ['balloon-exit', 'Balloon exit'],
          ['cashout-grow', 'Cashout grow'],
          ['qualify-stack', 'Qualify stack'],
          ['lo-authority', 'LO authority'],
          ['ratecard-centered', 'Ratecard centered'],
        ],
        200,
      ),
      ...seeds(
        'dscr',
        'topic',
        [
          ['write-offs', 'Write-offs'],
          ['property-count', 'Property count'],
          ['str', 'STR'],
          ['foreign-national', 'Foreign national'],
          ['llc', 'LLC'],
          ['free-and-clear', 'Free and clear'],
          ['cash-out', 'Cash-out'],
          ['rehab', 'Rehab'],
          ['reserves', 'Reserves'],
          ['rate-term', 'Rate/term'],
        ],
        400,
      ),
      // Legacy optional — kept for historical ads; not required on new labels.
      ...seeds(
        'dscr',
        'angle',
        [
          ['angle-1-idle-equity', 'Angle 1 — Idle equity'],
          ['angle-2-deadline', 'Angle 2 — Deadline'],
          ['angle-3-did-you-know', 'Angle 3 — Did you know'],
          ['angle-4-checklist', 'Angle 4 — Checklist'],
          ['angle-5-what-you-could-do', 'Angle 5 — What you could do'],
          ['angle-new', 'Angle — New'],
        ],
        900,
      ),
    ];
  }
  if (product === 'reverse') {
    return [
      ...seeds(
        'reverse',
        'track',
        [
          ['hecm', 'HECM'],
          ['second', 'Second'],
        ],
        10,
      ),
      ...seeds(
        'reverse',
        'strategy',
        [
          ['outcome-led', 'Outcome-led'],
          ['myth-led', 'Myth-led'],
        ],
        100,
      ),
      ...seeds(
        'reverse',
        'outcome',
        [
          ['payment-gone', 'Payment-gone'],
          ['cash-out', 'Cash-out'],
          ['standby-line', 'Standby-line'],
          ['multi', 'Multi'],
        ],
        200,
      ),
      ...seeds(
        'reverse',
        'stage',
        [
          ['tof', 'TOF'],
          ['mof', 'MOF'],
          ['bof', 'BOF'],
        ],
        300,
      ),
      ...seeds(
        'reverse',
        'equity_callout',
        [
          ['none', 'None'],
          ['soft', 'Soft'],
          ['hard', 'Hard'],
        ],
        400,
      ),
      ...seeds(
        'reverse',
        'concept',
        [
          ['equity-trap', 'Equity trap'],
          ['inflation-hedge', 'Inflation hedge'],
          ['payment-gone', 'Payment-gone'],
          ['standby-line', 'Standby-line'],
          ['myth-scary', 'Myth scary'],
          ['heirs-protected', 'Heirs protected'],
          ['grandkids-visit', 'Grandkids visit'],
          ['keep-rate', 'Keep rate'],
          ['second-not-reverse', 'Second not reverse'],
          ['lo-authority', 'LO authority'],
          ['breaking-news', 'Breaking news'],
          ['strategic-options', 'Options grid'],
          // Named visual families — keep under Concept (not Format catalog).
          ['named-proof', 'Named proof'],
          ['comment-reply', 'Comment reply'],
        ],
        500,
      ),
      ...seeds(
        'reverse',
        'trigger',
        [
          ['widow', 'Widow'],
          ['inflation', 'Inflation'],
          ['healthcare', 'Healthcare'],
          ['burden', 'Burden'],
          ['heirs', 'Heirs'],
          ['living-legacy', 'Living legacy'],
          ['stay-in-home', 'Stay in home'],
          ['surviving-vs-living', 'Surviving vs living'],
          ['payment-stress', 'Payment stress'],
          ['long-runway', 'Long runway'],
        ],
        600,
      ),
    ];
  }
  return [];
}

export function allSeedTags(): AdTagSeed[] {
  return AD_TAG_PRODUCTS.flatMap((p) => seedTagsForProduct(p));
}

export function isAdTagProduct(v: string | null | undefined): v is AdTagProduct {
  return v === 'dscr' || v === 'reverse' || v === 'broad_forward';
}

/** Slugs retired from the active catalog (still may exist as is_active=false). */
export const RETIRED_TAG_SLUGS: Record<AdTagProduct, { category: string; slug: string }[]> = {
  dscr: [
    { category: 'concept', slug: 'navy-suburban-headline' },
    { category: 'topic', slug: 'no-docs' },
    { category: 'topic', slug: 'rates' },
    { category: 'topic', slug: 'balloon' },
  ],
  reverse: [{ category: 'concept', slug: 'legacy-planner' }],
  broad_forward: [],
};

type TagRef = { category: string; slug: string };

/**
 * Soft pairing warnings for DSCR (does not block save).
 * Primary rollups use bucket + creative_job + concept — not angle.
 */
export function dscrTagPairingWarnings(tags: TagRef[]): string[] {
  const byCat = new Map<string, string>();
  for (const t of tags) {
    if (t.category === 'topic' || t.category === 'angle') continue;
    byCat.set(t.category, t.slug);
  }
  const bucket = byCat.get('bucket');
  const job = byCat.get('creative_job');
  const concept = byCat.get('concept');
  const warnings: string[] = [];

  if (bucket === 'in-market' && job && job !== 'terms') {
    warnings.push('In-market ads should use Creative job: Terms (primary).');
  }
  if (job === 'reveal' && bucket && bucket !== 'denied') {
    warnings.push('Reveal usually pairs with Bucket: Denied.');
  }
  if (job === 'reveal' && concept && concept !== 'nodocs-speed') {
    warnings.push('Reveal usually pairs with Concept: nodocs-speed.');
  }
  if (job === 'exit' && bucket && bucket !== 'deadline') {
    warnings.push('Exit usually pairs with Bucket: Deadline.');
  }
  if (job === 'exit' && concept && concept !== 'balloon-exit') {
    warnings.push('Exit usually pairs with Concept: balloon-exit.');
  }
  if (job === 'belief' && bucket && bucket !== 'idle') {
    warnings.push('Belief usually pairs with Bucket: Idle.');
  }
  if (job === 'belief' && concept && concept !== 'cashout-grow') {
    warnings.push('Belief usually pairs with Concept: cashout-grow.');
  }
  if (job === 'outcome' && concept && concept !== 'cashout-grow') {
    warnings.push('Outcome usually pairs with Concept: cashout-grow.');
  }
  if (job === 'authority' && concept && concept !== 'lo-authority') {
    warnings.push('Authority usually pairs with Concept: lo-authority.');
  }
  return warnings;
}

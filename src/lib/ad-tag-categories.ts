export type AdTagProduct = 'dscr' | 'reverse' | 'broad_forward';

export const AD_TAG_PRODUCTS: AdTagProduct[] = ['dscr', 'reverse', 'broad_forward'];

export type AdTagCategoryDef = {
  key: string;
  label: string;
  sort_order: number;
};

export type AdTagSeed = {
  product: AdTagProduct;
  category: string;
  slug: string;
  label: string;
  sort_order: number;
};

const DSCR_CATEGORIES: AdTagCategoryDef[] = [
  { key: 'bucket', label: 'Bucket', sort_order: 10 },
  { key: 'creative_job', label: 'Creative job', sort_order: 20 },
  { key: 'concept', label: 'Concept', sort_order: 30 },
  { key: 'angle', label: 'Angle', sort_order: 40 },
  { key: 'topic', label: 'Topic', sort_order: 50 },
];

const REVERSE_CATEGORIES: AdTagCategoryDef[] = [
  { key: 'track', label: 'Track', sort_order: 10 },
  { key: 'strategy', label: 'Strategy', sort_order: 20 },
  { key: 'outcome', label: 'Outcome', sort_order: 30 },
  { key: 'stage', label: 'Stage', sort_order: 40 },
  { key: 'equity_callout', label: 'Equity callout', sort_order: 50 },
  { key: 'concept', label: 'Concept', sort_order: 60 },
  { key: 'trigger', label: 'Trigger', sort_order: 70 },
];

export function categoriesForProduct(product: AdTagProduct): AdTagCategoryDef[] {
  if (product === 'dscr') return DSCR_CATEGORIES;
  if (product === 'reverse') return REVERSE_CATEGORIES;
  return [];
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

/** Full seed list — must match the design spec tables. */
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
          ['ratecard-centered', 'Ratecard centered'],
          ['navy-suburban-headline', 'Navy suburban headline'],
          ['qualify-stack', 'Qualify stack'],
          ['lo-authority', 'LO authority'],
        ],
        200,
      ),
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
        300,
      ),
      ...seeds(
        'dscr',
        'topic',
        [
          ['cash-out', 'Cash-out'],
          ['balloon', 'Balloon'],
          ['no-docs', 'No docs'],
          ['rates', 'Rates'],
          ['llc', 'LLC'],
          ['str', 'STR'],
          ['foreign-national', 'Foreign national'],
          ['write-offs', 'Write-offs'],
          ['property-count', 'Property count'],
          ['free-and-clear', 'Free and clear'],
        ],
        400,
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
          ['breaking-news', 'Breaking news'],
          ['strategic-options', 'Strategic options'],
          ['named-proof', 'Named proof'],
          ['comment-reply', 'Comment reply'],
          ['myth-scary', 'Myth scary'],
          ['keep-rate', 'Keep rate'],
          ['grandkids-visit', 'Grandkids visit'],
          ['legacy-planner', 'Legacy planner'],
          ['payment-gone', 'Payment-gone'],
          ['standby-line', 'Standby-line'],
          ['heirs-protected', 'Heirs protected'],
          ['lo-authority', 'LO authority'],
          ['second-not-reverse', 'Second not reverse'],
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

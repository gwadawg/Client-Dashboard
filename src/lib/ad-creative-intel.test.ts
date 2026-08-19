import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AdLibraryResolver, type AdEventRow, type AdLibraryMeta, type AdMetaRow } from './ad-performance';
import {
  applyLens,
  buildCreativeIntel,
  resolveIntelWindow,
  withResolvedAdNames,
} from './ad-creative-intel';

const START = '2026-05-01';
const END = '2026-07-29';

/** Inside the prior block (2026-07-02 .. 2026-07-15). */
const PRIOR_DAY = '2026-07-10';
/** Last day of the window, so nothing reads as stopped. */
const RECENT_DAY = '2026-07-29';

function lib(partial: Partial<AdLibraryMeta> & { id: string; ad_name: string }): AdLibraryMeta {
  return {
    status: 'active',
    platform: 'facebook',
    ad_format: 'ugc',
    product: 'reverse',
    summary: null,
    visual_notes: null,
    drive_url: null,
    thumbnail_url: null,
    tags: [],
    ...partial,
  };
}

function meta(partial: Partial<AdMetaRow> & { ad_name: string; insight_date: string }): AdMetaRow {
  return { client_id: 'c1', spend: 0, impressions: 0, clicks: 0, ...partial };
}

/** One qualified lead plus one show, on the same contact and day. */
function conversation(adName: string, contact: string, day: string): AdEventRow[] {
  return [
    {
      client_id: 'c1',
      event_type: 'lead',
      ghl_contact_id: contact,
      ad_name: adName,
      is_qualified: true,
      occurred_at: `${day}T12:00:00.000Z`,
    },
    {
      client_id: 'c1',
      event_type: 'show',
      ghl_contact_id: contact,
      ad_name: null,
      occurred_at: `${day}T15:00:00.000Z`,
    },
  ];
}

function conversations(adName: string, prefix: string, day: string, count: number): AdEventRow[] {
  return Array.from({ length: count }, (_, i) =>
    conversation(adName, `${prefix}-${i}`, day),
  ).flat();
}

/**
 * Tired  — CTR halves while CPCONV doubles  -> creative fatigue
 * Ops    — CTR holds while CPCONV doubles    -> funnel / ops
 * Stopped— spend only at the start of window -> zombie
 * Promise— under the floor but high CTR/optin-> test queue
 * Rogue  — spend with no library entry       -> untagged
 */
function scenario() {
  const library = [
    lib({ id: 'lib-tired', ad_name: 'Tired' }),
    lib({ id: 'lib-ops', ad_name: 'Ops' }),
    lib({ id: 'lib-stopped', ad_name: 'Stopped' }),
    lib({ id: 'lib-promise', ad_name: 'Promise' }),
  ];

  const metaRows: AdMetaRow[] = [
    meta({ ad_name: 'Tired', insight_date: PRIOR_DAY, spend: 400, impressions: 10000, clicks: 300 }),
    meta({ ad_name: 'Tired', insight_date: RECENT_DAY, spend: 400, impressions: 20000, clicks: 300 }),
    meta({ ad_name: 'Ops', insight_date: PRIOR_DAY, spend: 400, impressions: 10000, clicks: 300 }),
    meta({ ad_name: 'Ops', insight_date: RECENT_DAY, spend: 400, impressions: 10000, clicks: 300 }),
    meta({ ad_name: 'Stopped', insight_date: '2026-05-05', spend: 600, impressions: 10000, clicks: 200 }),
    meta({ ad_name: 'Promise', insight_date: RECENT_DAY, spend: 100, impressions: 1000, clicks: 50 }),
    meta({ ad_name: 'Rogue', insight_date: RECENT_DAY, spend: 900, impressions: 10000, clicks: 200 }),
  ];

  const events: AdEventRow[] = [
    ...conversations('Tired', 'tired-prior', PRIOR_DAY, 4),
    ...conversations('Tired', 'tired-recent', RECENT_DAY, 2),
    ...conversations('Ops', 'ops-prior', PRIOR_DAY, 4),
    ...conversations('Ops', 'ops-recent', RECENT_DAY, 2),
    ...conversations('Stopped', 'stopped', '2026-05-05', 3),
    ...conversations('Promise', 'promise', RECENT_DAY, 2),
    ...conversations('Rogue', 'rogue', RECENT_DAY, 3),
  ];

  const report = buildCreativeIntel({
    metaRows,
    events,
    resolver: new AdLibraryResolver(library, []),
    start: START,
    end: END,
  });
  const byName = new Map(report.ads.map((a) => [a.ad_name, a]));
  return { report, byName };
}

describe('resolveIntelWindow', () => {
  it('splits a 90-day window into 14 vs 14 ending at the range end', () => {
    const win = resolveIntelWindow(START, END);
    assert.equal(win.days, 90);
    assert.equal(win.recent_days, 14);
    assert.equal(win.recent_start, '2026-07-16');
    assert.equal(win.recent_end, END);
    assert.equal(win.prior_start, '2026-07-02');
    assert.equal(win.prior_end, '2026-07-15');
    assert.equal(win.comparable, true);
    assert.equal(win.clean_split, true);
  });

  it('halves a short window and flags it as not a clean split', () => {
    const win = resolveIntelWindow('2026-07-01', '2026-07-10');
    assert.equal(win.recent_days, 5);
    assert.equal(win.comparable, true);
    assert.equal(win.clean_split, false);
  });

  it('refuses to split a window too short to compare', () => {
    const win = resolveIntelWindow('2026-07-01', '2026-07-03');
    assert.equal(win.comparable, false);
    assert.equal(win.recent_start, null);
  });

  it('never lets the prior block escape the selected range', () => {
    const win = resolveIntelWindow('2026-07-01', '2026-07-08');
    assert.ok(win.prior_start! >= '2026-07-01');
  });
});

describe('withResolvedAdNames', () => {
  it("stamps a contact's later events with the ad from its lead", () => {
    const resolved = withResolvedAdNames([
      {
        client_id: 'c1',
        event_type: 'lead',
        ghl_contact_id: 'x',
        ad_name: 'Hook A',
        occurred_at: '2026-07-01T12:00:00.000Z',
      },
      {
        client_id: 'c1',
        event_type: 'show',
        ghl_contact_id: 'x',
        ad_name: null,
        occurred_at: '2026-07-20T12:00:00.000Z',
      },
    ]);
    assert.equal(resolved[1].ad_name, 'Hook A');
  });

  it('leaves an unattributable event alone', () => {
    const resolved = withResolvedAdNames([
      {
        client_id: 'c1',
        event_type: 'show',
        ghl_contact_id: 'orphan',
        ad_name: null,
        occurred_at: '2026-07-20T12:00:00.000Z',
      },
    ]);
    assert.equal(resolved[0].ad_name, null);
  });
});

describe('buildCreativeIntel diagnosis', () => {
  it('calls falling CTR with rising CPCONV creative fatigue', () => {
    const { byName } = scenario();
    const tired = byName.get('Tired')!;
    assert.equal(tired.signal, true);
    assert.equal(tired.ctr_delta_pct, -50);
    assert.equal(tired.cpconv_delta_pct, 100);
    assert.equal(tired.diagnosis, 'creative_fatigue');
  });

  it('calls held CTR with rising CPCONV a funnel problem, not a creative one', () => {
    const { byName } = scenario();
    const ops = byName.get('Ops')!;
    assert.equal(ops.ctr_delta_pct, 0);
    assert.equal(ops.cpconv_delta_pct, 100);
    assert.equal(ops.diagnosis, 'funnel_or_ops');
  });

  it('flags an ad with no spend near the window end as stopped', () => {
    const { byName } = scenario();
    const stopped = byName.get('Stopped')!;
    assert.equal(stopped.first_spend_date, '2026-05-05');
    assert.equal(stopped.last_spend_date, '2026-05-05');
    assert.equal(stopped.days_live, 1);
    assert.ok(stopped.days_since_spend! > 7);
    assert.equal(stopped.diagnosis, 'zombie');
  });

  it('excludes under-delivered ads from claims as thin', () => {
    const { byName } = scenario();
    assert.equal(byName.get('Promise')!.signal, false);
    assert.equal(byName.get('Promise')!.diagnosis, 'thin');
  });

  it('indexes CPCONV against the product median rather than raw dollars', () => {
    const { byName } = scenario();
    const tired = byName.get('Tired')!;
    assert.ok(tired.cpconv_index != null);
    assert.equal(tired.cp_conversation, 133.33);
  });
});

describe('buildCreativeIntel lifecycle', () => {
  it('counts only days that actually carried spend', () => {
    const { byName } = scenario();
    const tired = byName.get('Tired')!;
    assert.equal(tired.first_spend_date, PRIOR_DAY);
    assert.equal(tired.last_spend_date, RECENT_DAY);
    assert.equal(tired.active_days, 2);
    assert.equal(tired.days_live, 20);
    assert.equal(tired.days_since_spend, 0);
  });
});

describe('buildCreativeIntel products', () => {
  it('gives spend with no library entry its own bucket instead of dropping it', () => {
    const { report } = scenario();
    const untagged = report.products.find((p) => p.product === 'untagged');
    assert.ok(untagged, 'untagged rollup should exist');
    assert.equal(untagged!.spend, 900);
    assert.equal(untagged!.ad_count, 1);
  });

  it('reports concentration and fatiguing spend per product', () => {
    const { report } = scenario();
    // Tired 800 + Ops 800 + Stopped 600 + Promise 100
    const rm = report.products.find((p) => p.product === 'reverse')!;
    assert.equal(rm.spend, 2300);
    assert.equal(rm.fatiguing_spend, 800);
    assert.equal(rm.zombie_spend, 600);
    assert.equal(rm.top3_spend_share, 95.7);
  });
});

describe('buildCreativeIntel clusters', () => {
  it('soaks spend by format within a product', () => {
    const { report } = scenario();
    const ugc = report.clusters.find((c) => c.kind === 'format' && c.product === 'reverse');
    assert.ok(ugc);
    assert.equal(ugc!.spend, 2300);
    assert.equal(ugc!.ad_count, 4);
    // Promise is under the signal floor, so it cannot skew the cluster baseline.
    assert.equal(ugc!.signal_ad_count, 3);
  });
});

/**
 * Four signal ads so the product median lands between them rather than on one,
 * which lets an ad be cheap relative to peers *and* still be excluded from
 * "working" because its cost is climbing.
 */
function costScenario() {
  const library = [
    lib({ id: 'lib-cheap', ad_name: 'Cheap' }),
    lib({ id: 'lib-rising', ad_name: 'Rising' }),
    lib({ id: 'lib-mid', ad_name: 'Mid' }),
    lib({ id: 'lib-pricey', ad_name: 'Pricey' }),
  ];

  const metaRows: AdMetaRow[] = [
    meta({ ad_name: 'Cheap', insight_date: RECENT_DAY, spend: 600, impressions: 10000, clicks: 300 }),
    // Same CTR in both blocks, so only the cost moved.
    meta({ ad_name: 'Rising', insight_date: PRIOR_DAY, spend: 200, impressions: 10000, clicks: 300 }),
    meta({ ad_name: 'Rising', insight_date: RECENT_DAY, spend: 400, impressions: 10000, clicks: 300 }),
    meta({ ad_name: 'Mid', insight_date: RECENT_DAY, spend: 600, impressions: 10000, clicks: 300 }),
    meta({ ad_name: 'Pricey', insight_date: RECENT_DAY, spend: 900, impressions: 10000, clicks: 300 }),
  ];

  const events: AdEventRow[] = [
    ...conversations('Cheap', 'cheap', RECENT_DAY, 12),
    ...conversations('Rising', 'rising-prior', PRIOR_DAY, 8),
    ...conversations('Rising', 'rising-recent', RECENT_DAY, 8),
    ...conversations('Mid', 'mid', RECENT_DAY, 3),
    ...conversations('Pricey', 'pricey', RECENT_DAY, 2),
  ];

  const report = buildCreativeIntel({
    metaRows,
    events,
    resolver: new AdLibraryResolver(library, []),
    start: START,
    end: END,
  });
  return { report, byName: new Map(report.ads.map((a) => [a.ad_name, a])) };
}

describe('buildCreativeIntel cost outliers', () => {
  it('calls an ad far above the product median underperforming rather than healthy', () => {
    const { byName } = costScenario();
    const pricey = byName.get('Pricey')!;
    assert.equal(pricey.signal, true);
    assert.ok(pricey.cpconv_index! >= 1.5);
    assert.equal(pricey.diagnosis, 'underperforming');
  });

  it('always assigns a cause when CPCONV rises, never falling through to healthy', () => {
    const { byName } = costScenario();
    const rising = byName.get('Rising')!;
    assert.equal(rising.cpconv_delta_pct, 100);
    assert.equal(rising.ctr_delta_pct, 0);
    assert.equal(rising.diagnosis, 'funnel_or_ops');
  });

  it('keeps a cheap-but-climbing ad out of the working lens', () => {
    const { report, byName } = costScenario();
    const rising = byName.get('Rising')!;
    // It clears the cost bar, so only the rising trend can be excluding it.
    assert.ok(rising.cpconv_index! <= 0.85);
    const working = applyLens('working', report.ads).map((r) => r.ad_name);
    assert.ok(!working.includes('Rising'));
    assert.deepEqual(working, ['Cheap']);
  });

  it('lists cost outliers under the dead lens', () => {
    const { report } = costScenario();
    assert.ok(applyLens('dead', report.ads).some((r) => r.ad_name === 'Pricey'));
  });
});

describe('applyLens', () => {
  it('returns only the fatiguing ad for the fatigue lens', () => {
    const { report } = scenario();
    const rows = applyLens('fatiguing', report.ads);
    assert.deepEqual(rows.map((r) => r.ad_name), ['Tired']);
  });

  it('separates the funnel lens from the fatigue lens', () => {
    const { report } = scenario();
    assert.deepEqual(applyLens('funnel', report.ads).map((r) => r.ad_name), ['Ops']);
  });

  it('surfaces an under-spent ad that beats its cluster on CTR and opt-in', () => {
    const { report } = scenario();
    const rows = applyLens('test_queue', report.ads);
    assert.deepEqual(rows.map((r) => r.ad_name), ['Promise']);
    assert.equal(rows[0].beats_cluster_ctr, true);
    assert.equal(rows[0].beats_cluster_optin, true);
  });

  it('lists stopped ads under the dead lens', () => {
    const { report } = scenario();
    assert.ok(applyLens('dead', report.ads).some((r) => r.ad_name === 'Stopped'));
  });

  it('ranks the longest-running ads first', () => {
    const { report } = scenario();
    const rows = applyLens('longest', report.ads);
    assert.equal(rows[0].ad_name, 'Tired');
  });
});

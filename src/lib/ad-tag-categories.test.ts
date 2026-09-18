import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  AD_TAG_PRODUCTS,
  categoriesForProduct,
  dscrTagPairingWarnings,
  RETIRED_TAG_SLUGS,
  seedTagsForProduct,
} from './ad-tag-categories';
import { enforceCategorySelectionRules } from './ad-tags-resolve';

describe('ad-tag-categories', () => {
  it('defines DSCR categories with angle deprecated last', () => {
    const keys = categoriesForProduct('dscr').map((c) => c.key);
    assert.deepEqual(keys, ['bucket', 'creative_job', 'concept', 'topic', 'angle']);
    const angle = categoriesForProduct('dscr').find((c) => c.key === 'angle')!;
    assert.equal(angle.deprecated, true);
    assert.equal(angle.required, false);
    assert.equal(angle.selection_mode, 'single');
  });

  it('requires single-select on DSCR bucket/job/concept; topic is multi', () => {
    const byKey = Object.fromEntries(
      categoriesForProduct('dscr').map((c) => [c.key, c]),
    );
    assert.equal(byKey.bucket.selection_mode, 'single');
    assert.equal(byKey.creative_job.required, true);
    assert.equal(byKey.concept.required, true);
    assert.equal(byKey.topic.selection_mode, 'multi');
    assert.equal(byKey.topic.required, false);
  });

  it('keeps seed slugs unique within product × category', () => {
    for (const product of AD_TAG_PRODUCTS) {
      for (const cat of categoriesForProduct(product)) {
        const slugs = seedTagsForProduct(product)
          .filter((t) => t.category === cat.key)
          .map((t) => t.slug);
        assert.equal(new Set(slugs).size, slugs.length, `${product}/${cat.key}`);
      }
    }
  });

  it('seeds the DSCR contract concept + topic lists', () => {
    const concepts = seedTagsForProduct('dscr')
      .filter((t) => t.category === 'concept')
      .map((t) => t.slug)
      .sort();
    assert.deepEqual(concepts, [
      'balloon-exit',
      'cashout-grow',
      'lo-authority',
      'nodocs-speed',
      'qualify-stack',
      'ratecard-centered',
    ]);
    const topics = seedTagsForProduct('dscr')
      .filter((t) => t.category === 'topic')
      .map((t) => t.slug);
    assert.ok(topics.includes('rehab'));
    assert.ok(topics.includes('reserves'));
    assert.ok(topics.includes('rate-term'));
    assert.ok(!topics.includes('no-docs'));
    assert.ok(!topics.includes('balloon'));
  });

  it('removes legacy-planner and renames strategic-options label', () => {
    const concepts = seedTagsForProduct('reverse').filter((t) => t.category === 'concept');
    assert.ok(!concepts.some((t) => t.slug === 'legacy-planner'));
    const options = concepts.find((t) => t.slug === 'strategic-options');
    assert.equal(options?.label, 'Options grid');
    assert.ok(concepts.some((t) => t.slug === 'named-proof'));
    assert.ok(concepts.some((t) => t.slug === 'comment-reply'));
  });

  it('lists retired slugs for migration', () => {
    assert.ok(
      RETIRED_TAG_SLUGS.dscr.some((t) => t.slug === 'navy-suburban-headline'),
    );
    assert.ok(RETIRED_TAG_SLUGS.reverse.some((t) => t.slug === 'legacy-planner'));
  });
});

describe('enforceCategorySelectionRules', () => {
  it('rejects two buckets', () => {
    const r = enforceCategorySelectionRules('dscr', [
      { id: '1', category: 'bucket', slug: 'denied' },
      { id: '2', category: 'bucket', slug: 'idle' },
      { id: '3', category: 'creative_job', slug: 'reveal' },
      { id: '4', category: 'concept', slug: 'nodocs-speed' },
    ]);
    assert.match(r.error ?? '', /Bucket allows only one/);
  });

  it('requires bucket + creative_job + concept', () => {
    const r = enforceCategorySelectionRules('dscr', [
      { id: '1', category: 'bucket', slug: 'denied' },
      { id: '2', category: 'topic', slug: 'write-offs' },
    ]);
    assert.match(r.error ?? '', /Creative job is required/);
  });

  it('allows multi topic', () => {
    const r = enforceCategorySelectionRules('dscr', [
      { id: '1', category: 'bucket', slug: 'idle' },
      { id: '2', category: 'creative_job', slug: 'outcome' },
      { id: '3', category: 'concept', slug: 'cashout-grow' },
      { id: '4', category: 'topic', slug: 'cash-out' },
      { id: '5', category: 'topic', slug: 'rehab' },
    ]);
    assert.equal(r.error, undefined);
  });
});

describe('dscrTagPairingWarnings', () => {
  it('warns when in-market is not Terms', () => {
    const w = dscrTagPairingWarnings([
      { category: 'bucket', slug: 'in-market' },
      { category: 'creative_job', slug: 'reveal' },
      { category: 'concept', slug: 'nodocs-speed' },
    ]);
    assert.ok(w.some((x) => /Terms/.test(x)));
  });
});

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  AD_TAG_PRODUCTS,
  categoriesForProduct,
  seedTagsForProduct,
} from './ad-tag-categories';

describe('ad-tag-categories', () => {
  it('defines DSCR and reverse category lists', () => {
    assert.deepEqual(
      categoriesForProduct('dscr').map((c) => c.key),
      ['bucket', 'creative_job', 'concept', 'angle', 'topic'],
    );
    assert.deepEqual(
      categoriesForProduct('reverse').map((c) => c.key),
      ['track', 'strategy', 'outcome', 'stage', 'equity_callout', 'concept', 'trigger'],
    );
    assert.deepEqual(categoriesForProduct('broad_forward'), []);
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

  it('seeds denied and hecm', () => {
    assert.ok(
      seedTagsForProduct('dscr').some((t) => t.category === 'bucket' && t.slug === 'denied'),
    );
    assert.ok(
      seedTagsForProduct('reverse').some((t) => t.category === 'track' && t.slug === 'hecm'),
    );
  });
});

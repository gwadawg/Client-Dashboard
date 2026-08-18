import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTagSlugs, slugifyAdTag } from './ad-tags';

describe('slugifyAdTag', () => {
  it('slugifies topic labels', () => {
    assert.equal(slugifyAdTag('Cash Out'), 'cash-out');
    assert.equal(slugifyAdTag('  HECM  '), 'hecm');
  });

  it('falls back when the label has no usable characters', () => {
    assert.equal(slugifyAdTag('!!!'), 'tag');
  });
});

describe('normalizeTagSlugs', () => {
  it('dedupes and trims', () => {
    assert.deepEqual(normalizeTagSlugs(['Rates', 'rates', ' cash-out ']), {
      slugs: ['rates', 'cash-out'],
    });
  });

  it('rejects non-arrays', () => {
    assert.equal(normalizeTagSlugs('rates').error, 'tags must be an array of slugs');
  });
});

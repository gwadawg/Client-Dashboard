import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  filterTagsForProduct,
  normalizeTagIds,
  tagsAfterProductChange,
} from './ad-tags-resolve';
import type { AdTagRef } from './ad-tags';

const catalog: AdTagRef[] = [
  { id: '1', slug: 'denied', label: 'Denied', product: 'dscr', category: 'bucket' },
  { id: '2', slug: 'hecm', label: 'HECM', product: 'reverse', category: 'track' },
  { id: '3', slug: 'cash-out', label: 'Cash-out', product: 'dscr', category: 'topic' },
];

describe('ad-tags-resolve', () => {
  it('normalizeTagIds dedupes and rejects non-strings', () => {
    assert.deepEqual(normalizeTagIds(['1', '1', '2']).ids, ['1', '2']);
    assert.equal(normalizeTagIds('x').error, 'tags must be an array of tag ids');
  });

  it('filterTagsForProduct drops other products', () => {
    assert.deepEqual(
      filterTagsForProduct(catalog, 'dscr').map((t) => t.id),
      ['1', '3'],
    );
  });

  it('tagsAfterProductChange keeps only matching product ids', () => {
    assert.deepEqual(tagsAfterProductChange(['1', '2', '3'], catalog, 'dscr'), ['1', '3']);
    assert.deepEqual(tagsAfterProductChange(['1', '2'], catalog, 'reverse'), ['2']);
  });
});

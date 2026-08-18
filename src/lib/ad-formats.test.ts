import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { adFormatLabel, adFormatLabelMap, slugifyAdFormat } from './ad-formats';

describe('slugifyAdFormat', () => {
  it('slugifies display names', () => {
    assert.equal(slugifyAdFormat('Hook UGC'), 'hook-ugc');
    assert.equal(slugifyAdFormat('  Static  '), 'static');
    assert.equal(slugifyAdFormat('Before/After'), 'before-after');
  });

  it('falls back when the label has no usable characters', () => {
    assert.equal(slugifyAdFormat('!!!'), 'format');
    assert.equal(slugifyAdFormat('   '), 'format');
  });
});

describe('adFormatLabelMap', () => {
  it('maps slug to label and falls back to the slug', () => {
    const labels = adFormatLabelMap([
      { slug: 'ugc', label: 'UGC' },
      { slug: 'static', label: 'Static' },
    ]);
    assert.equal(adFormatLabel('ugc', labels), 'UGC');
    assert.equal(adFormatLabel('motion', labels), 'motion');
    assert.equal(adFormatLabel(null, labels), '');
  });
});

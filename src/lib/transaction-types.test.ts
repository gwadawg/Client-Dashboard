import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatTransactionLabel,
  parseTransactionLabel,
} from './transaction-types';

describe('formatTransactionLabel', () => {
  it('formats standard types', () => {
    assert.equal(formatTransactionLabel('heloc', null), 'HELOC');
    assert.equal(formatTransactionLabel('traditional_forward', null), 'Traditional Forward');
  });

  it('formats other with detail', () => {
    assert.equal(formatTransactionLabel('other', 'cash-out refi'), 'Other: cash-out refi');
  });

  it('returns null for empty other', () => {
    assert.equal(formatTransactionLabel('other', ''), null);
    assert.equal(formatTransactionLabel('', null), null);
  });
});

describe('parseTransactionLabel', () => {
  it('parses known labels', () => {
    assert.deepEqual(parseTransactionLabel('DSCR'), { slug: 'dscr', other: '' });
    assert.deepEqual(parseTransactionLabel('Reverse'), { slug: 'reverse', other: '' });
  });

  it('parses other prefix', () => {
    assert.deepEqual(parseTransactionLabel('Other: 1st lien'), {
      slug: 'other',
      other: '1st lien',
    });
  });

  it('treats legacy free text as other', () => {
    assert.deepEqual(parseTransactionLabel('cash-out'), {
      slug: 'other',
      other: 'cash-out',
    });
  });
});

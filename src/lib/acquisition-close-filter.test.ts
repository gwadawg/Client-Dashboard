import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { countsTowardCacDenominator } from './acquisition-close-filter';

describe('countsTowardCacDenominator', () => {
  it('includes missing, null, and standard; excludes reinstate', () => {
    assert.equal(countsTowardCacDenominator(undefined), true);
    assert.equal(countsTowardCacDenominator(null), true);
    assert.equal(countsTowardCacDenominator('standard'), true);
    assert.equal(countsTowardCacDenominator('reinstate'), false);
  });
});

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { enforceRowCap, rowsHitCap, truncationMessage } from '@/lib/row-cap';

describe('row-cap', () => {
  it('detects hitting the cap', () => {
    assert.equal(rowsHitCap(99_999, 100_000), false);
    assert.equal(rowsHitCap(100_000, 100_000), true);
    assert.equal(rowsHitCap(100_001, 100_000), true);
  });

  it('throws in production when truncated', () => {
    const prev = process.env.NODE_ENV;
    const prevAllow = process.env.ALLOW_TRUNCATED_METRICS;
    process.env.NODE_ENV = 'production';
    delete process.env.ALLOW_TRUNCATED_METRICS;
    try {
      assert.throws(
        () => enforceRowCap(100_000, 100_000, 'test'),
        /truncated at 100000/,
      );
    } finally {
      process.env.NODE_ENV = prev;
      if (prevAllow !== undefined) process.env.ALLOW_TRUNCATED_METRICS = prevAllow;
      else delete process.env.ALLOW_TRUNCATED_METRICS;
    }
  });

  it('returns warning outside production', () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';
    try {
      const warn = enforceRowCap(100_000, 100_000, 'test');
      assert.equal(warn, truncationMessage('test', 100_000));
      assert.equal(enforceRowCap(10, 100_000, 'test'), null);
    } finally {
      process.env.NODE_ENV = prev;
    }
  });
});

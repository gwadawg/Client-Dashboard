import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  acquisitionScheduledPayWindowOrFilter,
  showEventsPayWindowOrFilter,
} from '@/lib/agent-call-rep-credits';
import { isClosedUtcRange, metricsRangeCacheKey } from '@/lib/metrics-range-cache';

describe('showEventsPayWindowOrFilter', () => {
  it('bounds null scheduled_at with occurred_at window', () => {
    const f = showEventsPayWindowOrFilter('2026-06-01', '2026-06-30');
    assert.match(f, /scheduled_at\.gte\.2026-06-01/);
    assert.match(f, /scheduled_at\.is\.null/);
    assert.match(f, /occurred_at\.gte\.2026-06-01/);
    assert.match(f, /occurred_at\.lte\.2026-06-30/);
    assert.doesNotMatch(f, /scheduled_at\.is\.null$/);
  });
});

describe('acquisitionScheduledPayWindowOrFilter', () => {
  it('bounds null scheduled_at with booked_at window', () => {
    const f = acquisitionScheduledPayWindowOrFilter('2026-06-01', '2026-06-30');
    assert.match(f, /booked_at\.gte\.2026-06-01/);
    assert.match(f, /scheduled_at\.is\.null/);
  });
});

describe('metrics range cache helpers', () => {
  it('treats end < today UTC as closed', () => {
    assert.equal(isClosedUtcRange('2026-01-01', '2026-01-31', new Date('2026-02-01T00:00:00Z')), true);
    assert.equal(isClosedUtcRange('2026-01-01', '2026-02-01', new Date('2026-02-01T00:00:00Z')), false);
  });

  it('builds stable cache keys', () => {
    const a = metricsRangeCacheKey(['b', 'a'], '2026-01-01', '2026-01-07');
    const b = metricsRangeCacheKey(['a', 'b'], '2026-01-01', '2026-01-07');
    assert.equal(a, b);
  });
});

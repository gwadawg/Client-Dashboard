import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  getDateRange,
  presetOrderWithSinceLaunch,
  ymdLocal,
} from './date-presets';

describe('getDateRange since_launch', () => {
  it('starts at launch date and ends today', () => {
    const today = ymdLocal(new Date());
    assert.deepEqual(getDateRange('since_launch', '2026-01-15'), {
      start: '2026-01-15',
      end: today,
    });
  });

  it('accepts a full ISO launch timestamp', () => {
    const today = ymdLocal(new Date());
    assert.equal(getDateRange('since_launch', '2026-03-01T00:00:00.000Z').start, '2026-03-01');
    assert.equal(getDateRange('since_launch', '2026-03-01T00:00:00.000Z').end, today);
  });

  it('clamps to today when launch is missing or in the future', () => {
    const today = ymdLocal(new Date());
    assert.deepEqual(getDateRange('since_launch'), { start: today, end: today });
    assert.deepEqual(getDateRange('since_launch', '2099-01-01'), { start: today, end: today });
  });
});

describe('presetOrderWithSinceLaunch', () => {
  it('inserts since_launch before all_time', () => {
    const order = presetOrderWithSinceLaunch();
    assert.equal(order[order.indexOf('all_time') - 1], 'since_launch');
    assert.ok(order.includes('custom'));
  });
});

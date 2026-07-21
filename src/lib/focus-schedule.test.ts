import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeTime,
  validateFocusCreate,
  validateFocusPatch,
} from './focus-schedule';

describe('focus-schedule validation', () => {
  it('normalizeTime accepts HH:MM and HH:MM:SS', () => {
    assert.equal(normalizeTime('9:00'), '09:00');
    assert.equal(normalizeTime('09:30'), '09:30');
    assert.equal(normalizeTime('09:30:00'), '09:30');
    assert.equal(normalizeTime('bad'), null);
  });

  it('validateFocusCreate requires client, date, and times with end after start', () => {
    const ok = validateFocusCreate({
      client_id: 'c1',
      scheduled_date: '2026-07-20',
      time_start: '09:00',
      time_end: '11:00',
    });
    assert.equal(ok.ok, true);
    if (ok.ok) {
      assert.equal(ok.value.status, 'scheduled');
      assert.equal(ok.value.agent_id, null);
    }

    const missingClient = validateFocusCreate({
      scheduled_date: '2026-07-20',
      time_start: '09:00',
      time_end: '11:00',
    });
    assert.equal(missingClient.ok, false);

    const badRange = validateFocusCreate({
      client_id: 'c1',
      scheduled_date: '2026-07-20',
      time_start: '11:00',
      time_end: '09:00',
    });
    assert.equal(badRange.ok, false);
    if (!badRange.ok) {
      assert.match(badRange.error, /time_end must be after/);
    }
  });

  it('validateFocusPatch rejects end before start against existing times', () => {
    const bad = validateFocusPatch(
      { time_end: '08:00' },
      { time_start: '09:00', time_end: '11:00' },
    );
    assert.equal(bad.ok, false);

    const ok = validateFocusPatch(
      { status: 'done', agent_id: '' },
      { time_start: '09:00', time_end: '11:00' },
    );
    assert.equal(ok.ok, true);
    if (ok.ok) {
      assert.equal(ok.value.status, 'done');
      assert.equal(ok.value.agent_id, null);
    }
  });
});

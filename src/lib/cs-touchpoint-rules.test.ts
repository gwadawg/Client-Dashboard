import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  allowEventTouchpoints,
  daysSinceAnchor,
  isMonth1,
  M1_DURATION_DAYS,
  nextM2BiweeklyDueIso,
  tenureAnchor,
  tenurePhaseLabel,
} from './cs-touchpoints';

describe('tenureAnchor', () => {
  it('prefers launch_date over date_signed', () => {
    assert.equal(
      tenureAnchor({ launch_date: '2026-06-01', date_signed: '2026-05-01' }),
      '2026-06-01',
    );
  });

  it('falls back to date_signed', () => {
    assert.equal(
      tenureAnchor({ launch_date: null, date_signed: '2026-05-15' }),
      '2026-05-15',
    );
  });

  it('returns null when neither is set', () => {
    assert.equal(tenureAnchor({ launch_date: null, date_signed: null }), null);
  });

  it('trims ISO timestamps to YYYY-MM-DD', () => {
    assert.equal(
      tenureAnchor({ launch_date: '2026-06-01T12:00:00.000Z', date_signed: null }),
      '2026-06-01',
    );
  });
});

describe('daysSinceAnchor / isMonth1', () => {
  const now = new Date('2026-07-20T15:00:00.000Z');

  it('counts whole UTC days from anchor', () => {
    assert.equal(daysSinceAnchor('2026-07-20', now), 0);
    assert.equal(daysSinceAnchor('2026-07-10', now), 10);
    assert.equal(daysSinceAnchor('2026-06-20', now), 30);
  });

  it('treats days 0–29 as Month 1', () => {
    assert.equal(isMonth1('2026-07-20', now), true);
    assert.equal(isMonth1('2026-06-21', now), true); // day 29
    assert.equal(isMonth1('2026-06-20', now), false); // day 30
    assert.equal(M1_DURATION_DAYS, 30);
  });
});

describe('allowEventTouchpoints', () => {
  const now = new Date('2026-07-20T15:00:00.000Z');

  it('allows events with no tenure anchor (pre-launch)', () => {
    assert.equal(
      allowEventTouchpoints({ launch_date: null, date_signed: null }, now),
      true,
    );
  });

  it('allows events during Month 1 from launch', () => {
    assert.equal(
      allowEventTouchpoints({ launch_date: '2026-07-01', date_signed: null }, now),
      true,
    );
  });

  it('blocks events after Month 1 (day 30+)', () => {
    assert.equal(
      allowEventTouchpoints({ launch_date: '2026-06-01', date_signed: null }, now),
      false,
    );
  });

  it('uses date_signed when launch is missing', () => {
    assert.equal(
      allowEventTouchpoints({ launch_date: null, date_signed: '2026-06-01' }, now),
      false,
    );
    assert.equal(
      allowEventTouchpoints({ launch_date: null, date_signed: '2026-07-10' }, now),
      true,
    );
  });
});

describe('tenurePhaseLabel', () => {
  const now = new Date('2026-07-20T15:00:00.000Z');

  it('labels M1 vs M2+', () => {
    assert.deepEqual(
      tenurePhaseLabel({ launch_date: '2026-07-10', date_signed: null }, now),
      { days: 10, phase: 'm1' },
    );
    assert.deepEqual(
      tenurePhaseLabel({ launch_date: '2026-05-01', date_signed: null }, now),
      { days: 80, phase: 'm2' },
    );
  });

  it('returns unknown without anchor', () => {
    assert.deepEqual(
      tenurePhaseLabel({ launch_date: null, date_signed: null }, now),
      { days: null, phase: 'unknown' },
    );
  });
});

describe('nextM2BiweeklyDueIso', () => {
  it('stays on launch+30 / +14 grid and does not clamp to now', () => {
    const now = new Date('2026-07-20T15:00:00.000Z');
    // launch 2026-06-08 → +30 = 2026-07-08 → next on/after Jul 20 = 2026-07-22
    assert.equal(nextM2BiweeklyDueIso('2026-06-08', now).slice(0, 10), '2026-07-22');
    // launch 2026-06-20 → +30 = 2026-07-20 → due that day
    assert.equal(nextM2BiweeklyDueIso('2026-06-20', now).slice(0, 10), '2026-07-20');
  });
});

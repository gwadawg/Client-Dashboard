import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  appointmentDay,
  inPeriod,
  isYmd,
  summarizeBillingWork,
} from './billing-work-report';

describe('billing-work-report helpers', () => {
  it('validates ymd', () => {
    assert.equal(isYmd('2026-06-01'), true);
    assert.equal(isYmd('06-01-2026'), false);
    assert.equal(isYmd(null), false);
  });

  it('prefers scheduled_at day over occurred_at', () => {
    assert.equal(
      appointmentDay({ scheduled_at: '2026-06-15T18:00:00.000Z', occurred_at: '2026-06-01T12:00:00.000Z' }),
      '2026-06-15',
    );
    assert.equal(
      appointmentDay({ scheduled_at: null, occurred_at: '2026-06-01T12:00:00.000Z' }),
      '2026-06-01',
    );
  });

  it('filters by period using appointment day', () => {
    assert.equal(
      inPeriod({ scheduled_at: '2026-06-15T18:00:00.000Z' }, '2026-06-01', '2026-06-30'),
      true,
    );
    assert.equal(
      inPeriod({ scheduled_at: '2026-05-31T18:00:00.000Z' }, '2026-06-01', '2026-06-30'),
      false,
    );
  });

  it('summarizes show and bail rates', () => {
    const s = summarizeBillingWork([
      { status: 'show' },
      { status: 'show' },
      { status: 'no_show' },
      { status: 'lo_bailed' },
      { status: 'pending' },
      { status: 'appointment_cancelled' },
    ]);
    assert.equal(s.booked, 6);
    assert.equal(s.shows, 2);
    assert.equal(s.no_shows, 1);
    assert.equal(s.lo_bailed, 1);
    assert.equal(s.pending, 1);
    assert.equal(s.cancelled, 1);
    assert.equal(s.show_rate, 50); // 2 / (2+1+1)
    assert.equal(s.net_show_rate, (2 / 3) * 100);
    assert.equal(s.lo_bail_rate, (1 / 6) * 100);
  });
});

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assignBillableOutcomes,
  isYmd,
  summarizeBillingWork,
} from './billing-work-report';

describe('billing-work-report helpers', () => {
  it('validates ymd', () => {
    assert.equal(isYmd('2026-06-01'), true);
    assert.equal(isYmd('06-01-2026'), false);
  });

  it('charges unique shows; bail then show is not charged for bail', () => {
    const result = assignBillableOutcomes(
      'client-1',
      [
        {
          id: 's1',
          event_type: 'show',
          occurred_at: '2026-07-10T15:00:00.000Z',
          ghl_contact_id: 'lead-a',
        },
        {
          id: 's2',
          event_type: 'show',
          occurred_at: '2026-07-20T15:00:00.000Z',
          ghl_contact_id: 'lead-a',
        },
      ],
      [
        {
          id: 'b1',
          event_type: 'lo_bailed',
          occurred_at: '2026-07-05T15:00:00.000Z',
          ghl_contact_id: 'lead-a',
        },
        {
          id: 'b2',
          event_type: 'lo_bailed',
          occurred_at: '2026-07-01T15:00:00.000Z',
          ghl_contact_id: 'lead-b',
        },
      ],
    );

    assert.equal(result.unique_shows, 1);
    assert.equal(result.unique_lo_bailed, 1);
    assert.equal(result.showFlags.get('s1')?.billable, true);
    assert.equal(result.showFlags.get('s2')?.billable, false);
    assert.match(result.showFlags.get('s2')?.dupe_reason ?? '', /Duplicate show/);
    assert.equal(result.bailFlags.get('b1')?.billable, false);
    assert.match(result.bailFlags.get('b1')?.dupe_reason ?? '', /showed after/i);
    assert.equal(result.bailFlags.get('b2')?.billable, true);
  });

  it('summarizes raw rates and unique billable counts', () => {
    const s = summarizeBillingWork({
      booked: 85,
      unique_booked: 72,
      shows: 51,
      unique_shows: 43,
      no_shows: 16,
      lo_bailed: 8,
      unique_lo_bailed: 6,
      cancelled: 9,
      rescheduled: 0,
      pending: 11,
    });
    assert.equal(s.unique_shows, 43);
    assert.equal(s.unique_lo_bailed, 6);
    assert.equal(s.show_rate, (51 / (51 + 16 + 8)) * 100);
  });
});

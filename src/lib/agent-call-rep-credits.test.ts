import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { countCallRepCreditsByAgent } from '@/lib/agent-call-rep-credits';

const resolve = (raw: string | null | undefined) => (raw ? raw.trim() : null);

describe('countCallRepCreditsByAgent', () => {
  it('matches payroll: booking + LT by occurred_at, show by scheduled_at', () => {
    const credits = countCallRepCreditsByAgent(
      [
        {
          event_type: 'appointment_booked',
          agent_name: 'Bernardo',
          occurred_at: '2026-07-05T12:00:00.000Z',
        },
        {
          event_type: 'live_transfer',
          agent_name: 'Bernardo',
          occurred_at: '2026-07-10T12:00:00.000Z',
        },
        {
          event_type: 'live_transfer',
          agent_name: 'Other',
          occurred_at: '2026-07-10T12:00:00.000Z',
        },
      ],
      [
        {
          event_type: 'show',
          agent_name: 'Bernardo',
          occurred_at: '2026-06-30T12:00:00.000Z',
          scheduled_at: '2026-07-02T15:00:00.000Z',
        },
        {
          // booking disposition style would credit Bernardo; payroll uses show agent
          event_type: 'show',
          agent_name: null,
          occurred_at: '2026-07-03T12:00:00.000Z',
          scheduled_at: '2026-07-03T15:00:00.000Z',
        },
        {
          event_type: 'show',
          agent_name: 'Bernardo',
          occurred_at: '2026-08-01T12:00:00.000Z',
          scheduled_at: '2026-08-01T15:00:00.000Z',
        },
      ],
      resolve,
      '2026-07-01',
      '2026-07-31',
    );

    assert.deepEqual(credits.get('Bernardo'), {
      bookings: 1,
      shows: 1,
      live_transfers: 1,
    });
    assert.deepEqual(credits.get('Other'), {
      bookings: 0,
      shows: 0,
      live_transfers: 1,
    });
  });

  it('does not credit a booking-linked show to the wrong agent', () => {
    const credits = countCallRepCreditsByAgent(
      [
        {
          event_type: 'appointment_booked',
          agent_name: 'Bernardo',
          occurred_at: '2026-07-01T12:00:00.000Z',
        },
      ],
      [
        {
          event_type: 'show',
          agent_name: 'Luka',
          occurred_at: '2026-07-05T12:00:00.000Z',
          scheduled_at: '2026-07-05T15:00:00.000Z',
        },
      ],
      resolve,
      '2026-07-01',
      '2026-07-31',
    );

    assert.equal(credits.get('Bernardo')?.shows ?? 0, 0);
    assert.equal(credits.get('Bernardo')?.bookings, 1);
    assert.equal(credits.get('Luka')?.shows, 1);
  });
});

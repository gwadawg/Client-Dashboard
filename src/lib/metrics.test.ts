import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildClientKpiTimeline, calculateMetrics, type EventRow } from './metrics';

function lead(partial: Partial<EventRow> & { ghl_contact_id: string }): EventRow {
  return {
    client_id: 'c1',
    event_type: 'lead',
    is_qualified: true,
    is_pickup: null,
    is_conversation: null,
    speed_to_lead_seconds: null,
    ...partial,
  };
}

function evt(
  event_type: string,
  ghl_contact_id: string,
  occurred_at = '2026-06-10T12:00:00.000Z',
): EventRow {
  return {
    client_id: 'c1',
    event_type,
    ghl_contact_id,
    occurred_at,
    is_pickup: null,
    is_conversation: null,
    speed_to_lead_seconds: null,
  };
}

describe('unique-lead rates (booking, hand-raise, conversation)', () => {
  it('dedupes rebooks for booking rate and keeps absolute booked count', () => {
    const events: EventRow[] = [
      lead({ ghl_contact_id: 'A' }),
      lead({ ghl_contact_id: 'B' }),
      lead({ ghl_contact_id: 'C' }),
      lead({ ghl_contact_id: 'D' }),
      lead({ ghl_contact_id: 'E' }),
      // Same lead books three times
      evt('appointment_booked', 'A'),
      evt('appointment_booked', 'A'),
      evt('appointment_booked', 'A'),
      evt('appointment_booked', 'B'),
    ];

    const m = calculateMetrics(events, []);
    assert.equal(m.qualified_leads, 5);
    assert.equal(m.booked_appointments, 4);
    assert.equal(m.unique_booked_appointments, 2);
    assert.equal(m.appt_booking_rate, 40); // 2 unique ÷ 5
    assert.equal(m.lead_booking_rate, 40);
    assert.equal(m.unique_hand_raises, 2);
    assert.equal(m.lead_hand_raise_rate, 40);
  });

  it('counts a lead once in hand-raise when booked and later claimed', () => {
    const events: EventRow[] = [
      lead({ ghl_contact_id: 'A' }),
      lead({ ghl_contact_id: 'B' }),
      lead({ ghl_contact_id: 'C' }),
      lead({ ghl_contact_id: 'D' }),
      lead({ ghl_contact_id: 'E' }),
      evt('appointment_booked', 'A'),
      evt('claimed', 'A'), // same lead, already booked
      evt('live_transfer', 'B'),
    ];

    const m = calculateMetrics(events, []);
    assert.equal(m.booked_appointments, 1);
    assert.equal(m.claimed, 1);
    assert.equal(m.live_transfers, 1);
    // Unique hand-raises: A and B → 2 / 5 = 40%
    assert.equal(m.unique_hand_raises, 2);
    assert.equal(m.hand_raise_rate, 40);
    assert.equal(m.lead_hand_raise_rate, 40);
    // Unique booked: A → 1 / 5 = 20%
    assert.equal(m.appt_booking_rate, 20);
  });

  it('counts a lead once in conversation rate when showed and live-transferred', () => {
    const events: EventRow[] = [
      lead({ ghl_contact_id: 'A' }),
      lead({ ghl_contact_id: 'B' }),
      lead({ ghl_contact_id: 'C' }),
      lead({ ghl_contact_id: 'D' }),
      lead({ ghl_contact_id: 'E' }),
      evt('show', 'A'),
      evt('live_transfer', 'A'), // same lead
      evt('claimed', 'B'),
    ];

    const m = calculateMetrics(events, [{ amount: 200 }]);
    assert.equal(m.shows, 1);
    assert.equal(m.live_transfers, 1);
    assert.equal(m.claimed, 1);
    // Unique conversations: A and B → 2 / 5 = 40%
    assert.equal(m.unique_conversations, 2);
    assert.equal(m.conversation_rate, 40);
    assert.equal(m.cp_conversation, 100); // 200 / 2 unique
  });

  it('timeline rates also dedupe across days in a week rollup', () => {
    const events = [
      {
        event_type: 'lead',
        occurred_at: '2026-06-09T10:00:00.000Z',
        is_qualified: true,
        client_id: 'c1',
        ghl_contact_id: 'A',
      },
      {
        event_type: 'lead',
        occurred_at: '2026-06-09T10:00:00.000Z',
        is_qualified: true,
        client_id: 'c1',
        ghl_contact_id: 'B',
      },
      {
        event_type: 'appointment_booked',
        occurred_at: '2026-06-09T12:00:00.000Z',
        client_id: 'c1',
        ghl_contact_id: 'A',
      },
      {
        event_type: 'claimed',
        occurred_at: '2026-06-11T12:00:00.000Z',
        client_id: 'c1',
        ghl_contact_id: 'A',
      },
      {
        event_type: 'appointment_booked',
        occurred_at: '2026-06-11T15:00:00.000Z',
        client_id: 'c1',
        ghl_contact_id: 'A',
      },
      {
        event_type: 'show',
        occurred_at: '2026-06-12T15:00:00.000Z',
        client_id: 'c1',
        ghl_contact_id: 'A',
      },
      {
        event_type: 'live_transfer',
        occurred_at: '2026-06-13T15:00:00.000Z',
        client_id: 'c1',
        ghl_contact_id: 'A',
      },
    ];

    const week = buildClientKpiTimeline(events, [], '2026-06-08', '2026-06-14', 'week');
    assert.equal(week.length, 1);
    assert.equal(week[0].booked, 2); // event volume
    assert.equal(week[0].booking_rate, 50); // 1 unique ÷ 2 qual
    assert.equal(week[0].hand_raise_rate, 50); // same lead still once
    assert.equal(week[0].conversation_rate, 50); // show + LT same lead → once
    assert.equal(week[0].client_conversations, 1);
  });
});

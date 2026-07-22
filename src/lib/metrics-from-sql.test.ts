import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { calculateMetrics, type EventRow } from './metrics';
import { metricsFromSqlCounts, type SqlKpiCounts } from './metrics-from-sql';

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

function countsFromEvents(events: EventRow[]): SqlKpiCounts {
  const leadEvents = events.filter(e => e.event_type === 'lead');
  const dials = events.filter(e => e.event_type === 'dial');
  const m = calculateMetrics(events, []);
  return {
    new_leads: leadEvents.length,
    qualified_leads: leadEvents.filter(e => e.is_qualified === true).length,
    hot_leads: leadEvents.filter(e => e.is_hot === true).length,
    out_of_state_leads: m.out_of_state_leads,
    booked_appointments: m.booked_appointments,
    appointment_cancelled: m.appointment_cancelled,
    appointment_rescheduled: m.appointment_rescheduled,
    shows: m.shows,
    no_shows: m.no_shows,
    lo_bailed: m.lo_bailed,
    loan_processing: m.loan_processing,
    outbound_dials: dials.length,
    pickups: dials.filter(e => e.is_pickup).length,
    conversations: dials.filter(e => e.is_conversation).length,
    callbacks: m.callbacks,
    live_transfers: m.live_transfers,
    claimed: m.claimed,
    proposals_sent: m.proposals_sent,
    closed: m.closed,
    unique_booked_appointments: m.unique_booked_appointments,
    unique_hand_raises: m.unique_hand_raises,
    unique_conversations: m.unique_conversations,
    proposals_made: m.proposals_made,
    submissions_made: m.submissions_made,
    funded_loans: m.funded_loans,
  };
}

describe('metricsFromSqlCounts', () => {
  it('matches calculateMetrics derived rates for unique-lead KPIs', () => {
    const events: EventRow[] = [
      lead({ ghl_contact_id: 'A' }),
      lead({ ghl_contact_id: 'B' }),
      lead({ ghl_contact_id: 'C' }),
      lead({ ghl_contact_id: 'D' }),
      lead({ ghl_contact_id: 'E' }),
      evt('appointment_booked', 'A'),
      evt('appointment_booked', 'A'),
      evt('appointment_booked', 'B'),
      evt('claimed', 'A'),
      evt('live_transfer', 'B'),
      evt('show', 'A'),
    ];

    const fromJs = calculateMetrics(events, [{ amount: 100, platform: 'meta' }]);
    const fromSql = metricsFromSqlCounts(countsFromEvents(events), [
      { amount: 100, platform: 'meta' },
    ]);

    assert.equal(fromSql.new_leads, fromJs.new_leads);
    assert.equal(fromSql.booked_appointments, fromJs.booked_appointments);
    assert.equal(fromSql.unique_booked_appointments, fromJs.unique_booked_appointments);
    assert.equal(fromSql.appt_booking_rate, fromJs.appt_booking_rate);
    assert.equal(fromSql.unique_hand_raises, fromJs.unique_hand_raises);
    assert.equal(fromSql.hand_raise_rate, fromJs.hand_raise_rate);
    assert.equal(fromSql.unique_conversations, fromJs.unique_conversations);
    assert.equal(fromSql.conversation_rate, fromJs.conversation_rate);
    assert.equal(fromSql.cpl, fromJs.cpl);
    assert.equal(fromSql.ad_spend, fromJs.ad_spend);
  });
});

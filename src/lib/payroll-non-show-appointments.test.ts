import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { EnrichedAgentBooking } from './agent-appointment-stats';
import { bucketCallRepNonShowAppointments } from './payroll-non-show-appointments';

const roster = [{ id: 'a1', name: 'Alex Setter', phone: '555-0100' }];

function booking(partial: Partial<EnrichedAgentBooking> & { id: string }): EnrichedAgentBooking {
  return {
    id: partial.id,
    agent_name: partial.agent_name ?? 'Alex Setter',
    occurred_at: partial.occurred_at ?? '2026-08-25T15:00:00.000Z',
    scheduled_at: partial.scheduled_at ?? '2026-08-29T18:00:00.000Z',
    external_id: partial.external_id ?? partial.id,
    calendar_name: partial.calendar_name ?? 'Setter Calendar',
    lead_name: partial.lead_name ?? 'Lead One',
    lead_phone: partial.lead_phone ?? null,
    lead_email: partial.lead_email ?? null,
    ghl_contact_id: partial.ghl_contact_id ?? 'contact-1',
    status: partial.status ?? 'pending',
    outcome_id: partial.outcome_id ?? null,
  };
}

describe('bucketCallRepNonShowAppointments', () => {
  const startDate = '2026-08-01';
  const endDate = '2026-08-31';

  it('includes only pending appointments by scheduled_at (excludes terminal dispositions)', () => {
    const enriched: EnrichedAgentBooking[] = [
      booking({ id: 'b1', status: 'pending', scheduled_at: '2026-08-29T12:00:00.000Z' }),
      booking({ id: 'b2', status: 'no_show', scheduled_at: '2026-08-15T12:00:00.000Z' }),
      booking({ id: 'b3', status: 'appointment_cancelled', scheduled_at: '2026-08-20T12:00:00.000Z' }),
      booking({ id: 'b4', status: 'appointment_rescheduled', scheduled_at: '2026-08-22T12:00:00.000Z' }),
      booking({ id: 'b5', status: 'lo_bailed', scheduled_at: '2026-08-10T12:00:00.000Z' }),
      booking({ id: 'b6', status: 'show', scheduled_at: '2026-08-12T12:00:00.000Z' }),
    ];

    const items = bucketCallRepNonShowAppointments(roster, enriched, startDate, endDate).get('a1') ?? [];
    assert.equal(items.length, 1);
    assert.equal(items[0].id, 'b1');
    assert.equal(items[0].status, 'pending');
    assert.equal(items[0].date, '2026-08-29');
  });

  it('excludes show dispositions', () => {
    const enriched: EnrichedAgentBooking[] = [
      booking({ id: 'show-1', status: 'show', scheduled_at: '2026-08-29T12:00:00.000Z' }),
      booking({ id: 'pend-1', status: 'pending', scheduled_at: '2026-08-29T14:00:00.000Z' }),
    ];

    const items = bucketCallRepNonShowAppointments(roster, enriched, startDate, endDate).get('a1') ?? [];
    assert.equal(items.length, 1);
    assert.equal(items[0].id, 'pend-1');
    assert.equal(items[0].type, 'Pending');
  });

  it('uses appointment date not booking date for period filter', () => {
    const nextMonth = booking({
      id: 'next',
      status: 'pending',
      occurred_at: '2026-08-25T15:00:00.000Z',
      scheduled_at: '2026-09-02T15:00:00.000Z',
    });
    const thisMonth = booking({
      id: 'this',
      status: 'pending',
      occurred_at: '2026-07-28T15:00:00.000Z',
      scheduled_at: '2026-08-29T15:00:00.000Z',
      lead_name: 'Slot This Month',
    });

    const items = bucketCallRepNonShowAppointments(
      roster,
      [nextMonth, thisMonth],
      startDate,
      endDate,
    ).get('a1') ?? [];

    assert.equal(items.length, 1);
    assert.equal(items[0].id, 'this');
    assert.equal(items[0].date, '2026-08-29');
    assert.equal(items[0].lead_name, 'Slot This Month');
  });

  it('buckets by roster agent_name match', () => {
    const otherRoster = [
      { id: 'a1', name: 'Alex Setter', phone: '555-0100' },
      { id: 'a2', name: 'Blake Closer', phone: '555-0200' },
    ];
    const enriched: EnrichedAgentBooking[] = [
      booking({ id: '1', agent_name: 'Alex Setter', status: 'pending' }),
      booking({ id: '2', agent_name: 'Blake Closer', status: 'pending', lead_name: 'B Lead' }),
      booking({ id: '3', agent_name: 'Blake Closer', status: 'no_show', lead_name: 'C Lead' }),
    ];

    const map = bucketCallRepNonShowAppointments(otherRoster, enriched, startDate, endDate);
    assert.equal((map.get('a1') ?? []).length, 1);
    assert.equal((map.get('a2') ?? []).length, 1);
    assert.equal(map.get('a2')![0].lead_name, 'B Lead');
  });
});

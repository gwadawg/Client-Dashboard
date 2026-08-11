import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  contactDayKey,
  normalizeAppointmentStatus,
  overdueAppointmentAsOfIso,
  pickCreditedBookingForOutcome,
  scheduleProximityScore,
  shouldAutoSupersedePrior,
  shouldSyncOutcomeAgent,
} from './appointments';
import { calculateMetrics, type EventRow } from './metrics';

describe('overdue appointment day cutoff', () => {
  it('uses start of calendar day in call-center TZ, not wall-clock now', () => {
    // 2026-08-10 20:00 America/Sao_Paulo = 2026-08-10T23:00:00Z
    const evening = new Date('2026-08-10T23:00:00.000Z');
    const asOf = overdueAppointmentAsOfIso(evening, 'America/Sao_Paulo');
    // Midnight SP on Aug 10 is 03:00 UTC
    assert.equal(asOf, '2026-08-10T03:00:00.000Z');

    // Same-day slot (afternoon SP) is NOT overdue at evening SP
    const todaySlot = new Date('2026-08-10T18:00:00.000Z'); // 15:00 SP
    assert.equal(todaySlot.getTime() < new Date(asOf).getTime(), false);

    // Prior calendar day IS overdue
    const yesterdaySlot = new Date('2026-08-09T18:00:00.000Z');
    assert.equal(yesterdaySlot.getTime() < new Date(asOf).getTime(), true);
  });
});

describe('appointments agent propagation', () => {
  it('shouldSyncOutcomeAgent syncs when booking is credited and outcome is null', () => {
    assert.equal(shouldSyncOutcomeAgent('Bernardo Fabris', null), true);
    assert.equal(shouldSyncOutcomeAgent('Bernardo Fabris', ''), true);
    assert.equal(shouldSyncOutcomeAgent('Bernardo Fabris', '#N/A'), true);
  });

  it('shouldSyncOutcomeAgent skips when booking is uncredited', () => {
    assert.equal(shouldSyncOutcomeAgent(null, null), false);
    assert.equal(shouldSyncOutcomeAgent('', null), false);
    assert.equal(shouldSyncOutcomeAgent('#N/A', null), false);
  });

  it('shouldSyncOutcomeAgent skips when outcome already has a real agent', () => {
    assert.equal(shouldSyncOutcomeAgent('Bernardo Fabris', 'Rick Hostetler'), false);
  });

  it('pickCreditedBookingForOutcome prefers same-day and refuses ambiguous agents', () => {
    assert.ok(scheduleProximityScore('2026-07-20T15:00:00Z', '2026-07-20T18:00:00Z') > 100);
    assert.equal(contactDayKey('c1', '2026-07-20T15:00:00.000Z'), 'c1|2026-07-20');

    const single = pickCreditedBookingForOutcome(
      { scheduled_at: '2026-07-20T12:00:00.000Z' },
      [{ id: 'b1', agent_name: 'Bernardo Fabris', scheduled_at: '2026-07-20T15:00:00.000Z' }],
    );
    assert.equal(single?.id, 'b1');

    const ambiguous = pickCreditedBookingForOutcome(
      { scheduled_at: '2026-07-20T12:00:00.000Z' },
      [
        { id: 'b1', agent_name: 'Bernardo Fabris', scheduled_at: '2026-07-20T15:00:00.000Z' },
        { id: 'b2', agent_name: 'Luka Faccini', scheduled_at: '2026-07-20T15:00:00.000Z' },
      ],
    );
    assert.equal(ambiguous, null);

    const nearest = pickCreditedBookingForOutcome(
      { scheduled_at: '2026-07-22T12:00:00.000Z' },
      [
        { id: 'b1', agent_name: 'Bernardo Fabris', scheduled_at: '2026-07-20T15:00:00.000Z' },
        { id: 'b2', agent_name: 'Bernardo Fabris', scheduled_at: '2026-07-22T09:00:00.000Z' },
      ],
    );
    assert.equal(nearest?.id, 'b2');
  });
});

describe('appointment reschedule disposition', () => {
  it('normalizeAppointmentStatus accepts reschedule aliases', () => {
    assert.equal(normalizeAppointmentStatus('rescheduled'), 'appointment_rescheduled');
    assert.equal(normalizeAppointmentStatus('reschedule'), 'appointment_rescheduled');
    assert.equal(normalizeAppointmentStatus('superseded'), 'appointment_rescheduled');
    assert.equal(normalizeAppointmentStatus('appointment_rescheduled'), 'appointment_rescheduled');
  });

  it('shouldAutoSupersedePrior marks pending priors with a new appointment id', () => {
    assert.equal(
      shouldAutoSupersedePrior({
        prior: {
          id: 'old',
          external_id: 'ghl-1',
          calendar_id: 'cal-a',
          occurred_at: '2026-07-01T12:00:00.000Z',
        },
        nextExternalId: 'ghl-2',
        nextCalendarId: 'cal-a',
        nextOccurredAt: '2026-07-05T12:00:00.000Z',
        priorHasOutcome: false,
      }),
      true,
    );
  });

  it('shouldAutoSupersedePrior skips same external_id (upsert path)', () => {
    assert.equal(
      shouldAutoSupersedePrior({
        prior: {
          id: 'old',
          external_id: 'ghl-1',
          calendar_id: 'cal-a',
          occurred_at: '2026-07-01T12:00:00.000Z',
        },
        nextExternalId: 'ghl-1',
        nextCalendarId: 'cal-a',
        nextOccurredAt: '2026-07-05T12:00:00.000Z',
        priorHasOutcome: false,
      }),
      false,
    );
  });

  it('shouldAutoSupersedePrior skips when prior already has an outcome', () => {
    assert.equal(
      shouldAutoSupersedePrior({
        prior: {
          id: 'old',
          external_id: 'ghl-1',
          calendar_id: 'cal-a',
          occurred_at: '2026-07-01T12:00:00.000Z',
        },
        nextExternalId: 'ghl-2',
        nextCalendarId: 'cal-a',
        nextOccurredAt: '2026-07-05T12:00:00.000Z',
        priorHasOutcome: true,
      }),
      false,
    );
  });

  it('shouldAutoSupersedePrior skips different calendars', () => {
    assert.equal(
      shouldAutoSupersedePrior({
        prior: {
          id: 'old',
          external_id: 'ghl-1',
          calendar_id: 'cal-a',
          occurred_at: '2026-07-01T12:00:00.000Z',
        },
        nextExternalId: 'ghl-2',
        nextCalendarId: 'cal-b',
        nextOccurredAt: '2026-07-05T12:00:00.000Z',
        priorHasOutcome: false,
      }),
      false,
    );
  });

  it('calculateMetrics subtracts rescheduled from appts_to_take_place', () => {
    const events: EventRow[] = [
      {
        client_id: 'c1',
        event_type: 'appointment_booked',
        ghl_contact_id: 'lead-1',
        occurred_at: '2026-07-01T12:00:00.000Z',
        is_pickup: null,
        is_conversation: null,
        speed_to_lead_seconds: null,
      },
      {
        client_id: 'c1',
        event_type: 'appointment_booked',
        ghl_contact_id: 'lead-1',
        occurred_at: '2026-07-05T12:00:00.000Z',
        is_pickup: null,
        is_conversation: null,
        speed_to_lead_seconds: null,
      },
      {
        client_id: 'c1',
        event_type: 'appointment_rescheduled',
        ghl_contact_id: 'lead-1',
        occurred_at: '2026-07-01T12:00:00.000Z',
        is_pickup: null,
        is_conversation: null,
        speed_to_lead_seconds: null,
      },
    ];
    const m = calculateMetrics(events, []);
    assert.equal(m.booked_appointments, 2);
    assert.equal(m.appointment_rescheduled, 1);
    assert.equal(m.appts_to_take_place, 1);
  });
});

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeAppointmentStatus,
  shouldAutoSupersedePrior,
  shouldSyncOutcomeAgent,
} from './appointments';
import { calculateMetrics, type EventRow } from './metrics';

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

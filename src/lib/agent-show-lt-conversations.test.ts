import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { EnrichedAgentBooking } from '@/lib/agent-appointment-stats';
import {
  calendarMonthOf,
  countShowLtConversationsByAgent,
} from '@/lib/agent-show-lt-conversations';

const resolve = (raw: string | null | undefined) => (raw ? raw.trim() : null);

function showBooking(
  overrides: Partial<EnrichedAgentBooking> & { agent_name: string },
): EnrichedAgentBooking {
  return {
    id: overrides.id ?? 'b1',
    client_id: overrides.client_id ?? 'c1',
    occurred_at: null,
    scheduled_at: null,
    external_id: null,
    calendar_name: null,
    calendar_id: null,
    lead_name: overrides.lead_name ?? null,
    lead_phone: overrides.lead_phone ?? null,
    lead_email: overrides.lead_email ?? null,
    agent_name: overrides.agent_name,
    ghl_contact_id: overrides.ghl_contact_id ?? null,
    stage_booked: null,
    status: overrides.status ?? 'show',
    outcome_id: 'o1',
  } as EnrichedAgentBooking;
}

describe('countShowLtConversationsByAgent', () => {
  it('counts show-only as one conversation', () => {
    const counts = countShowLtConversationsByAgent(
      [showBooking({ agent_name: 'Maya', ghl_contact_id: 'g1' })],
      [],
      resolve,
    );
    assert.equal(counts.get('Maya'), 1);
  });

  it('counts LT-only as one conversation', () => {
    const counts = countShowLtConversationsByAgent(
      [],
      [{ agent_name: 'Maya', client_id: 'c1', ghl_contact_id: 'g2' }],
      resolve,
    );
    assert.equal(counts.get('Maya'), 1);
  });

  it('dedupes show + LT for the same lead', () => {
    const counts = countShowLtConversationsByAgent(
      [showBooking({ agent_name: 'Maya', ghl_contact_id: 'g1' })],
      [{ agent_name: 'Maya', client_id: 'c1', ghl_contact_id: 'g1' }],
      resolve,
    );
    assert.equal(counts.get('Maya'), 1);
  });

  it('ignores non-show bookings', () => {
    const counts = countShowLtConversationsByAgent(
      [showBooking({ agent_name: 'Maya', ghl_contact_id: 'g1', status: 'no_show' })],
      [],
      resolve,
    );
    assert.equal(counts.get('Maya'), undefined);
  });

  it('separates agents', () => {
    const counts = countShowLtConversationsByAgent(
      [showBooking({ agent_name: 'Maya', ghl_contact_id: 'g1' })],
      [{ agent_name: 'Jordan', client_id: 'c1', ghl_contact_id: 'g2' }],
      resolve,
    );
    assert.equal(counts.get('Maya'), 1);
    assert.equal(counts.get('Jordan'), 1);
  });
});

describe('calendarMonthOf', () => {
  it('derives July bounds from endDate', () => {
    const m = calendarMonthOf('2026-07-21');
    assert.equal(m.month, '2026-07');
    assert.equal(m.startDate, '2026-07-01');
    assert.equal(m.endDate, '2026-07-31');
  });
});

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  calendarMonthOf,
  countShowLtConversationsByAgent,
  type ShowLtLeadRow,
} from '@/lib/agent-show-lt-conversations';

const resolve = (raw: string | null | undefined) => (raw ? raw.trim() : null);

function showRow(overrides: Partial<ShowLtLeadRow> & { agent_name: string }): ShowLtLeadRow {
  return {
    agent_name: overrides.agent_name,
    client_id: overrides.client_id ?? 'c1',
    ghl_contact_id: overrides.ghl_contact_id ?? null,
    lead_phone: overrides.lead_phone ?? null,
    lead_email: overrides.lead_email ?? null,
    lead_name: overrides.lead_name ?? null,
  };
}

describe('countShowLtConversationsByAgent', () => {
  it('counts show-only as one conversation', () => {
    const counts = countShowLtConversationsByAgent(
      [showRow({ agent_name: 'Maya', ghl_contact_id: 'g1' })],
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
      [showRow({ agent_name: 'Maya', ghl_contact_id: 'g1' })],
      [{ agent_name: 'Maya', client_id: 'c1', ghl_contact_id: 'g1' }],
      resolve,
    );
    assert.equal(counts.get('Maya'), 1);
  });

  it('credits show event agent, not a different booking agent', () => {
    const counts = countShowLtConversationsByAgent(
      [showRow({ agent_name: 'Luka', ghl_contact_id: 'g1' })],
      [],
      resolve,
    );
    assert.equal(counts.get('Luka'), 1);
    assert.equal(counts.get('Bernardo'), undefined);
  });

  it('separates agents', () => {
    const counts = countShowLtConversationsByAgent(
      [showRow({ agent_name: 'Maya', ghl_contact_id: 'g1' })],
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

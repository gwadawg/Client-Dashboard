import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  attachLeadEventId,
  formatDqReason,
  findSourceLeadEvent,
  planDqLogEvent,
  validateDqReasons,
  type DqExistingEvent,
} from './dq-log-form';

const base = {
  occurredDate: '2026-08-14',
  clientId: 'c1',
  leadName: 'Alex Rivera',
  leadPhone: '555-0100',
  ghlContactId: 'ghl-1' as string | null,
  dqReasons: ['ltv', 'fico'] as const,
  dqOther: null as string | null,
  notes: null as string | null,
};

describe('formatDqReason', () => {
  it('joins multiple labels', () => {
    assert.equal(formatDqReason(['ltv', 'fico'], null), 'LTV; FICO');
  });

  it('includes other detail when present', () => {
    assert.equal(
      formatDqReason(['ltv', 'other'], 'insufficient equity'),
      'LTV; Other: insufficient equity',
    );
  });
});

describe('validateDqReasons', () => {
  it('requires at least one reason', () => {
    const result = validateDqReasons({ dq_reasons: [] });
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /at least one/i);
  });

  it('requires other text when other is selected', () => {
    const result = validateDqReasons({ dq_reasons: ['other'] });
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /other reason/i);
  });

  it('accepts valid reasons and notes', () => {
    const result = validateDqReasons({
      dq_reasons: ['ltv', 'fico'],
      notes: '  spoke on phone  ',
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.deepEqual(result.dqReasons, ['ltv', 'fico']);
      assert.equal(result.notes, 'spoke on phone');
    }
  });
});

describe('findSourceLeadEvent', () => {
  it('returns earliest lead event with attribution', () => {
    const existing: DqExistingEvent[] = [
      {
        id: 'lead-2',
        event_type: 'lead',
        occurred_at: '2026-07-02T12:00:00.000Z',
        ad_name: 'Hook B',
      },
      {
        id: 'lead-1',
        event_type: 'lead',
        occurred_at: '2026-07-01T12:00:00.000Z',
        ad_name: 'Hook A',
      },
    ];
    const source = findSourceLeadEvent(existing);
    assert.equal(source?.id, 'lead-1');
    assert.equal(source?.ad_name, 'Hook A');
  });
});

describe('planDqLogEvent', () => {
  it('copies ad attribution from source lead', () => {
    const existing: DqExistingEvent[] = [
      {
        id: 'lead-1',
        event_type: 'lead',
        occurred_at: '2026-07-01T12:00:00.000Z',
        ad_name: 'Hook A',
        adset_name: 'Set 1',
        campaign_name: 'Camp 1',
        utm_source: 'fb',
      },
      { event_type: 'claimed', occurred_at: '2026-07-02T12:00:00.000Z' },
    ];
    const { dqRow, duplicate, leadRow } = planDqLogEvent({
      ...base,
      createLead: false,
      existing,
    });
    assert.equal(duplicate, false);
    assert.equal(leadRow, null);
    assert.equal(dqRow.event_type, 'manual_dq');
    assert.equal(dqRow.lead_event_id, 'lead-1');
    assert.equal(dqRow.ad_name, 'Hook A');
    assert.equal(dqRow.adset_name, 'Set 1');
    assert.equal(dqRow.dq_reason, 'LTV; FICO');
    assert.deepEqual(dqRow.raw.dq_reasons, ['ltv', 'fico']);
  });

  it('flags duplicate when manual_dq already exists', () => {
    const existing: DqExistingEvent[] = [
      { event_type: 'lead', occurred_at: '2026-07-01T12:00:00.000Z', id: 'lead-1' },
      { event_type: 'manual_dq', occurred_at: '2026-07-03T12:00:00.000Z' },
    ];
    const { duplicate } = planDqLogEvent({
      ...base,
      createLead: false,
      existing,
    });
    assert.equal(duplicate, true);
  });

  it('cant-find creates lead row when no lead exists', () => {
    const { leadRow, dqRow } = planDqLogEvent({
      ...base,
      createLead: true,
      existing: [],
    });
    assert.ok(leadRow);
    assert.equal(leadRow?.event_type, 'lead');
    assert.equal(dqRow.lead_event_id, null);
    assert.equal(dqRow.ad_name, null);
  });

  it('attachLeadEventId links new lead insert', () => {
    const { dqRow } = planDqLogEvent({
      ...base,
      createLead: true,
      existing: [],
    });
    const linked = attachLeadEventId(dqRow, 'new-lead-id');
    assert.equal(linked.lead_event_id, 'new-lead-id');
  });
});

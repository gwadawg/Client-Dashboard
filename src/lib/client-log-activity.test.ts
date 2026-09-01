import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  activityRangeWindow,
  buildClientLogActivity,
  dateInRange,
  parseActivityRange,
} from './client-log-activity';

const CLIENT = 'client-uuid-1';
const NOW = new Date('2026-09-01T15:00:00.000Z');

describe('parseActivityRange', () => {
  it('defaults to 30d', () => {
    assert.equal(parseActivityRange(null), '30d');
    assert.equal(parseActivityRange('bad'), '30d');
  });

  it('accepts valid ranges', () => {
    assert.equal(parseActivityRange('7d'), '7d');
    assert.equal(parseActivityRange('all'), 'all');
  });
});

describe('activityRangeWindow', () => {
  it('returns 30-day window inclusive', () => {
    const w = activityRangeWindow('30d', NOW);
    assert.equal(w.end, '2026-09-01');
    assert.equal(w.start, '2026-08-03');
  });

  it('returns null start for all', () => {
    const w = activityRangeWindow('all', NOW);
    assert.equal(w.start, null);
    assert.equal(w.end, '2026-09-01');
  });
});

describe('dateInRange', () => {
  it('respects start and end', () => {
    assert.equal(dateInRange('2026-08-10T12:00:00Z', '2026-08-03', '2026-09-01'), true);
    assert.equal(dateInRange('2026-08-01T12:00:00Z', '2026-08-03', '2026-09-01'), false);
    assert.equal(dateInRange('2026-09-02T12:00:00Z', '2026-08-03', '2026-09-01'), false);
  });
});

describe('buildClientLogActivity', () => {
  it('builds deal rows and summary counts', () => {
    const result = buildClientLogActivity(
      CLIENT,
      [
        {
          id: 'deal-sub',
          ghl_contact_id: 'ghl-1',
          lead_name: 'Alice',
          lead_phone: '5551112222',
          stage: 'submitted',
          submitted_at: '2026-08-20T12:00:00.000Z',
          funded_at: null,
          loan_size: 250000,
          transaction_label: 'HELOC',
        },
        {
          id: 'deal-fund',
          ghl_contact_id: 'ghl-2',
          lead_name: 'Bob',
          lead_phone: '5553334444',
          stage: 'funded',
          submitted_at: '2026-07-01T12:00:00.000Z',
          funded_at: '2026-08-25T12:00:00.000Z',
          loan_size: 400000,
          transaction_label: null,
        },
      ],
      [],
      '30d',
      NOW,
    );

    assert.equal(result.summary.submitted, 1);
    assert.equal(result.summary.funded, 1);
    assert.equal(result.rows.length, 2);
    assert.equal(result.rows.find(r => r.id === 'deal-fund')?.stage, 'funded');
  });

  it('shows orphan proposals and drops them when a deal exists', () => {
    const events = [
      {
        id: 'prop-1',
        event_type: 'proposal_made',
        ghl_contact_id: 'ghl-orphan',
        lead_name: 'Carol',
        lead_phone: '5555556666',
        occurred_at: '2026-08-15T12:00:00.000Z',
        dq_reason: null,
        raw: { source: 'loan_log_form', loan_size: 180000 },
      },
      {
        id: 'prop-2',
        event_type: 'proposal_made',
        ghl_contact_id: 'ghl-1',
        lead_name: 'Alice',
        lead_phone: '5551112222',
        occurred_at: '2026-08-10T12:00:00.000Z',
        dq_reason: null,
        raw: { source: 'loan_log_form', loan_size: 200000 },
      },
    ];

    const withDeal = buildClientLogActivity(
      CLIENT,
      [
        {
          id: 'deal-1',
          ghl_contact_id: 'ghl-1',
          lead_name: 'Alice',
          lead_phone: '5551112222',
          stage: 'submitted',
          submitted_at: '2026-08-20T12:00:00.000Z',
          funded_at: null,
          loan_size: 250000,
          transaction_label: null,
        },
      ],
      events,
      '30d',
      NOW,
    );

    assert.equal(withDeal.summary.proposals, 2);
    assert.ok(withDeal.rows.some(r => r.stage === 'proposal' && r.lead_name === 'Carol'));
    assert.ok(!withDeal.rows.some(r => r.stage === 'proposal' && r.lead_name === 'Alice'));
  });

  it('includes disqualified rows from client log form', () => {
    const result = buildClientLogActivity(
      CLIENT,
      [],
      [
        {
          id: 'dq-1',
          event_type: 'manual_dq',
          ghl_contact_id: 'ghl-dq',
          lead_name: 'Dan',
          lead_phone: '5557778888',
          occurred_at: '2026-08-18T12:00:00.000Z',
          dq_reason: 'ltv, fico',
          raw: { source: 'client_log_form' },
        },
        {
          id: 'dq-webhook',
          event_type: 'manual_dq',
          ghl_contact_id: 'ghl-x',
          lead_name: 'Eve',
          lead_phone: null,
          occurred_at: '2026-08-18T12:00:00.000Z',
          dq_reason: 'ltv',
          raw: { source: 'webhook' },
        },
      ],
      '30d',
      NOW,
    );

    assert.equal(result.summary.disqualified, 1);
    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0].stage, 'disqualified');
  });

  it('excludes rows outside range', () => {
    const result = buildClientLogActivity(
      CLIENT,
      [
        {
          id: 'old-deal',
          ghl_contact_id: 'ghl-old',
          lead_name: 'Old',
          lead_phone: null,
          stage: 'submitted',
          submitted_at: '2026-01-01T12:00:00.000Z',
          funded_at: null,
          loan_size: 100000,
          transaction_label: null,
        },
      ],
      [],
      '7d',
      NOW,
    );

    assert.equal(result.summary.submitted, 0);
    assert.equal(result.rows.length, 0);
  });
});

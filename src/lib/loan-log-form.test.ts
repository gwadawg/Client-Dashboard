import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractCommissionTotal,
  parseLoanLogDate,
  parseMoney,
  planLoanLogEvents,
  type LoanLogExistingEvent,
} from './loan-log-form';

const base = {
  occurredDate: '2026-08-14',
  loanSize: 350000,
  commissionAmount: null as number | null,
  clientId: 'c1',
  leadName: 'Alex Rivera',
  leadPhone: '555-0100',
  ghlContactId: 'ghl-1' as string | null,
};

describe('planLoanLogEvents', () => {
  it('empty history + create + funded writes the full chain', () => {
    const { rows, duplicateClicked } = planLoanLogEvents({
      ...base,
      stage: 'funded',
      createLead: true,
      commissionAmount: 12000,
      existing: [],
    });
    assert.equal(duplicateClicked, false);
    assert.deepEqual(
      rows.map(r => r.event_type),
      ['lead', 'claimed', 'proposal_made', 'submission_made', 'loan_funded'],
    );
    assert.equal(rows.every(r => r.occurred_at.startsWith('2026-08-14')), true);
    const funded = rows.find(r => r.event_type === 'loan_funded');
    assert.equal(funded?.raw.loan_size, 350000);
    assert.equal(funded?.raw.commission_amount, 12000);
    const submitted = rows.find(r => r.event_type === 'submission_made');
    assert.equal(submitted?.raw.loan_size, 350000);
    assert.equal('commission_amount' in (submitted?.raw ?? {}), false);
  });

  it('existing lead + submitted does not write a second lead', () => {
    const existing: LoanLogExistingEvent[] = [
      { event_type: 'lead', occurred_at: '2026-07-01T12:00:00.000Z' },
    ];
    const { rows } = planLoanLogEvents({
      ...base,
      stage: 'submitted',
      createLead: false,
      existing,
    });
    assert.deepEqual(
      rows.map(r => r.event_type),
      ['claimed', 'proposal_made', 'submission_made'],
    );
  });

  it('does not add claimed when a show already exists', () => {
    const existing: LoanLogExistingEvent[] = [
      { event_type: 'lead', occurred_at: '2026-07-01T12:00:00.000Z' },
      { event_type: 'show', occurred_at: '2026-07-02T12:00:00.000Z' },
    ];
    const { rows } = planLoanLogEvents({
      ...base,
      stage: 'submitted',
      createLead: false,
      existing,
    });
    assert.equal(rows.some(r => r.event_type === 'claimed'), false);
    assert.deepEqual(
      rows.map(r => r.event_type),
      ['proposal_made', 'submission_made'],
    );
  });

  it('does not add proposal when proposal_made exists', () => {
    const existing: LoanLogExistingEvent[] = [
      { event_type: 'proposal_made', occurred_at: '2026-07-03T12:00:00.000Z' },
    ];
    const { rows } = planLoanLogEvents({
      ...base,
      stage: 'submitted',
      createLead: false,
      existing,
    });
    assert.equal(rows.filter(r => r.event_type === 'proposal_made').length, 0);
    assert.ok(rows.some(r => r.event_type === 'submission_made'));
  });

  it('funded without prior submission writes submission_made', () => {
    const existing: LoanLogExistingEvent[] = [
      { event_type: 'show', occurred_at: '2026-07-02T12:00:00.000Z' },
      { event_type: 'proposal_made', occurred_at: '2026-07-03T12:00:00.000Z' },
    ];
    const { rows } = planLoanLogEvents({
      ...base,
      stage: 'funded',
      createLead: false,
      existing,
    });
    assert.ok(rows.some(r => r.event_type === 'submission_made'));
    assert.ok(rows.some(r => r.event_type === 'loan_funded'));
  });

  it('same-day funded duplicate skips a second funded but still backfills gaps', () => {
    const existing: LoanLogExistingEvent[] = [
      { event_type: 'loan_funded', occurred_at: '2026-08-14T08:00:00.000Z' },
    ];
    const { rows, duplicateClicked } = planLoanLogEvents({
      ...base,
      stage: 'funded',
      createLead: false,
      existing,
    });
    assert.equal(duplicateClicked, true);
    assert.equal(rows.some(r => r.event_type === 'loan_funded'), false);
    assert.ok(rows.some(r => r.event_type === 'claimed'));
    assert.ok(rows.some(r => r.event_type === 'proposal_made'));
    assert.ok(rows.some(r => r.event_type === 'submission_made'));
  });

  it('stores commission only on funded', () => {
    const { rows } = planLoanLogEvents({
      ...base,
      stage: 'submitted',
      createLead: false,
      commissionAmount: 9999,
      existing: [],
    });
    assert.equal(
      rows.some(r => 'commission_amount' in r.raw),
      false,
    );
  });
});

describe('loan log parsers', () => {
  it('parses dates and money', () => {
    assert.equal(parseLoanLogDate('2026-08-14'), '2026-08-14');
    assert.equal(parseLoanLogDate('08/14/2026'), null);
    assert.equal(parseMoney('$12,000'), 12000);
    assert.equal(parseMoney(-1), null);
  });

  it('sums commission from raw payloads', () => {
    assert.equal(
      extractCommissionTotal([{ commission_amount: 10 }, { loan_size: 1 }, { commission_amount: 5 }]),
      15,
    );
    assert.equal(extractCommissionTotal([null, {}]), 0);
  });
});

describe('attachCommissionRoas', () => {
  it('hides ROAS when commission is missing and computes revenue / spend when present', async () => {
    const { attachCommissionRoas, calculateMetrics } = await import('./metrics');
    const base = calculateMetrics([], [{ amount: 1000, platform: 'meta' }]);
    assert.equal(attachCommissionRoas(base, 0).roas, null);
    assert.equal(attachCommissionRoas(base, 2500).roas, 2.5);
  });
});

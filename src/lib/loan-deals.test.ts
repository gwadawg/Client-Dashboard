import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  findDuplicateDeal,
  findPromotableDeal,
  summarizeLoanDeals,
  type LoanDealRecord,
} from './loan-deals';

const deal = (partial: Partial<LoanDealRecord> & Pick<LoanDealRecord, 'id' | 'stage'>): LoanDealRecord => ({
  submitted_at: '2026-08-14T12:00:00.000Z',
  funded_at: partial.stage === 'funded' ? '2026-08-14T12:00:00.000Z' : null,
  loan_size: 350000,
  commission_amount: null,
  transaction_label: null,
  ghl_contact_id: 'ghl-1',
  ...partial,
});

describe('loan deal matching', () => {
  it('treats same size + same day + same label as a duplicate funded', () => {
    const found = findDuplicateDeal(
      [deal({ id: 'd1', stage: 'funded' })],
      { occurredDate: '2026-08-14', loanSize: 350000, transactionLabel: null, stage: 'funded' },
    );
    assert.equal(found?.id, 'd1');
  });

  it('allows a second transaction with a different size the same day', () => {
    const found = findDuplicateDeal(
      [deal({ id: 'd1', stage: 'funded' })],
      { occurredDate: '2026-08-14', loanSize: 200000, transactionLabel: null, stage: 'funded' },
    );
    assert.equal(found, null);
  });

  it('allows the same size when the transaction label differs', () => {
    const found = findDuplicateDeal(
      [deal({ id: 'd1', stage: 'funded', transaction_label: 'cash-out' })],
      { occurredDate: '2026-08-14', loanSize: 350000, transactionLabel: 'rate-term', stage: 'funded' },
    );
    assert.equal(found, null);
  });

  it('promotes the matching submitted file by size and label', () => {
    const open = findPromotableDeal(
      [
        deal({ id: 'a', stage: 'submitted', loan_size: 200000, transaction_label: '1st loan' }),
        deal({ id: 'b', stage: 'submitted', loan_size: 350000, transaction_label: 'cash-out' }),
      ],
      { occurredDate: '2026-08-20', loanSize: 350000, transactionLabel: 'cash-out' },
    );
    assert.equal(open?.id, 'b');
  });
});

describe('summarizeLoanDeals', () => {
  it('counts unique people separately from deal volume by date grain', () => {
    const totals = summarizeLoanDeals(
      [
        {
          stage: 'submitted',
          submitted_at: '2026-08-01T12:00:00.000Z',
          funded_at: null,
          loan_size: 100000,
          commission_amount: null,
        },
        {
          stage: 'funded',
          submitted_at: '2026-07-01T12:00:00.000Z',
          funded_at: '2026-08-10T12:00:00.000Z',
          loan_size: 250000,
          commission_amount: 8000,
        },
        {
          stage: 'funded',
          submitted_at: '2026-08-10T12:00:00.000Z',
          funded_at: '2026-08-10T12:00:00.000Z',
          loan_size: 150000,
          commission_amount: 4000,
        },
      ],
      '2026-08-01',
      '2026-08-31',
    );
    assert.equal(totals.submitted_deals, 2);
    assert.equal(totals.funded_deals, 2);
    assert.equal(totals.loan_volume, 400000);
    assert.equal(totals.commission_total, 12000);
  });
});

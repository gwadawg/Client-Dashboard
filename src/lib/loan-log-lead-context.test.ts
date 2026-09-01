import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildLeadContext,
  filterOpenDeals,
  findProposalLoanSize,
  formatDealPickerLabel,
  loanSizeInputValue,
} from './loan-log-lead-context';
import type { LoanDealRecord } from './loan-deals';

describe('findProposalLoanSize', () => {
  it('returns most recent proposal loan size', () => {
    const size = findProposalLoanSize([
      {
        event_type: 'proposal_made',
        occurred_at: '2026-07-01T12:00:00.000Z',
        raw: { loan_size: 200000 },
      },
      {
        event_type: 'proposal_made',
        occurred_at: '2026-08-01T12:00:00.000Z',
        raw: { loan_size: 350000 },
      },
    ]);
    assert.equal(size, 350000);
  });

  it('returns null when no proposal events', () => {
    assert.equal(findProposalLoanSize([]), null);
  });
});

describe('filterOpenDeals', () => {
  it('keeps submitted deals with loan size, newest first', () => {
    const deals: LoanDealRecord[] = [
      {
        id: 'a',
        stage: 'submitted',
        submitted_at: '2026-08-01T12:00:00.000Z',
        funded_at: null,
        loan_size: 200000,
        commission_amount: null,
        transaction_label: '1st loan',
        ghl_contact_id: 'ghl-1',
      },
      {
        id: 'b',
        stage: 'funded',
        submitted_at: '2026-07-01T12:00:00.000Z',
        funded_at: '2026-07-15T12:00:00.000Z',
        loan_size: 150000,
        commission_amount: null,
        transaction_label: null,
        ghl_contact_id: 'ghl-1',
      },
      {
        id: 'c',
        stage: 'submitted',
        submitted_at: '2026-08-10T12:00:00.000Z',
        funded_at: null,
        loan_size: 350000,
        commission_amount: null,
        transaction_label: 'cash-out',
        ghl_contact_id: 'ghl-1',
      },
    ];
    const open = filterOpenDeals(deals);
    assert.equal(open.length, 2);
    assert.equal(open[0].id, 'c');
    assert.equal(open[1].id, 'a');
  });
});

describe('buildLeadContext', () => {
  it('combines proposal size and open deals', () => {
    const ctx = buildLeadContext(
      [
        {
          event_type: 'proposal_made',
          occurred_at: '2026-07-01T12:00:00.000Z',
          raw: { loan_size: 350000 },
        },
      ],
      [
        {
          id: 'd1',
          stage: 'submitted',
          submitted_at: '2026-08-01T12:00:00.000Z',
          funded_at: null,
          loan_size: 350000,
          commission_amount: null,
          transaction_label: null,
          ghl_contact_id: 'ghl-1',
        },
      ],
    );
    assert.equal(ctx.proposal_loan_size, 350000);
    assert.equal(ctx.open_deals.length, 1);
  });
});

describe('formatDealPickerLabel', () => {
  it('includes size, label, and submitted date', () => {
    const label = formatDealPickerLabel({
      id: 'd1',
      loan_size: 350000,
      transaction_label: 'cash-out',
      submitted_at: '2026-08-12T12:00:00.000Z',
    });
    assert.match(label, /\$350,000/);
    assert.match(label, /cash-out/);
    assert.match(label, /submitted Aug 12/);
  });
});

describe('loanSizeInputValue', () => {
  it('formats numeric loan size for inputs', () => {
    assert.equal(loanSizeInputValue(350000), '350000');
    assert.equal(loanSizeInputValue(null), '');
  });
});

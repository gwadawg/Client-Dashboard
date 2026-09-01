import { isOpenSubmittedDeal, type LoanDealRecord, parseLoanSizeFromRaw } from '@/lib/loan-deals';

const PROPOSAL_TYPES = new Set(['proposal_made', 'proposal_sent']);

export type LeadContextEvent = {
  event_type: string;
  occurred_at: string | null;
  raw: unknown;
};

export type LeadContextDeal = {
  id: string;
  loan_size: number;
  transaction_label: string | null;
  submitted_at: string;
};

export type LeadContext = {
  proposal_loan_size: number | null;
  open_deals: LeadContextDeal[];
};

export function formatMoney(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatDealSubmittedDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

export function formatDealPickerLabel(deal: LeadContextDeal): string {
  const parts = [formatMoney(deal.loan_size)];
  if (deal.transaction_label?.trim()) {
    parts.push(deal.transaction_label.trim());
  }
  parts.push(`submitted ${formatDealSubmittedDate(deal.submitted_at)}`);
  return parts.join(' · ');
}

export function findProposalLoanSize(events: LeadContextEvent[]): number | null {
  const proposals = events
    .filter(e => PROPOSAL_TYPES.has(e.event_type))
    .sort((a, b) => {
      const ta = a.occurred_at ? Date.parse(a.occurred_at) : 0;
      const tb = b.occurred_at ? Date.parse(b.occurred_at) : 0;
      return tb - ta;
    });

  for (const row of proposals) {
    const size = parseLoanSizeFromRaw(row.raw);
    if (size != null && size > 0) return size;
  }
  return null;
}

export function filterOpenDeals(deals: LoanDealRecord[]): LeadContextDeal[] {
  return deals
    .filter(
      deal =>
        isOpenSubmittedDeal(deal) &&
        deal.loan_size != null &&
        Number.isFinite(deal.loan_size) &&
        deal.loan_size > 0,
    )
    .sort((a, b) => Date.parse(b.submitted_at) - Date.parse(a.submitted_at))
    .map(deal => ({
      id: deal.id,
      loan_size: deal.loan_size as number,
      transaction_label: deal.transaction_label,
      submitted_at: deal.submitted_at,
    }));
}

export function buildLeadContext(
  events: LeadContextEvent[],
  deals: LoanDealRecord[],
): LeadContext {
  return {
    proposal_loan_size: findProposalLoanSize(events),
    open_deals: filterOpenDeals(deals),
  };
}

export function loanSizeInputValue(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || value <= 0) return '';
  return String(Math.round(value));
}

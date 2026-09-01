import type { createServiceClient } from '@/lib/supabase';

function parseMoney(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(String(value).replace(/[$,\s]/g, ''));
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

type Service = ReturnType<typeof createServiceClient>;

export const LOAN_DEAL_STAGES = ['submitted', 'funded'] as const;
export type LoanDealStage = (typeof LOAN_DEAL_STAGES)[number];

export type LoanDealRecord = {
  id: string;
  stage: LoanDealStage;
  submitted_at: string;
  funded_at: string | null;
  fell_out_at?: string | null;
  loan_size: number | null;
  commission_amount: number | null;
  transaction_label: string | null;
  ghl_contact_id: string | null;
};

export function isOpenSubmittedDeal(deal: Pick<LoanDealRecord, 'stage' | 'fell_out_at'>): boolean {
  return deal.stage === 'submitted' && !deal.fell_out_at;
}

export type LoanDealTotals = {
  submitted_deals: number;
  funded_deals: number;
  loan_volume: number;
  commission_total: number;
};

export type LoanDealMatchInput = {
  occurredDate: string;
  loanSize: number;
  transactionLabel: string | null;
  stage: LoanDealStage;
};

export function emptyLoanDealTotals(): LoanDealTotals {
  return {
    submitted_deals: 0,
    funded_deals: 0,
    loan_volume: 0,
    commission_total: 0,
  };
}

export function normalizeTransactionLabel(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().replace(/\s+/g, ' ');
  return trimmed ? trimmed.slice(0, 160) : null;
}

function dateKey(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return iso.slice(0, 10);
}

function sameMoney(a: number | null | undefined, b: number): boolean {
  if (a == null || !Number.isFinite(a)) return false;
  return Math.abs(a - b) < 0.005;
}

function sameLabel(a: string | null | undefined, b: string | null): boolean {
  return (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();
}

export function findDuplicateDeal(
  deals: LoanDealRecord[],
  input: LoanDealMatchInput,
): LoanDealRecord | null {
  const day = input.occurredDate;
  return (
    deals.find(deal => {
      const dealDay =
        input.stage === 'funded'
          ? dateKey(deal.funded_at) ?? dateKey(deal.submitted_at)
          : dateKey(deal.submitted_at);
      if (dealDay !== day) return false;
      if (!sameMoney(deal.loan_size, input.loanSize)) return false;
      if (!sameLabel(deal.transaction_label, input.transactionLabel)) return false;
      if (input.stage === 'funded') return deal.stage === 'funded';
      return true;
    }) ?? null
  );
}

/** Open submitted file we can mark funded (same size; label if both have one). */
export function findPromotableDeal(
  deals: LoanDealRecord[],
  input: Omit<LoanDealMatchInput, 'stage'>,
): LoanDealRecord | null {
  const submitted = deals.filter(
    deal =>
      isOpenSubmittedDeal(deal) && sameMoney(deal.loan_size, input.loanSize),
  );
  if (submitted.length === 0) return null;
  if (input.transactionLabel) {
    const labeled = submitted.find(deal => sameLabel(deal.transaction_label, input.transactionLabel));
    if (labeled) return labeled;
  }
  const unlabeled = submitted.filter(deal => !deal.transaction_label);
  return unlabeled[0] ?? submitted[0];
}

export function parseLoanSizeFromRaw(raw: unknown): number | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  return parseMoney(o.loan_size ?? o.loan_amount ?? o.loanAmount ?? o.mortgage_amount);
}

export function parseCommissionFromRaw(raw: unknown): number | null {
  if (!raw || typeof raw !== 'object') return null;
  return parseMoney((raw as Record<string, unknown>).commission_amount);
}

export function summarizeLoanDeals(
  rows: Array<{
    stage: string | null;
    submitted_at: string | null;
    funded_at: string | null;
    loan_size: number | string | null;
    commission_amount: number | string | null;
  }>,
  from: string | null,
  to: string | null,
): LoanDealTotals {
  const totals = emptyLoanDealTotals();
  const start = from ? `${from}T00:00:00.000Z` : null;
  const end = to ? `${to}T23:59:59.999Z` : null;
  const inRange = (iso: string | null | undefined) => {
    if (!iso) return false;
    if (start && iso < start) return false;
    if (end && iso > end) return false;
    return true;
  };

  for (const row of rows) {
    if (inRange(row.submitted_at)) totals.submitted_deals += 1;
    if (row.stage === 'funded' && inRange(row.funded_at)) {
      totals.funded_deals += 1;
      const size = Number(row.loan_size);
      if (Number.isFinite(size) && size > 0) totals.loan_volume += size;
      const commission = Number(row.commission_amount);
      if (Number.isFinite(commission) && commission > 0) totals.commission_total += commission;
    }
  }
  return totals;
}

export async function loadContactLoanDeals(
  service: Service,
  clientId: string,
  ghlContactId: string | null,
): Promise<LoanDealRecord[]> {
  if (!ghlContactId) return [];
  const { data, error } = await service
    .from('loan_deals')
    .select('id, stage, submitted_at, funded_at, fell_out_at, loan_size, commission_amount, transaction_label, ghl_contact_id')
    .eq('client_id', clientId)
    .eq('ghl_contact_id', ghlContactId)
    .limit(500);
  if (error) throw new Error(error.message);
  return (data ?? []) as LoanDealRecord[];
}

export async function fetchLoanDealTotals(
  service: Service,
  filters: {
    client_id?: string | null;
    client_ids?: string[] | null;
    start_date?: string | null;
    end_date?: string | null;
  },
): Promise<LoanDealTotals> {
  let q = service
    .from('loan_deals')
    .select('stage, submitted_at, funded_at, loan_size, commission_amount');
  if (filters.client_id) q = q.eq('client_id', filters.client_id);
  else if (filters.client_ids && filters.client_ids.length > 0) {
    q = q.in('client_id', filters.client_ids);
  }
  q = q.limit(50000);
  const { data, error } = await q;
  if (error) {
    if (/loan_deals|schema cache|does not exist/i.test(error.message)) {
      return emptyLoanDealTotals();
    }
    throw new Error(error.message);
  }
  return summarizeLoanDeals(
    (data ?? []) as Parameters<typeof summarizeLoanDeals>[0],
    filters.start_date ?? null,
    filters.end_date ?? null,
  );
}

export async function insertLoanDeal(
  service: Service,
  row: {
    client_id: string;
    ghl_contact_id: string;
    lead_name: string;
    lead_phone: string;
    transaction_label: string | null;
    stage: LoanDealStage;
    submitted_at: string;
    funded_at: string | null;
    loan_size: number;
    commission_amount: number | null;
    conversion_event_id?: string | null;
    source?: string;
    raw?: Record<string, unknown>;
  },
): Promise<{ id: string } | { duplicate: true }> {
  const { data, error } = await service
    .from('loan_deals')
    .insert({
      client_id: row.client_id,
      ghl_contact_id: row.ghl_contact_id,
      lead_name: row.lead_name,
      lead_phone: row.lead_phone,
      transaction_label: row.transaction_label,
      stage: row.stage,
      submitted_at: row.submitted_at,
      funded_at: row.funded_at,
      loan_size: row.loan_size,
      commission_amount: row.commission_amount,
      conversion_event_id: row.conversion_event_id ?? null,
      source: row.source ?? 'loan_log_form',
      raw: row.raw ?? { source: 'loan_log_form' },
    })
    .select('id')
    .single();
  if (error) {
    if (error.code === '23505') return { duplicate: true };
    throw new Error(error.message);
  }
  return { id: data.id };
}

export async function promoteLoanDeal(
  service: Service,
  dealId: string,
  input: {
    funded_at: string;
    loan_size: number;
    commission_amount: number | null;
    transaction_label: string | null;
  },
): Promise<void> {
  const { error } = await service
    .from('loan_deals')
    .update({
      stage: 'funded',
      funded_at: input.funded_at,
      fell_out_at: null,
      loan_size: input.loan_size,
      commission_amount: input.commission_amount,
      transaction_label: input.transaction_label,
      updated_at: new Date().toISOString(),
    })
    .eq('id', dealId)
    .eq('stage', 'submitted');
  if (error) throw new Error(error.message);
}

export async function setLoanDealFellOut(
  service: Service,
  dealId: string,
  clientId: string,
  fellOut: boolean,
): Promise<{ ok: true } | { error: string }> {
  const { data, error } = await service
    .from('loan_deals')
    .select('id, stage, source')
    .eq('id', dealId)
    .eq('client_id', clientId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return { error: 'This loan file was not found.' };
  if (data.source !== 'loan_log_form') {
    return { error: 'Only form-logged loans can be updated here.' };
  }
  if (data.stage !== 'submitted') {
    return { error: 'Only submitted loans can be marked as fell out.' };
  }

  const { error: updateError } = await service
    .from('loan_deals')
    .update({
      fell_out_at: fellOut ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', dealId)
    .eq('client_id', clientId)
    .eq('stage', 'submitted');

  if (updateError) throw new Error(updateError.message);
  return { ok: true };
}

export async function ensureDealFromConversionEvent(
  service: Service,
  input: {
    eventId: string;
    clientId: string;
    eventType: string;
    occurredAt: string;
    ghlContactId: string | null;
    leadName: string | null;
    leadPhone: string | null;
    leadEmail: string | null;
    raw: unknown;
  },
): Promise<void> {
  const stage: LoanDealStage | null =
    input.eventType === 'loan_funded' || input.eventType === 'closed'
      ? 'funded'
      : input.eventType === 'submission_made' || input.eventType === 'loan_processing'
        ? 'submitted'
        : null;
  if (!stage) return;

  const { data: existing } = await service
    .from('loan_deals')
    .select('id')
    .eq('conversion_event_id', input.eventId)
    .maybeSingle();
  if (existing) return;

  const loanSize = parseLoanSizeFromRaw(input.raw);
  const commission = stage === 'funded' ? parseCommissionFromRaw(input.raw) : null;
  const { error } = await service.from('loan_deals').insert({
    client_id: input.clientId,
    ghl_contact_id: input.ghlContactId,
    lead_name: input.leadName,
    lead_phone: input.leadPhone,
    lead_email: input.leadEmail,
    stage,
    submitted_at: input.occurredAt,
    funded_at: stage === 'funded' ? input.occurredAt : null,
    loan_size: loanSize,
    commission_amount: commission,
    conversion_event_id: input.eventId,
    source: 'webhook',
    raw: { source: 'webhook', event_type: input.eventType },
  });
  if (error && error.code !== '23505') {
    throw new Error(error.message);
  }
}

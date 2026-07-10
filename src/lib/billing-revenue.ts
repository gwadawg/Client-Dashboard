import type { SupabaseClient } from '@supabase/supabase-js';

export const REVENUE_TYPES = [
  'mrr',
  'pif',
  'performance',
  'passthrough',
  'upsell',
  'one_off',
] as const;

export type RevenueType = (typeof REVENUE_TYPES)[number];

export const REVENUE_SEGMENTS = ['front_end', 'back_end'] as const;
export type RevenueSegment = (typeof REVENUE_SEGMENTS)[number];

export type BillingEventType =
  | 'created'
  | 'updated'
  | 'payment'
  | 'voided'
  | 'status_changed';

export const BILLING_LEDGER_FIELDS =
  'id, client_id, billed_on, due_date, period_start, period_end, amount, base_amount, performance_amount, late_fee, discount, amount_paid, status, paid_on, method, invoice_ref, note, revenue_type, revenue_segment, lead_source, term_months, processing_fee, passthrough_amount, stripe_invoice_id, stripe_payment_intent_id, is_first_payment, voided_at, created_at';

const REVENUE_TYPE_SET = new Set<string>(REVENUE_TYPES);
const REVENUE_SEGMENT_SET = new Set<string>(REVENUE_SEGMENTS);

export function isRevenueType(value: unknown): value is RevenueType {
  return typeof value === 'string' && REVENUE_TYPE_SET.has(value);
}

export function isRevenueSegment(value: unknown): value is RevenueSegment {
  return typeof value === 'string' && REVENUE_SEGMENT_SET.has(value);
}

/** Map client billing_type → default revenue_type for a retainer charge. */
export function revenueTypeFromBillingType(
  billingType: string | null | undefined,
): RevenueType | null {
  if (billingType === 'pif') return 'pif';
  if (billingType === 'monthly' || billingType === 'pif_monthly') return 'mrr';
  return null;
}

export type PriorBillingProbe = {
  status?: string | null;
  revenue_type?: string | null;
  amount_paid?: number | null;
  is_first_payment?: boolean | null;
};

/** True when the client already has a paid non-passthrough revenue billing. */
export function clientHasPriorPaidRevenue(
  billings: PriorBillingProbe[],
  excludeBillingId?: string | null,
): boolean {
  return billings.some((b) => {
    if (excludeBillingId && (b as { id?: string }).id === excludeBillingId) return false;
    if (b.status === 'voided') return false;
    if (b.revenue_type === 'passthrough') return false;
    return (Number(b.amount_paid) || 0) > 0 || b.status === 'paid';
  });
}

export type RevenueInput = {
  revenue_type?: unknown;
  revenue_segment?: unknown;
  term_months?: unknown;
  processing_fee?: unknown;
  passthrough_amount?: unknown;
  lead_source?: unknown;
  method?: unknown;
  stripe_invoice_id?: unknown;
  stripe_payment_intent_id?: unknown;
  note?: unknown;
};

export type RevenueClientContext = {
  billing_type?: string | null;
  source?: string | null;
  contract_term_months?: number | null;
};

export type ResolvedRevenue = {
  revenue_type: RevenueType | null;
  revenue_segment: RevenueSegment | null;
  term_months: number | null;
  processing_fee: number;
  passthrough_amount: number;
  lead_source: string | null;
  method: string | null;
  stripe_invoice_id: string | null;
  stripe_payment_intent_id: string | null;
  is_first_payment: boolean;
  error?: string;
};

function emptyToNull(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s === '' ? null : s;
}

function numOr(value: unknown, fallback: number): number {
  if (value == null || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Resolve CEO revenue tags for a billing write.
 * - Defaults revenue_type from client.billing_type when omitted.
 * - Auto front_end + is_first_payment when this will be the client's first paid revenue charge.
 * - Requires term_months when type is pif (uses contract_term_months as fallback).
 */
export function resolveRevenueDefaults(args: {
  client: RevenueClientContext;
  existingBillings: PriorBillingProbe[];
  input: RevenueInput;
  /** True when the resulting row will be paid (or already collecting cash). */
  willBePaid: boolean;
  excludeBillingId?: string | null;
  /** When patching, fall back to current row values. */
  current?: Partial<ResolvedRevenue> | null;
}): ResolvedRevenue {
  const { client, existingBillings, input, willBePaid, excludeBillingId, current } = args;

  let revenue_type: RevenueType | null = null;
  if (isRevenueType(input.revenue_type)) revenue_type = input.revenue_type;
  else if (current?.revenue_type && isRevenueType(current.revenue_type)) revenue_type = current.revenue_type;
  else revenue_type = revenueTypeFromBillingType(client.billing_type);

  const hasPrior = clientHasPriorPaidRevenue(existingBillings, excludeBillingId);
  const is_first_payment = willBePaid && !hasPrior && revenue_type !== 'passthrough';

  let revenue_segment: RevenueSegment | null = null;
  if (isRevenueSegment(input.revenue_segment)) revenue_segment = input.revenue_segment;
  else if (current?.revenue_segment && isRevenueSegment(current.revenue_segment)) {
    revenue_segment = current.revenue_segment;
  } else if (is_first_payment) {
    revenue_segment = 'front_end';
  } else if (willBePaid || current?.revenue_segment) {
    revenue_segment = 'back_end';
  } else if (revenue_type) {
    // Scheduled / pending: still tag segment for CEO forecasting.
    revenue_segment = hasPrior ? 'back_end' : 'front_end';
  }

  let term_months: number | null = null;
  if (input.term_months != null && input.term_months !== '') {
    const n = Number(input.term_months);
    term_months = Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : null;
  } else if (current?.term_months != null) {
    term_months = current.term_months;
  } else if (revenue_type === 'pif') {
    term_months =
      client.contract_term_months != null ? Number(client.contract_term_months) : null;
  }

  if (revenue_type === 'pif' && (term_months == null || term_months <= 0)) {
    return {
      revenue_type,
      revenue_segment,
      term_months: null,
      processing_fee: numOr(input.processing_fee, current?.processing_fee ?? 0),
      passthrough_amount: numOr(input.passthrough_amount, current?.passthrough_amount ?? 0),
      lead_source: emptyToNull(input.lead_source) ?? current?.lead_source ?? emptyToNull(client.source),
      method: emptyToNull(input.method) ?? current?.method ?? null,
      stripe_invoice_id:
        emptyToNull(input.stripe_invoice_id) ?? current?.stripe_invoice_id ?? null,
      stripe_payment_intent_id:
        emptyToNull(input.stripe_payment_intent_id) ??
        current?.stripe_payment_intent_id ??
        null,
      is_first_payment,
      error: 'term_months is required when revenue_type is pif',
    };
  }

  const lead_source =
    emptyToNull(input.lead_source) ??
    current?.lead_source ??
    emptyToNull(client.source);

  return {
    revenue_type,
    revenue_segment,
    term_months,
    processing_fee: numOr(input.processing_fee, current?.processing_fee ?? 0),
    passthrough_amount: numOr(input.passthrough_amount, current?.passthrough_amount ?? 0),
    lead_source,
    method: emptyToNull(input.method) ?? current?.method ?? null,
    stripe_invoice_id:
      emptyToNull(input.stripe_invoice_id) ?? current?.stripe_invoice_id ?? null,
    stripe_payment_intent_id:
      emptyToNull(input.stripe_payment_intent_id) ??
      current?.stripe_payment_intent_id ??
      null,
    is_first_payment,
  };
}

export async function logBillingEvent(
  service: SupabaseClient,
  args: {
    billingId: string;
    clientId: string;
    eventType: BillingEventType;
    actorId: string | null;
    payload?: Record<string, unknown>;
  },
): Promise<void> {
  const { error } = await service.from('billing_events').insert({
    billing_id: args.billingId,
    client_id: args.clientId,
    event_type: args.eventType,
    actor_id: args.actorId,
    payload: args.payload ?? {},
  });
  if (error) {
    console.error('[billing_events]', error.message);
  }
}

/** Load prior billings for first-payment detection. */
export async function loadClientBillingProbes(
  service: SupabaseClient,
  clientId: string,
): Promise<(PriorBillingProbe & { id: string })[]> {
  const { data, error } = await service
    .from('client_billings')
    .select('id, status, revenue_type, amount_paid, is_first_payment')
    .eq('client_id', clientId)
    .neq('status', 'voided');
  if (error) throw new Error(error.message);
  return (data ?? []) as (PriorBillingProbe & { id: string })[];
}

const BILLING_MONEY_KEYS = [
  'amount', 'base_amount', 'performance_amount', 'late_fee', 'discount',
  'amount_paid', 'passthrough_amount', 'processing_fee',
] as const;

const CLIENT_MONEY_KEYS = ['mrr', 'daily_adspend', 'pay_per_show', 'pay_per_bailed'] as const;

export function redactBillingRow<T extends Record<string, unknown>>(row: T): T {
  const out = { ...row } as Record<string, unknown>;
  for (const k of BILLING_MONEY_KEYS) out[k] = null;
  return out as T;
}

export function redactClientMoneyFields<T extends Record<string, unknown>>(client: T): T {
  const out = { ...client } as Record<string, unknown>;
  for (const k of CLIENT_MONEY_KEYS) out[k] = null;
  return out as T;
}

export function redactBillingRows<T extends Record<string, unknown>>(rows: T[] | null | undefined): T[] {
  return (rows ?? []).map(redactBillingRow);
}

export { canViewClientRevenue, canViewClientTotalPaid, CLIENT_REVENUE_PERMISSION_KEYS } from './permissions';

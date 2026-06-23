// Billing model helpers: fixed retainer vs performance (report → objection → bill).

export const BILLING_MODELS = ['fixed', 'performance'] as const;
export type BillingModel = (typeof BILLING_MODELS)[number];

export const CYCLE_STATUSES = [
  'draft',
  'report_sent',
  'ready_to_bill',
  'disputed',
  'billed',
  'voided',
] as const;
export type CycleStatus = (typeof CYCLE_STATUSES)[number];

/** Days after report send before a cycle auto-promotes to ready_to_bill. */
export const OBJECTION_WINDOW_DAYS = 3;

export interface PerformanceRates {
  pay_per_show?: number | null;
  pay_per_bailed?: number | null;
}

export interface CycleCounts {
  show_count?: number | null;
  bailed_count?: number | null;
}

export interface BillingCycleRow {
  status: string;
  report_sent_at?: string | null;
  objection_deadline_at?: string | null;
}

export function normalizeBillingModel(value: unknown): BillingModel {
  const raw = String(value ?? '').trim().toLowerCase();
  if (raw === 'performance' || raw === 'perf') return 'performance';
  return 'fixed';
}

export function isPerformanceBilling(value: unknown): boolean {
  return normalizeBillingModel(value) === 'performance';
}

export function isFixedBilling(value: unknown): boolean {
  return normalizeBillingModel(value) === 'fixed';
}

export function computePerformanceAmount(
  counts: CycleCounts,
  rates: PerformanceRates,
): number {
  const shows = Math.max(0, Number(counts.show_count) || 0);
  const bailed = Math.max(0, Number(counts.bailed_count) || 0);
  const showRate = Math.max(0, Number(rates.pay_per_show) || 0);
  const bailRate = Math.max(0, Number(rates.pay_per_bailed) || 0);
  return shows * showRate + bailed * bailRate;
}

export function computeCycleTotal(
  base: number,
  performance: number,
  discount: number,
): number {
  return Math.max(0, (Number(base) || 0) + (Number(performance) || 0) - (Number(discount) || 0));
}

/** Objection deadline = report_sent_at + OBJECTION_WINDOW_DAYS calendar days (UTC). */
export function computeObjectionDeadline(reportSentAt: Date): Date {
  const d = new Date(reportSentAt.getTime());
  d.setUTCDate(d.getUTCDate() + OBJECTION_WINDOW_DAYS);
  return d;
}

/**
 * Effective cycle status for display/queue bucketing.
 * Auto-promotes report_sent → ready_to_bill once the objection window closes.
 */
export function deriveCycleStatus(
  cycle: BillingCycleRow,
  now: Date = new Date(),
): CycleStatus {
  const stored = cycle.status as CycleStatus;
  if (stored === 'report_sent') {
    const deadline = cycle.objection_deadline_at
      ? new Date(cycle.objection_deadline_at)
      : null;
    if (deadline && now.getTime() >= deadline.getTime()) {
      return 'ready_to_bill';
    }
  }
  return stored;
}

export function cycleStatusLabel(status: CycleStatus): string {
  switch (status) {
    case 'draft': return 'awaiting report';
    case 'report_sent': return 'objection window';
    case 'ready_to_bill': return 'ready to bill';
    case 'disputed': return 'disputed';
    case 'billed': return 'billed';
    case 'voided': return 'voided';
    default: return status;
  }
}

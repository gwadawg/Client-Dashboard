// Locked monthly billing cadence: day-of-month set once, then due every month
// until pause/churn. Shared by Admin Billing queue (Fixed + Performance).

import { isFixedBilling, isPerformanceBilling, normalizeBillingModel } from './billing-model';

/** How far ahead to surface the next cadence month in the queue. */
export const CADENCE_HORIZON_DAYS = 45;

/** Cap how many past months can appear as open (avoid infinite backlog). */
export const CADENCE_LOOKBACK_MONTHS = 6;

export type CadenceClient = {
  billing_model?: string | null;
  billing_day?: number | null;
  mrr?: number | null;
  pay_per_show?: number | null;
  pay_per_bailed?: number | null;
  launch_date?: string | null;
  date_signed?: string | null;
};

export type CadenceMonth = {
  /** YYYY-MM */
  yearMonth: string;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
};

function parseYmd(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function formatYmd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function addUtcDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86_400_000);
}

function monthKey(year: number, monthIndex: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
}

function shiftMonth(year: number, monthIndex: number, delta: number): { year: number; monthIndex: number } {
  const d = new Date(Date.UTC(year, monthIndex + delta, 1));
  return { year: d.getUTCFullYear(), monthIndex: d.getUTCMonth() };
}

/** Due date for a calendar month on the locked day-of-month (clamped). */
export function dueDateForMonth(
  year: number,
  monthIndex: number,
  billingDay: number,
): string {
  const day = Math.min(Math.max(1, billingDay), daysInMonth(year, monthIndex));
  return formatYmd(new Date(Date.UTC(year, monthIndex, day)));
}

export function periodBoundsForMonth(year: number, monthIndex: number): {
  periodStart: string;
  periodEnd: string;
} {
  const periodStart = formatYmd(new Date(Date.UTC(year, monthIndex, 1)));
  const periodEnd = formatYmd(new Date(Date.UTC(year, monthIndex + 1, 0)));
  return { periodStart, periodEnd };
}

/**
 * Cadence is locked when day-of-month is set and model-appropriate rates exist.
 * Fixed: day is enough (MRR may be 0). Performance: day + at least one rate.
 */
export function isCadenceLocked(client: CadenceClient): boolean {
  const day = client.billing_day;
  if (typeof day !== 'number' || day < 1 || day > 31) return false;

  const model = normalizeBillingModel(client.billing_model);
  if (model === 'performance') {
    return client.pay_per_show != null || client.pay_per_bailed != null;
  }
  // Fixed (default)
  return true;
}

export function isCadencePending(client: CadenceClient): boolean {
  return !isCadenceLocked(client);
}

function yearMonthFromYmd(ymd: string): string {
  return ymd.slice(0, 7);
}

/** True when a Fixed ledger row covers this calendar month (non-voided). */
export function fixedMonthCovered(
  yearMonth: string,
  billings: Array<{
    due_date?: string | null;
    billed_on?: string | null;
    period_start?: string | null;
    period_end?: string | null;
    status?: string | null;
  }>,
): boolean {
  for (const b of billings) {
    if (b.status === 'voided') continue;
    if (b.period_start && b.period_end) {
      const startYm = yearMonthFromYmd(b.period_start);
      const endYm = yearMonthFromYmd(b.period_end);
      if (yearMonth >= startYm && yearMonth <= endYm) return true;
    }
    const due = b.due_date ?? b.billed_on;
    if (due && yearMonthFromYmd(due) === yearMonth) return true;
  }
  return false;
}

/** True when a performance cycle covers this calendar month (non-voided). */
export function perfMonthCovered(
  yearMonth: string,
  cycles: Array<{
    period_start?: string | null;
    period_end?: string | null;
    status?: string | null;
  }>,
): boolean {
  for (const c of cycles) {
    if (c.status === 'voided') continue;
    if (!c.period_start || !c.period_end) continue;
    const startYm = yearMonthFromYmd(c.period_start);
    const endYm = yearMonthFromYmd(c.period_end);
    if (yearMonth >= startYm && yearMonth <= endYm) return true;
  }
  return false;
}

/**
 * Open cadence months that still need ops attention (no covering row/cycle).
 * Includes late months and the next month if its due date is within the horizon.
 */
export function openCadenceMonths(
  client: CadenceClient,
  opts: {
    billings?: Array<{
      due_date?: string | null;
      billed_on?: string | null;
      period_start?: string | null;
      period_end?: string | null;
      status?: string | null;
    }>;
    cycles?: Array<{
      period_start?: string | null;
      period_end?: string | null;
      status?: string | null;
    }>;
    today?: Date;
    lookbackMonths?: number;
    horizonDays?: number;
  } = {},
): CadenceMonth[] {
  if (!isCadenceLocked(client)) return [];
  const billingDay = client.billing_day as number;
  const today = opts.today ?? new Date();
  const todayUtc = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const lookback = opts.lookbackMonths ?? CADENCE_LOOKBACK_MONTHS;
  const horizonDays = opts.horizonDays ?? CADENCE_HORIZON_DAYS;
  const horizon = addUtcDays(todayUtc, horizonDays);

  const billings = opts.billings ?? [];
  const cycles = opts.cycles ?? [];
  const usePerf = isPerformanceBilling(client.billing_model);

  let { year, monthIndex } = shiftMonth(todayUtc.getUTCFullYear(), todayUtc.getUTCMonth(), -lookback);

  // Don't start before launch / signed month when available.
  const anchor = client.launch_date ?? client.date_signed;
  if (anchor) {
    const a = parseYmd(anchor.slice(0, 10));
    const ay = a.getUTCFullYear();
    const am = a.getUTCMonth();
    if (ay > year || (ay === year && am > monthIndex)) {
      year = ay;
      monthIndex = am;
    }
  }

  const out: CadenceMonth[] = [];
  // Walk forward until past horizon.
  for (let i = 0; i < lookback + 4; i++) {
    const due = dueDateForMonth(year, monthIndex, billingDay);
    const dueDate = parseYmd(due);
    if (dueDate.getTime() > horizon.getTime()) break;

    const ym = monthKey(year, monthIndex);
    const covered = usePerf
      ? perfMonthCovered(ym, cycles)
      : fixedMonthCovered(ym, billings);

    if (!covered) {
      const { periodStart, periodEnd } = periodBoundsForMonth(year, monthIndex);
      out.push({ yearMonth: ym, periodStart, periodEnd, dueDate: due });
    }

    ({ year, monthIndex } = shiftMonth(year, monthIndex, 1));
  }

  return out;
}

/** Next due date for a locked client from open cadence months (or null). */
export function nextOpenCadenceDueDate(
  client: CadenceClient,
  opts: Parameters<typeof openCadenceMonths>[1] = {},
): string | null {
  const open = openCadenceMonths(client, opts);
  if (open.length === 0) return null;
  // Prefer earliest open month (late months first).
  return open[0]!.dueDate;
}

export function modelBadgeLabel(billingModel: unknown): 'Fixed' | 'Performance' {
  return isFixedBilling(billingModel) ? 'Fixed' : 'Performance';
}

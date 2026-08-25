// Locked monthly billing cadence: day-of-month set once, then due every month
// until pause/churn. Shared by Admin Billing queue (Fixed + Performance).

import { isFixedBilling, normalizeBillingModel } from './billing-model';

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

/**
 * Service window ending on the due date in this month.
 * billing_day 26 → 2026-04-26 → 2026-05-25 (due 2026-05-26).
 * billing_day 1  → prior month 1st → last day of prior month (due 1st).
 */
export function periodBoundsForMonth(
  year: number,
  monthIndex: number,
  billingDay: number,
): {
  periodStart: string;
  periodEnd: string;
} {
  const due = dueDateForMonth(year, monthIndex, billingDay);
  const periodEnd = formatYmd(addUtcDays(parseYmd(due), -1));
  const prev = shiftMonth(year, monthIndex, -1);
  const periodStart = dueDateForMonth(prev.year, prev.monthIndex, billingDay);
  return { periodStart, periodEnd };
}

function hasBillingDay(client: CadenceClient): boolean {
  const day = Number(client.billing_day);
  return Number.isFinite(day) && day >= 1 && day <= 31;
}

/**
 * Cadence is locked when day-of-month is set and model-appropriate rates exist.
 * Fixed: day is enough (MRR may be 0). Performance: day + at least one rate.
 * There is no separate Lock button — filling these fields locks automatically.
 */
export function isCadenceLocked(client: CadenceClient): boolean {
  if (!hasBillingDay(client)) return false;

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

/** Short hint for Setup UI when a client is still Pending. */
export function cadenceSetupHint(client: CadenceClient): string | null {
  if (isCadenceLocked(client)) return null;
  const needsDay = !hasBillingDay(client);
  const model = normalizeBillingModel(client.billing_model);
  if (model === 'performance') {
    const needsRate = client.pay_per_show == null && client.pay_per_bailed == null;
    if (needsDay && needsRate) {
      return 'Enter due day (1–31) and $/conversation or $/bailed';
    }
    if (needsDay) return 'Enter due day (1–31) — then it locks';
    if (needsRate) return 'Enter $/conversation or $/bailed — then it locks';
  }
  if (needsDay) return 'Enter due day (1–31) — then it locks';
  return 'Finish rates below — then it locks';
}

function yearMonthFromYmd(ymd: string): string {
  return ymd.slice(0, 7);
}

/**
 * Whether a period window covers this due-month key.
 * Anniversary windows (start day > 1, spans months) cover only the end month
 * (the due/report month). Calendar-month spans (start on the 1st) cover the
 * full inclusive range.
 */
function periodCoversYearMonth(
  yearMonth: string,
  periodStart: string,
  periodEnd: string,
): boolean {
  const startYm = yearMonthFromYmd(periodStart);
  const endYm = yearMonthFromYmd(periodEnd);
  if (startYm === endYm) return yearMonth === startYm;
  const startDay = Number(periodStart.slice(8, 10));
  if (startDay > 1) return yearMonth === endYm;
  return yearMonth >= startYm && yearMonth <= endYm;
}

/** True when a Fixed ledger row covers this due month (non-voided). */
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
      // Period bounds are authoritative — a late due_date must not cover a
      // different service month (e.g. Jun–Jul cycle billed in August).
      if (periodCoversYearMonth(yearMonth, b.period_start, b.period_end)) return true;
      continue;
    }
    const due = b.due_date ?? b.billed_on;
    if (due && yearMonthFromYmd(due) === yearMonth) return true;
  }
  return false;
}

/** True when a performance cycle covers this due month (non-voided). */
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
    if (periodCoversYearMonth(yearMonth, c.period_start, c.period_end)) return true;
  }
  return false;
}

function latestSettledYearMonth(
  billings: Array<{
    due_date?: string | null;
    billed_on?: string | null;
    period_start?: string | null;
    period_end?: string | null;
    status?: string | null;
  }>,
  cycles: Array<{
    period_start?: string | null;
    period_end?: string | null;
    status?: string | null;
  }>,
): string | null {
  let latest: string | null = null;
  for (const b of billings) {
    // Only paid/refunded settle historical gaps; open scheduled/pending do not.
    if (b.status !== 'paid' && b.status !== 'refunded') continue;
    const candidates = [b.period_end, b.due_date, b.billed_on].filter(Boolean) as string[];
    for (const d of candidates) {
      const ym = yearMonthFromYmd(d.slice(0, 10));
      if (!latest || ym > latest) latest = ym;
    }
  }
  for (const c of cycles) {
    if (c.status !== 'billed') continue;
    if (!c.period_end) continue;
    const ym = yearMonthFromYmd(c.period_end);
    if (!latest || ym > latest) latest = ym;
  }
  return latest;
}

function monthIsCovered(
  yearMonth: string,
  billings: Parameters<typeof fixedMonthCovered>[1],
  cycles: Parameters<typeof perfMonthCovered>[1],
): boolean {
  // Ledger payments settle the month for both Fixed and Performance.
  if (fixedMonthCovered(yearMonth, billings)) return true;
  if (perfMonthCovered(yearMonth, cycles)) return true;
  return false;
}

/**
 * Open cadence months that still need ops attention (no covering row/cycle).
 * Includes late months and the next month if its due date is within the horizon.
 *
 * When paid revenue exists, months at/before the latest paid month are treated
 * as settled for the queue (avoids re-opening already-collected history).
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
  const billingDay = Number(client.billing_day);
  if (!Number.isFinite(billingDay) || billingDay < 1 || billingDay > 31) return [];
  const today = opts.today ?? new Date();
  const todayUtc = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const lookback = opts.lookbackMonths ?? CADENCE_LOOKBACK_MONTHS;
  const horizonDays = opts.horizonDays ?? CADENCE_HORIZON_DAYS;
  const horizon = addUtcDays(todayUtc, horizonDays);

  const billings = opts.billings ?? [];
  const cycles = opts.cycles ?? [];

  let { year, monthIndex } = shiftMonth(todayUtc.getUTCFullYear(), todayUtc.getUTCMonth(), -lookback);

  // First cash is collected on sign — not again on launch. Recurring cadence
  // therefore starts the calendar month *after* launch (or signed, if no launch).
  // That first payment does not need a monthly ledger row for coverage.
  const anchor = client.launch_date ?? client.date_signed;
  if (anchor) {
    const a = parseYmd(anchor.slice(0, 10));
    const firstRecurring = shiftMonth(a.getUTCFullYear(), a.getUTCMonth(), 1);
    if (
      firstRecurring.year > year ||
      (firstRecurring.year === year && firstRecurring.monthIndex > monthIndex)
    ) {
      year = firstRecurring.year;
      monthIndex = firstRecurring.monthIndex;
    }
  }

  // If revenue already settled a month, don't re-queue older gaps behind it.
  const settledYm = latestSettledYearMonth(billings, cycles);
  if (settledYm) {
    const [sy, sm] = settledYm.split('-').map(Number);
    const settledYear = sy!;
    const settledMonthIndex = sm! - 1;
    if (
      settledYear > year ||
      (settledYear === year && settledMonthIndex > monthIndex)
    ) {
      year = settledYear;
      monthIndex = settledMonthIndex;
    }
  }

  const out: CadenceMonth[] = [];
  // Walk forward until past horizon.
  for (let i = 0; i < lookback + 4; i++) {
    const due = dueDateForMonth(year, monthIndex, billingDay);
    const dueDate = parseYmd(due);
    if (dueDate.getTime() > horizon.getTime()) break;

    const ym = monthKey(year, monthIndex);
    const covered = monthIsCovered(ym, billings, cycles);

    if (!covered) {
      const { periodStart, periodEnd } = periodBoundsForMonth(year, monthIndex, billingDay);
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

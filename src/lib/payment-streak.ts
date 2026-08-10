/**
 * Pure payment-streak engine for CS Stickiness board.
 * Derives month dispositions from client_billings + status flags, with sparse overrides.
 * Commission dollars are intentionally out of scope — only full-freight streak state.
 */

import { balanceOf, recordedState } from './billing';

export const MONTH_DISPOSITIONS = [
  'paid',
  'short',
  'extension',
  'unpaid',
  'paused',
  'churned',
  'empty',
] as const;

export type MonthDisposition = (typeof MONTH_DISPOSITIONS)[number];

/** Dispositions that may be stored as overrides (empty is always derived). */
export const OVERRIDE_DISPOSITIONS = [
  'paid',
  'short',
  'extension',
  'unpaid',
  'paused',
  'churned',
] as const;

export type OverrideDisposition = (typeof OVERRIDE_DISPOSITIONS)[number];

export const DISPOSITION_RANK: Record<MonthDisposition, number> = {
  paid: 5,
  extension: 4,
  short: 3,
  unpaid: 2,
  paused: 1,
  churned: 1,
  empty: 0,
};

export type StreakBillingRow = {
  id?: string;
  billed_on: string;
  due_date?: string | null;
  period_start?: string | null;
  period_end?: string | null;
  amount: number;
  amount_paid?: number | null;
  status?: string | null;
  is_extension?: boolean | null;
  voided_at?: string | null;
};

export type StreakClientContext = {
  lifecycle_status?: string | null;
  billing_paused?: boolean | null;
  billing_paused_at?: string | null;
  churned_at?: string | null;
  launch_date?: string | null;
  date_signed?: string | null;
};

export type MonthDispositionOverride = {
  year_month: string;
  disposition: OverrideDisposition;
  note?: string | null;
};

export type MonthCell = {
  year_month: string;
  disposition: MonthDisposition;
  source: 'derived' | 'override';
  billing_id: string | null;
  amount: number | null;
  amount_paid: number | null;
  is_extension: boolean;
  note: string | null;
};

export type ClientStreakSummary = {
  current_streak: number;
  total_paid: number;
  total_misses: number;
  total_extensions: number;
  total_short: number;
  total_paused: number;
  milestone_m3: boolean;
  milestone_m6: boolean;
  at_risk: boolean;
};

export type ClientStreakTimeline = {
  months: MonthCell[];
  summary: ClientStreakSummary;
  first_billable_month: string | null;
};

const YM_RE = /^\d{4}-\d{2}$/;

export function isYearMonth(value: string): boolean {
  return YM_RE.test(value);
}

export function isOverrideDisposition(value: unknown): value is OverrideDisposition {
  return (
    typeof value === 'string' &&
    (OVERRIDE_DISPOSITIONS as readonly string[]).includes(value)
  );
}

/** Extract YYYY-MM from a date string (YYYY-MM-DD or ISO). */
export function yearMonthFromDate(date: string | null | undefined): string | null {
  if (!date) return null;
  const m = String(date).trim().match(/^(\d{4}-\d{2})/);
  return m ? m[1] : null;
}

export function compareYearMonth(a: string, b: string): number {
  return a.localeCompare(b);
}

export function addMonthsYm(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  const yy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${yy}-${mm}`;
}

export function monthRangeInclusive(from: string, to: string): string[] {
  if (compareYearMonth(from, to) > 0) return [];
  const out: string[] = [];
  let cur = from;
  while (compareYearMonth(cur, to) <= 0) {
    out.push(cur);
    cur = addMonthsYm(cur, 1);
    if (out.length > 240) break; // safety ~20y
  }
  return out;
}

/** Service month key for a billing row. */
export function billingYearMonth(b: StreakBillingRow): string | null {
  return yearMonthFromDate(b.period_start) ?? yearMonthFromDate(b.billed_on);
}

function isVoided(b: StreakBillingRow): boolean {
  return b.status === 'voided' || !!b.voided_at;
}

/**
 * Disposition for a single ledger row (void handled by caller).
 */
export function dispositionFromBilling(
  b: StreakBillingRow,
  today: Date = new Date(),
): MonthDisposition {
  if (isVoided(b)) return 'empty';
  if (b.is_extension) return 'extension';
  if (b.status === 'scheduled') return 'empty';
  if (b.status === 'refunded' || b.status === 'failed') return 'unpaid';

  const amount = Number(b.amount) || 0;
  const paid = Number(b.amount_paid) || 0;
  const bal = balanceOf({ amount, amount_paid: paid });
  const state = recordedState(
    {
      amount,
      amount_paid: paid,
      due_date: b.due_date ?? null,
      billed_on: b.billed_on,
      status: b.status,
    },
    today,
  );

  if (state === 'paid') {
    if (amount <= 0 && paid <= 0) return 'unpaid';
    return 'paid';
  }
  if (state === 'partial' || (paid > 0 && bal > 0)) return 'short';
  if (state === 'overdue' || state === 'pending' || state === 'failed') return 'unpaid';
  if (state === 'refunded') return 'unpaid';
  return 'unpaid';
}

type DerivedMonthSignal = {
  disposition: MonthDisposition;
  billing_id: string | null;
  amount: number | null;
  amount_paid: number | null;
  is_extension: boolean;
};

function mergeMonthSignals(a: DerivedMonthSignal, b: DerivedMonthSignal): DerivedMonthSignal {
  if (DISPOSITION_RANK[b.disposition] > DISPOSITION_RANK[a.disposition]) return b;
  if (DISPOSITION_RANK[b.disposition] < DISPOSITION_RANK[a.disposition]) return a;
  // Same rank: prefer larger amounts / extension flag accuracy
  if (b.is_extension && !a.is_extension) return b;
  const aPaid = a.amount_paid ?? 0;
  const bPaid = b.amount_paid ?? 0;
  if (bPaid > aPaid) return b;
  return a;
}

export function deriveBillingMonthMap(
  billings: StreakBillingRow[],
  today: Date = new Date(),
): Map<string, DerivedMonthSignal> {
  const map = new Map<string, DerivedMonthSignal>();
  for (const b of billings) {
    if (isVoided(b)) continue;
    const ym = billingYearMonth(b);
    if (!ym) continue;
    const disposition = dispositionFromBilling(b, today);
    if (disposition === 'empty') continue;
    const signal: DerivedMonthSignal = {
      disposition,
      billing_id: b.id ?? null,
      amount: Number(b.amount) || 0,
      amount_paid: Number(b.amount_paid) || 0,
      is_extension: !!b.is_extension,
    };
    const prev = map.get(ym);
    map.set(ym, prev ? mergeMonthSignals(prev, signal) : signal);
  }
  return map;
}

function pauseMonth(client: StreakClientContext): string | null {
  if (!client.billing_paused) return null;
  return yearMonthFromDate(client.billing_paused_at) ?? null;
}

function churnMonth(client: StreakClientContext): string | null {
  const status = (client.lifecycle_status ?? '').toLowerCase();
  if (status === 'active') return null;
  if (status === 'churned' || status === 'off_boarding' || status === 'paused') {
    return yearMonthFromDate(client.churned_at);
  }
  return null;
}

/**
 * Status flags applied when no stronger ledger signal exists for the month.
 * Pause/churn never upgrade a paid month.
 */
export function statusDispositionForMonth(
  client: StreakClientContext,
  yearMonth: string,
): MonthDisposition | null {
  const status = (client.lifecycle_status ?? '').toLowerCase();
  const churnYm = churnMonth(client);
  if (
    (status === 'churned' || status === 'off_boarding') &&
    churnYm &&
    compareYearMonth(yearMonth, churnYm) >= 0
  ) {
    return 'churned';
  }

  if (client.billing_paused) {
    const pYm = pauseMonth(client);
    if (!pYm || compareYearMonth(yearMonth, pYm) >= 0) {
      // Lifecycle pause (not just billing_paused) also paints gray for months
      // when still "active" lifecycle — billing_paused is the queue signal.
      return 'paused';
    }
  }

  if (status === 'paused') {
    return 'paused';
  }

  return null;
}

export function buildClientStreakTimeline(opts: {
  client: StreakClientContext;
  billings: StreakBillingRow[];
  overrides?: MonthDispositionOverride[];
  from?: string | null;
  to?: string | null;
  today?: Date;
}): ClientStreakTimeline {
  const today = opts.today ?? new Date();
  const todayYm =
    yearMonthFromDate(today.toISOString().slice(0, 10)) ??
    `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, '0')}`;

  const ledgerMap = deriveBillingMonthMap(opts.billings, today);
  const overrideMap = new Map<string, MonthDispositionOverride>();
  for (const o of opts.overrides ?? []) {
    if (isYearMonth(o.year_month) && isOverrideDisposition(o.disposition)) {
      overrideMap.set(o.year_month, o);
    }
  }

  const ledgerMonths = [...ledgerMap.keys()].sort(compareYearMonth);
  const firstLedger = ledgerMonths[0] ?? null;
  const anchorYm =
    firstLedger ??
    yearMonthFromDate(opts.client.launch_date) ??
    yearMonthFromDate(opts.client.date_signed);

  const toYm = opts.to && isYearMonth(opts.to) ? opts.to : todayYm;
  let fromYm =
    opts.from && isYearMonth(opts.from)
      ? opts.from
      : anchorYm ?? toYm;
  if (compareYearMonth(fromYm, toYm) > 0) fromYm = toYm;

  // Expand range if overrides/ledger sit outside requested window
  const allKnown = [
    ...ledgerMonths,
    ...overrideMap.keys(),
  ].sort(compareYearMonth);
  if (allKnown.length) {
    const minKnown = allKnown[0];
    const maxKnown = allKnown[allKnown.length - 1];
    if (!opts.from && compareYearMonth(minKnown, fromYm) < 0) fromYm = minKnown;
    if (!opts.to && compareYearMonth(maxKnown, toYm) > 0) {
      // do not extend past today unless opts.to set
    }
  }

  const months: MonthCell[] = [];
  for (const ym of monthRangeInclusive(fromYm, toYm)) {
    const override = overrideMap.get(ym);
    if (override) {
      months.push({
        year_month: ym,
        disposition: override.disposition,
        source: 'override',
        billing_id: ledgerMap.get(ym)?.billing_id ?? null,
        amount: ledgerMap.get(ym)?.amount ?? null,
        amount_paid: ledgerMap.get(ym)?.amount_paid ?? null,
        is_extension: override.disposition === 'extension',
        note: override.note ?? null,
      });
      continue;
    }

    const ledger = ledgerMap.get(ym);
    if (ledger) {
      // Pause/churn flags do not bury ledger paid/extension/short/unpaid
      months.push({
        year_month: ym,
        disposition: ledger.disposition,
        source: 'derived',
        billing_id: ledger.billing_id,
        amount: ledger.amount,
        amount_paid: ledger.amount_paid,
        is_extension: ledger.is_extension,
        note: null,
      });
      continue;
    }

    const statusDisp = statusDispositionForMonth(opts.client, ym);
    if (statusDisp) {
      months.push({
        year_month: ym,
        disposition: statusDisp,
        source: 'derived',
        billing_id: null,
        amount: null,
        amount_paid: null,
        is_extension: false,
        note: null,
      });
      continue;
    }

    months.push({
      year_month: ym,
      disposition: 'empty',
      source: 'derived',
      billing_id: null,
      amount: null,
      amount_paid: null,
      is_extension: false,
      note: null,
    });
  }

  return {
    months,
    summary: summarizeStreak(months, todayYm),
    first_billable_month: firstLedger ?? anchorYm,
  };
}

/**
 * Current consecutive paid streak ending at the latest non-empty, non-future month
 * that has a disposition relevant to payment (or break). Empty months after the
 * first billable are treated as unpaid breaks when scanning trailing streak.
 */
export function computeCurrentStreak(
  months: MonthCell[],
  asOfYm?: string,
): number {
  if (!months.length) return 0;
  const endYm = asOfYm ?? months[months.length - 1].year_month;
  const ordered = months
    .filter((m) => compareYearMonth(m.year_month, endYm) <= 0)
    .sort((a, b) => compareYearMonth(a.year_month, b.year_month));

  // Find last index that is not pure-empty trailing (allow streak into last paid)
  let i = ordered.length - 1;
  while (i >= 0) {
    const d = ordered[i].disposition;
    if (d === 'empty') {
      // trailing empties before "now" don't break until we hit content;
      // once past the first non-empty from the right, empty counts as break handled below
      i -= 1;
      continue;
    }
    break;
  }
  if (i < 0) return 0;

  // Walk back through consecutive paid only
  let streak = 0;
  for (; i >= 0; i -= 1) {
    const d = ordered[i].disposition;
    if (d === 'paid') {
      streak += 1;
      continue;
    }
    if (d === 'empty') {
      // gap mid-timeline without override: breaks streak
      break;
    }
    // short, extension, unpaid, paused, churned
    break;
  }
  return streak;
}

export function summarizeStreak(
  months: MonthCell[],
  asOfYm?: string,
): ClientStreakSummary {
  let total_paid = 0;
  let total_misses = 0;
  let total_extensions = 0;
  let total_short = 0;
  let total_paused = 0;
  for (const m of months) {
    if (m.disposition === 'paid') total_paid += 1;
    if (m.disposition === 'unpaid') total_misses += 1;
    if (m.disposition === 'short') {
      total_short += 1;
      total_misses += 1;
    }
    if (m.disposition === 'extension') total_extensions += 1;
    if (m.disposition === 'paused') total_paused += 1;
  }
  const current_streak = computeCurrentStreak(months, asOfYm);
  const last = months.length ? months[months.length - 1] : null;
  const recentBad =
    last != null &&
    (last.disposition === 'unpaid' ||
      last.disposition === 'short' ||
      last.disposition === 'extension' ||
      last.disposition === 'paused' ||
      last.disposition === 'churned');
  return {
    current_streak,
    total_paid,
    total_misses,
    total_extensions,
    total_short,
    total_paused,
    milestone_m3: current_streak >= 3,
    milestone_m6: current_streak >= 6,
    at_risk: current_streak === 0 || recentBad,
  };
}

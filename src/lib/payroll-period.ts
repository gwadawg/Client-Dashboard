/** Monthly payroll periods — always calendar month (1st through last day). */

export type PayrollMonthBounds = {
  periodMonth: string;
  startDate: string;
  endDate: string;
  label: string;
};

/** YYYY-MM from any date string. */
export function periodMonthFromDate(dateStr: string): string {
  return dateStr.slice(0, 7);
}

/** First and last day of a calendar month (periodMonth = YYYY-MM). */
export function monthBounds(periodMonth: string): PayrollMonthBounds {
  const [y, m] = periodMonth.split('-').map(Number);
  if (!y || !m || m < 1 || m > 12) {
    throw new Error('periodMonth must be YYYY-MM');
  }
  const startDate = `${periodMonth}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const endDate = `${periodMonth}-${String(lastDay).padStart(2, '0')}`;
  const label = new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  return { periodMonth, startDate, endDate, label };
}

export function currentPeriodMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function previousPeriodMonth(periodMonth: string): string {
  const [y, m] = periodMonth.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Recent months newest-first for picker (includes current month). */
export function listRecentPayrollMonths(count = 24): PayrollMonthBounds[] {
  const out: PayrollMonthBounds[] = [];
  let pm = currentPeriodMonth();
  for (let i = 0; i < count; i++) {
    out.push(monthBounds(pm));
    pm = previousPeriodMonth(pm);
  }
  return out;
}

export function isValidPeriodMonth(value: string): boolean {
  return /^\d{4}-\d{2}$/.test(value) && !Number.isNaN(monthBounds(value).startDate as unknown as number);
}

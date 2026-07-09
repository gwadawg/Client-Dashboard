export type PayType = 'call_rep' | 'b2b_setter';

export type PendingDispositionItem = {
  id: string;
  date: string;
  lead_name: string | null;
  type: string;
};

export type PendingDisposition = {
  count: number;
  items: PendingDispositionItem[];
};

export function normalizePayrollKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Infer roster employee name from partial attribution hints (credit queue / payroll warnings). */
export function inferRosterNameFromHints(
  roster: { name: string; phone: string }[],
  hints: (string | null | undefined)[],
): string | null {
  for (const hint of hints) {
    const trimmed = hint?.trim();
    if (!trimmed || trimmed === '#N/A' || trimmed.toLowerCase() === 'n/a') continue;
    const key = normalizePayrollKey(trimmed);
    if (!key) continue;
    for (const agent of roster) {
      const nameKey = normalizePayrollKey(agent.name);
      const phoneKey = normalizePayrollKey(agent.phone);
      if (
        key === nameKey ||
        key === phoneKey ||
        (nameKey.length >= 3 && key.includes(nameKey)) ||
        (key.length >= 3 && nameKey.includes(key))
      ) {
        return agent.name;
      }
    }
  }
  return null;
}

export function daysInMonthFromDate(isoDate: string): number {
  const [y, m] = isoDate.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

/** Fixed monthly pay (base + bonus), optionally prorated for early departure. */
export function computeFixedPay(
  baseSalary: number,
  monthlyBonus: number,
  prorateDays: number | null | undefined,
  periodStart: string,
): { base: number; bonus: number } {
  if (!prorateDays || prorateDays <= 0) {
    return { base: baseSalary, bonus: monthlyBonus };
  }
  const dim = daysInMonthFromDate(periodStart);
  const ratio = Math.min(prorateDays, dim) / dim;
  return {
    base: baseSalary * ratio,
    bonus: monthlyBonus * ratio,
  };
}

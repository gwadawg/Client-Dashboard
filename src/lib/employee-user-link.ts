import { normalizePayrollKey } from '@/lib/payroll-common';

export type LinkedEmployee = {
  id: string;
  name: string;
  phone: string;
  user_id: string | null;
  email: string | null;
};

/** Resolve roster employee for a logged-in user — linked user_id first, then email hint. */
export function resolveEmployeeForUser(
  roster: LinkedEmployee[],
  userId: string | null | undefined,
  userEmail: string | null | undefined,
): LinkedEmployee | null {
  if (!roster.length) return null;

  if (userId) {
    const linked = roster.find(a => a.user_id === userId);
    if (linked) return linked;
  }

  if (!userEmail) return null;
  const localPart = userEmail.split('@')[0] ?? '';
  const key = normalizePayrollKey(localPart);
  if (!key) return null;

  return (
    roster.find(a => {
      const nameKey = normalizePayrollKey(a.name);
      const phoneKey = normalizePayrollKey(a.phone);
      const emailKey = a.email ? normalizePayrollKey(a.email.split('@')[0] ?? '') : '';
      return key === nameKey || key === phoneKey || key === emailKey || nameKey.includes(key) || key.includes(nameKey);
    }) ?? null
  );
}

// Billing logic shared by the API routes and the reminder endpoint, so the
// "next billing date" and its status are computed in exactly one place.
//
// Dates are handled as plain YYYY-MM-DD strings in UTC to avoid timezone drift.

export type BillingType = "monthly" | "pif" | "pif_monthly";
export type NextBillingStatus = "upcoming" | "due_soon" | "overdue";

// A next billing date this many days out (or sooner) counts as "due soon".
export const DUE_SOON_DAYS = 7;

export interface BillingClient {
  billing_type?: string | null;
  date_signed?: string | null;
}

export interface BillingRow {
  billed_on: string;
  status?: string | null;
}

function parseYmd(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function formatYmd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

// Advance one calendar month, pinning to the given day-of-month (clamped to the
// target month's length, so e.g. a 31st anchor lands on Feb 28/29).
function addOneMonth(base: Date, anchorDay: number): Date {
  let year = base.getUTCFullYear();
  let month = base.getUTCMonth() + 1;
  if (month > 11) {
    month = 0;
    year += 1;
  }
  const day = Math.min(anchorDay, daysInMonth(year, month));
  return new Date(Date.UTC(year, month, day));
}

/**
 * The next date this client should be billed, or null when there is no
 * recurring schedule (PIF, or an unknown/missing billing type).
 *
 * - monthly / pif_monthly: one month after the last billing, on the anchor day
 *   (taken from date_signed). If never billed, the first expected bill is the
 *   signing date.
 * - pif: one-time, so there is no recurring "next" date.
 */
export function computeNextBillingDate(
  client: BillingClient,
  lastBilling?: BillingRow | null,
): string | null {
  const type = (client.billing_type ?? "").toLowerCase();
  if (type !== "monthly" && type !== "pif_monthly") return null;

  const anchorSource = client.date_signed ?? lastBilling?.billed_on ?? null;
  const anchorDay = anchorSource ? parseYmd(anchorSource).getUTCDate() : 1;

  if (lastBilling?.billed_on) {
    return formatYmd(addOneMonth(parseYmd(lastBilling.billed_on), anchorDay));
  }
  if (client.date_signed) {
    return formatYmd(parseYmd(client.date_signed));
  }
  return null;
}

/**
 * Forward-looking status of a next billing date relative to today:
 * overdue (past), due_soon (within DUE_SOON_DAYS), or upcoming. Null when there
 * is no next date.
 */
export function deriveStatus(
  nextBillingDate: string | null,
  today: Date = new Date(),
): NextBillingStatus | null {
  if (!nextBillingDate) return null;
  const next = parseYmd(nextBillingDate);
  const todayUtc = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
  );
  const diffDays = Math.round((next.getTime() - todayUtc) / 86_400_000);
  if (diffDays < 0) return "overdue";
  if (diffDays <= DUE_SOON_DAYS) return "due_soon";
  return "upcoming";
}

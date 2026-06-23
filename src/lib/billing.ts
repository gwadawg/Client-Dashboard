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
  // Explicit day-of-month (1-31) to bill on; when set it is the source of truth
  // for the billing day and overrides the launch-date day.
  billing_day?: number | null;
  // Fallback anchor for the billing day when billing_day is not set.
  launch_date?: string | null;
  date_signed?: string | null;
}

export interface BillingRow {
  billed_on: string;
  status?: string | null;
}

// The amount-aware shape of a recorded billing used for balance + state.
export interface BillingAmounts {
  amount: number;
  amount_paid?: number | null;
  due_date?: string | null;
  billed_on: string;
  status?: string | null;
}

export type RecordedState = "scheduled" | "paid" | "partial" | "overdue" | "pending" | "failed" | "refunded" | "voided";

/** Outstanding balance on a billing (never below zero). */
export function balanceOf(b: { amount: number; amount_paid?: number | null }): number {
  const due = Number(b.amount) || 0;
  const paid = Number(b.amount_paid) || 0;
  return Math.max(0, due - paid);
}

/**
 * Effective state of a recorded billing, derived from how much is paid and how
 * the due date sits against today. Explicit failed/refunded are preserved.
 */
export function recordedState(
  b: BillingAmounts,
  today: Date = new Date(),
): RecordedState {
  // Scheduled billings are explicitly committed future cycles — preserve the
  // status regardless of due date so they never auto-convert to "overdue".
  if (b.status === "scheduled") return "scheduled";
  if (b.status === "failed" || b.status === "refunded" || b.status === "voided") return b.status;
  const balance = balanceOf(b);
  const paid = Number(b.amount_paid) || 0;
  if (balance <= 0) return "paid";
  const dueRef = b.due_date ?? b.billed_on;
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const isOverdue = dueRef ? parseYmd(dueRef).getTime() < todayUtc : false;
  if (isOverdue) return "overdue";
  return paid > 0 ? "partial" : "pending";
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

// The next occurrence of `anchorDay` on or after `from` (used to project the
// upcoming billing date for a client that has never been billed yet, so a
// client launched months ago shows their next anniversary, not a stale date).
function nextOccurrence(anchorDay: number, from: Date): Date {
  let year = from.getUTCFullYear();
  let month = from.getUTCMonth();
  const fromUtc = Date.UTC(year, month, from.getUTCDate());
  let cand = new Date(Date.UTC(year, month, Math.min(anchorDay, daysInMonth(year, month))));
  if (cand.getTime() < fromUtc) {
    month += 1;
    if (month > 11) { month = 0; year += 1; }
    cand = new Date(Date.UTC(year, month, Math.min(anchorDay, daysInMonth(year, month))));
  }
  return cand;
}

/**
 * The next date this client should be billed, or null when there is no
 * recurring schedule.
 *
 * The billing day comes from the explicit billing_day when set; otherwise it is
 * anchored to the launch date (falls back to date_signed, then the last
 * billing). Any client that is not explicitly PIF recurs monthly on that day —
 * including clients with no billing_type set yet — so the whole active roster
 * projects and can be adjusted.
 *
 * - Already billed: one month after the last billing, on the anchor day.
 * - Never billed: the next billing-day anniversary on or after today (so a
 *   client launched long ago shows an upcoming date, not a stale overdue one).
 * - pif: one-time, so there is no recurring "next" date.
 */
export function computeNextBillingDate(
  client: BillingClient,
  lastBilling?: BillingRow | null,
  today: Date = new Date(),
): string | null {
  const type = (client.billing_type ?? "").toLowerCase();
  if (type === "pif") return null;

  // Explicit billing_day is the source of truth; fall back to the day-of-month
  // of the launch date, then date signed, then the last billing.
  let anchorDay: number | null = null;
  if (typeof client.billing_day === "number" && client.billing_day >= 1 && client.billing_day <= 31) {
    anchorDay = client.billing_day;
  } else {
    const anchorSource = client.launch_date ?? client.date_signed ?? lastBilling?.billed_on ?? null;
    if (!anchorSource) return null;
    anchorDay = parseYmd(anchorSource).getUTCDate();
  }

  if (lastBilling?.billed_on) {
    return formatYmd(addOneMonth(parseYmd(lastBilling.billed_on), anchorDay));
  }
  return formatYmd(nextOccurrence(anchorDay, today));
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

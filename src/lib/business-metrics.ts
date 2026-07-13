// CEO / Business view metric engine.
//
// Pure, deterministic functions that turn raw rows (clients, status history, and
// the billing ledger) into the agency-level KPIs rendered by the Business tab.
// No I/O here — the API route fetches the rows and hands them in, mirroring the
// split used by src/lib/metrics.ts and src/lib/ad-performance.ts so the math is
// unit-testable in isolation.
//
// Money is treated as plain numbers; dates as YYYY-MM-DD strings compared by
// their leading YYYY-MM so month bucketing never drifts across timezones.

import { balanceOf, recordedState, type BillingAmounts } from "./billing";

// ── Input row shapes (subset of the DB columns the engine needs) ──────────────

export type BusinessClient = {
  id: string;
  name: string;
  mrr: number | null;
  lifecycle_status: string | null;
  date_signed: string | null;
  churned_at: string | null;
  launch_date: string | null;
  offer: string | null;
  reporting_type: string | null;
  contract_end_date: string | null;
};

export type StatusHistoryRow = {
  client_id: string;
  previous_status: string | null;
  new_status: string;
  reason_code: string | null;
  note: string | null;
  mrr_at_change: number | null;
  changed_at: string; // ISO timestamp
};

export type BusinessBilling = {
  client_id: string;
  billed_on: string;
  due_date: string | null;
  paid_on: string | null;
  amount: number;
  amount_paid: number | null;
  status: string | null;
  revenue_type: string | null; // mrr | pif | performance | passthrough
  revenue_segment: string | null; // front_end | back_end
  lead_source: string | null;
  processing_fee: number | null;
  passthrough_amount: number | null;
};

// A single point in the business_metrics time series (imported or hand-entered).
export type BusinessMetricRow = {
  metric_key: string;
  period_date: string; // YYYY-MM-DD (first of the month by convention)
  value_numeric: number | null;
};

/** Point-in-time roster freeze (end-of-month books for `period_month`). */
export type ClientMonthlySnapshot = {
  client_id: string;
  period_month: string; // YYYY-MM-DD (first of month)
  lifecycle_status: string | null;
  mrr: number | null;
  is_active: boolean;
};

export type BusinessInput = {
  clients: BusinessClient[];
  statusHistory: StatusHistoryRow[];
  billings: BusinessBilling[];
  /** Imported / manual company-wide inputs (marketing spend, expenses, cash …). */
  businessMetrics?: BusinessMetricRow[];
  /** End-of-month roster snapshots — used for start/end MRR + expansion. */
  snapshots?: ClientMonthlySnapshot[];
  /**
   * Acquisition signed closes per YYYY-MM (non-dismissed). CAC denominator.
   * When omitted, CAC falls back to roster `date_signed` count.
   */
  signedClosesByMonth?: Record<string, number>;
  /**
   * Churn form `effective_churn_date` (YYYY-MM-DD) by client id.
   * Wins over `clients.churned_at` so late-reported churns land in the real leave month.
   */
  effectiveChurnDateByClient?: Record<string, string>;
  /** Reporting window. Prefer over bare `month` for quarter / YTD. */
  period?: ResolvedPeriod;
  /** Single YYYY-MM when `period` is omitted. */
  month?: string;
  /** Number of trailing months (including period end) for the trend series. */
  trendMonths?: number;
  /** Reference "now" for tenure / contract-ending windows. Defaults to new Date(). */
  now?: Date;
};

export type PeriodGranularity = "month" | "quarter" | "ytd";

export type ResolvedPeriod = {
  granularity: PeriodGranularity;
  /** Stable key: YYYY-MM | YYYY-QN | YYYY */
  key: string;
  label: string;
  /** Inclusive months in the window, ascending YYYY-MM. */
  months: string[];
  startMonth: string;
  endMonth: string;
};

// Canonical business_metrics keys the unit-economics engine understands. These
// are the inputs you import (or type in) over time; everything else is derived.
export const BUSINESS_METRIC_KEYS = {
  marketing_spend: "Agency client-acquisition spend for the month",
  operating_expenses: "Total company operating expenses for the month",
  delivery_costs: "Cost to deliver client work (COGS) for the month",
  cash_balance: "Cash on hand at month end",
  headcount: "Team headcount",
} as const;

export type BusinessMetricKey = keyof typeof BUSINESS_METRIC_KEYS;

// ── Output shapes ─────────────────────────────────────────────────────────────

export type Headline = {
  active_mrr: number;
  active_clients: number;
  arpa: number;
  new_mrr: number;
  lost_mrr: number;
  net_new_mrr: number;
  cash_collected: number;
  gross_revenue_churn_pct: number | null;
  // MRR at the start of the target month (snapshot prior month when available).
  start_mrr: number;
};

export type RevenueBreakdown = { key: string; amount: number };

export type Revenue = {
  new_cash: number;
  new_logo_cash: number;
  recurring_cash: number;
  total_cash: number;
  net_of_fees: number;
  by_type: RevenueBreakdown[];
  by_lead_source: RevenueBreakdown[];
  // Running (all-time, not month-scoped) accounts-receivable health.
  open_ar: number;
  overdue_ar: number;
};

export type MrrBridge = {
  start_mrr: number;
  new_mrr: number;
  expansion_mrr: number;
  contraction_mrr: number;
  lost_mrr: number;
  end_mrr: number;
};

export type ChurnedClient = {
  client_id: string;
  name: string;
  mrr: number;
  reason_code: string | null;
  note: string | null;
  departure_status: string;
};

export type ChurnReasonBucket = {
  reason_code: string;
  count: number;
  lost_mrr: number;
};

export type Churn = {
  logo_churn_pct: number | null;
  gross_revenue_churn_pct: number | null;
  nrr_pct: number | null;
  quick_ratio: number | null;
  churned_clients: ChurnedClient[];
  churned_count: number;
  churn_by_reason: ChurnReasonBucket[];
  avg_tenure_months: number | null;
};

export type LifecycleBucket = { status: string; count: number };
export type OfferBucket = { offer: string; mrr: number; count: number };
export type ContractEnding = {
  client_id: string;
  name: string;
  mrr: number;
  contract_end_date: string;
  days_left: number;
};

export type Portfolio = {
  lifecycle: LifecycleBucket[];
  new_clients_signed: number;
  by_offer: OfferBucket[];
  top_client_pct: number | null;
  top5_pct: number | null;
  contracts_ending_60d: ContractEnding[];
  contracts_ending_90d_mrr: number;
};

export type TrendPoint = {
  month: string; // YYYY-MM
  cash_collected: number;
  new_cash: number;
  recurring_cash: number;
  mrr_end: number; // reconstructed end-of-month MRR
  // Finance overlays — null on months with no imported inputs yet.
  marketing_spend: number | null;
  operating_expenses: number | null;
  cac: number | null;
  roas: number | null;
  operating_profit: number | null;
};

// High-value metrics that come alive once acquisition + expense data is imported.
// Every field is null until its required inputs exist, so the UI can fall back
// to a "needs data" placeholder per metric.
export type UnitEconomics = {
  // Raw inputs (echoed back so the editor can prefill).
  marketing_spend: number | null;
  operating_expenses: number | null;
  delivery_costs: number | null;
  cash_balance: number | null;
  headcount: number | null;
  // Acquisition efficiency.
  cac: number | null;
  /** Denominator used for CAC (signed closes preferred). */
  cac_closes: number;
  ltv: number | null;
  ltv_is_margin_based: boolean;
  ltv_cac: number | null;
  cac_payback_months: number | null;
  roas: number | null;
  // Profitability.
  gross_margin_pct: number | null;
  operating_profit: number | null;
  profit_margin_pct: number | null;
  // Sustainability.
  net_burn: number | null; // positive = burning cash
  runway_months: number | null; // null when profitable or no cash figure
  is_profitable: boolean;
  rule_of_40: number | null;
  revenue_per_head: number | null; // annualized MRR per head
  /** Meta ad spend this month (informational; CAC uses expense rollup when set). */
  acquisition_ad_spend?: number | null;
};

export type BusinessMetrics = {
  /** End month of the selected period (YYYY-MM), kept for trend anchoring. */
  month: string;
  /** Selected reporting window (month / quarter / YTD). */
  period: ResolvedPeriod;
  headline: Headline;
  revenue: Revenue;
  mrrBridge: MrrBridge;
  churn: Churn;
  portfolio: Portfolio;
  unitEconomics: UnitEconomics;
  trend: TrendPoint[];
};

// ── Date / period helpers (YYYY-MM bucketing, timezone-safe) ───────────────────

const ACTIVE = "active";
const CHURNED = "churned";
const OFF_BOARDING = "off_boarding";
const DEPARTURE_STATUSES = new Set([CHURNED, OFF_BOARDING]);

/** Current calendar month as YYYY-MM (local). */
export function currentMonth(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/** The YYYY-MM bucket of a date/timestamp string, or null if unparseable. */
function monthOf(value: string | null | undefined): string | null {
  if (!value) return null;
  const m = value.slice(0, 7);
  return /^\d{4}-\d{2}$/.test(m) ? m : null;
}

/** Step a YYYY-MM back/forward by n months. */
export function addMonths(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${base.getUTCFullYear()}-${String(base.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthsBetweenInclusive(startMonth: string, endMonth: string): string[] {
  const out: string[] = [];
  let cur = startMonth;
  // Guard runaway loops.
  for (let i = 0; i < 36; i++) {
    out.push(cur);
    if (cur === endMonth) break;
    cur = addMonths(cur, 1);
    if (cur > endMonth) break;
  }
  return out;
}

function quarterIndex(month: string): number {
  const m = Number(month.slice(5, 7));
  return Math.ceil(m / 3);
}

function monthsInQuarter(year: number, q: number): string[] {
  const startM = (q - 1) * 3 + 1;
  return [0, 1, 2].map((i) => `${year}-${String(startM + i).padStart(2, "0")}`);
}

/** Resolve a reporting window from granularity + key. */
export function resolveBusinessPeriod(
  granularity: PeriodGranularity,
  key: string | null | undefined,
  now: Date = new Date(),
): ResolvedPeriod {
  const cur = currentMonth(now);

  if (granularity === "quarter") {
    let year: number;
    let q: number;
    const qMatch = key?.match(/^(\d{4})-Q([1-4])$/i);
    if (qMatch) {
      year = Number(qMatch[1]);
      q = Number(qMatch[2]);
    } else if (key && /^\d{4}-\d{2}$/.test(key)) {
      year = Number(key.slice(0, 4));
      q = quarterIndex(key);
    } else {
      year = Number(cur.slice(0, 4));
      q = quarterIndex(cur);
    }
    const months = monthsInQuarter(year, q);
    return {
      granularity: "quarter",
      key: `${year}-Q${q}`,
      label: `Q${q} ${year}`,
      months,
      startMonth: months[0],
      endMonth: months[2],
    };
  }

  if (granularity === "ytd") {
    const year = key && /^\d{4}/.test(key) ? Number(key.slice(0, 4)) : Number(cur.slice(0, 4));
    const startMonth = `${year}-01`;
    const endMonth = year === Number(cur.slice(0, 4)) ? cur : `${year}-12`;
    const months = monthsBetweenInclusive(startMonth, endMonth);
    return {
      granularity: "ytd",
      key: String(year),
      label: year === Number(cur.slice(0, 4)) ? `YTD ${year}` : `Full year ${year}`,
      months,
      startMonth,
      endMonth,
    };
  }

  // month
  const month = key && /^\d{4}-\d{2}$/.test(key) ? key : cur;
  const [y, m] = month.split("-").map(Number);
  const label = new Date(Date.UTC(y, m - 1, 1)).toLocaleString(undefined, {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  return {
    granularity: "month",
    key: month,
    label,
    months: [month],
    startMonth: month,
    endMonth: month,
  };
}

/** Recent month keys newest-first. */
export function listRecentMonths(count: number, now: Date = new Date()): string[] {
  const out: string[] = [];
  let cur = currentMonth(now);
  for (let i = 0; i < count; i++) {
    out.push(cur);
    cur = addMonths(cur, -1);
  }
  return out;
}

/** Recent quarter keys newest-first (YYYY-QN). */
export function listRecentQuarters(count: number, now: Date = new Date()): string[] {
  const out: string[] = [];
  let year = now.getFullYear();
  let q = quarterIndex(currentMonth(now));
  for (let i = 0; i < count; i++) {
    out.push(`${year}-Q${q}`);
    q -= 1;
    if (q < 1) {
      q = 4;
      year -= 1;
    }
  }
  return out;
}

/** Recent calendar years newest-first (for YTD picker). */
export function listRecentYears(count: number, now: Date = new Date()): string[] {
  const y = now.getFullYear();
  return Array.from({ length: count }, (_, i) => String(y - i));
}

function num(v: number | null | undefined): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function pct(part: number, whole: number): number | null {
  if (!whole) return null;
  return (part / whole) * 100;
}

const NON_CASH_STATUSES = new Set(["voided", "refunded"]);

/** A billing counts as revenue unless it is a full passthrough (ad-spend reimbursement). */
function isRevenue(b: BusinessBilling): boolean {
  if (b.revenue_type === "passthrough") return false;
  if (b.status && NON_CASH_STATUSES.has(b.status)) return false;
  return true;
}

/**
 * Collected cash on a billing in any of the period months (dated by paid_on).
 * Subtracts `passthrough_amount` so mixed retainer+adspend invoices don't inflate revenue.
 */
function collectedInPeriod(b: BusinessBilling, months: Set<string>): number {
  if (!isRevenue(b)) return 0;
  const m = monthOf(b.paid_on);
  if (!m || !months.has(m)) return 0;
  return Math.max(0, num(b.amount_paid) - num(b.passthrough_amount));
}

/**
 * Overlay churn-form effective dates onto roster rows so late reports use the
 * date entered on the form, not when the form was submitted.
 */
export function applyEffectiveChurnDates(
  clients: BusinessClient[],
  effectiveChurnDateByClient?: Record<string, string>,
): BusinessClient[] {
  if (!effectiveChurnDateByClient) return clients;
  return clients.map((c) => {
    const formDate = effectiveChurnDateByClient[c.id]?.trim();
    if (!formDate || !/^\d{4}-\d{2}-\d{2}/.test(formDate)) return c;
    return { ...c, churned_at: `${formDate.slice(0, 10)}T12:00:00.000Z` };
  });
}

/**
 * One Lost-MRR event per client from roster lifecycle history (not billings).
 * Month bucket priority:
 *   1. churn form `effective_churn_date` (when provided)
 *   2. `clients.churned_at` (backdated leave)
 *   3. first transition into off_boarding / churned (`changed_at`)
 * Amount is `mrr_at_change` at that first departure (MRR when they left the book).
 */
export function computeDeparturesForMonth(
  clients: BusinessClient[],
  statusHistory: StatusHistoryRow[],
  month: string,
  effectiveChurnDateByClient?: Record<string, string>,
): ChurnedClient[] {
  const clientById = new Map(clients.map((c) => [c.id, c]));
  const byClient = new Map<string, StatusHistoryRow[]>();
  for (const h of statusHistory) {
    if (!DEPARTURE_STATUSES.has(h.new_status)) continue;
    const list = byClient.get(h.client_id) ?? [];
    list.push(h);
    byClient.set(h.client_id, list);
  }

  const out: ChurnedClient[] = [];
  for (const [clientId, rows] of byClient) {
    rows.sort((a, b) => a.changed_at.localeCompare(b.changed_at));
    const first = rows[0];
    const churnedRow = rows.find((r) => r.new_status === CHURNED) ?? null;
    const display = churnedRow ?? first;
    const client = clientById.get(clientId);
    const formDate = effectiveChurnDateByClient?.[clientId];
    const effectiveMonth =
      monthOf(formDate) ?? monthOf(client?.churned_at) ?? monthOf(first.changed_at);
    if (effectiveMonth !== month) continue;
    out.push({
      client_id: clientId,
      name: client?.name ?? "Unknown",
      mrr: num(first.mrr_at_change),
      reason_code: display.reason_code ?? first.reason_code ?? null,
      note: display.note ?? first.note ?? null,
      departure_status: display.new_status,
    });
  }
  out.sort((a, b) => b.mrr - a.mrr);
  return out;
}

function snapshotMonthKey(periodMonth: string): string | null {
  return monthOf(periodMonth);
}

function activeMrrFromSnapshots(
  snapshots: ClientMonthlySnapshot[],
  month: string,
): number | null {
  const rows = snapshots.filter((s) => snapshotMonthKey(s.period_month) === month);
  if (rows.length === 0) return null;
  return rows.reduce((sum, s) => {
    const active = s.is_active || s.lifecycle_status === ACTIVE;
    return active ? sum + num(s.mrr) : sum;
  }, 0);
}

/** Expansion / contraction from MoM snapshot deltas on clients active in both months. */
function expansionContractionFromSnapshots(
  snapshots: ClientMonthlySnapshot[],
  startMonth: string,
  endMonth: string,
): { expansion_mrr: number; contraction_mrr: number } {
  const startRows = snapshots.filter((s) => snapshotMonthKey(s.period_month) === startMonth);
  const endRows = snapshots.filter((s) => snapshotMonthKey(s.period_month) === endMonth);
  if (startRows.length === 0 || endRows.length === 0) {
    return { expansion_mrr: 0, contraction_mrr: 0 };
  }
  const startByClient = new Map(
    startRows
      .filter((s) => s.is_active || s.lifecycle_status === ACTIVE)
      .map((s) => [s.client_id, num(s.mrr)]),
  );
  const endByClient = new Map(
    endRows
      .filter((s) => s.is_active || s.lifecycle_status === ACTIVE)
      .map((s) => [s.client_id, num(s.mrr)]),
  );
  let expansion_mrr = 0;
  let contraction_mrr = 0;
  for (const [clientId, startMrr] of startByClient) {
    if (!endByClient.has(clientId)) continue;
    const delta = (endByClient.get(clientId) ?? 0) - startMrr;
    if (delta > 0) expansion_mrr += delta;
    else if (delta < 0) contraction_mrr += -delta;
  }
  return { expansion_mrr, contraction_mrr };
}

// ── Engine ────────────────────────────────────────────────────────────────────

export function computeBusinessMetrics(input: BusinessInput): BusinessMetrics {
  const now = input.now ?? new Date();
  const period =
    input.period ??
    resolveBusinessPeriod("month", input.month ?? currentMonth(now), now);
  const monthsSet = new Set(period.months);
  const endMonth = period.endMonth;
  const trendMonths = input.trendMonths ?? 12;
  const effectiveChurnDateByClient = input.effectiveChurnDateByClient;
  const clients = applyEffectiveChurnDates(input.clients, effectiveChurnDateByClient);
  const { statusHistory, billings } = input;
  const snapshots = input.snapshots ?? [];
  const signedClosesByMonth = input.signedClosesByMonth ?? {};

  // Imported / manual inputs bucketed as month -> key -> value.
  const financeByMonth = bucketBusinessMetrics(input.businessMetrics ?? []);
  const finance = sumFinanceAcrossMonths(financeByMonth, period.months);

  // ── Current portfolio snapshot (as-of now) ────────────────────────────────
  const activeClients = clients.filter((c) => c.lifecycle_status === ACTIVE);
  const live_active_mrr = activeClients.reduce((s, c) => s + num(c.mrr), 0);
  const active_clients = activeClients.length;
  const arpa = active_clients ? live_active_mrr / active_clients : 0;

  // End MRR for the period: snapshot of last month when frozen, else live book.
  const snapEnd = activeMrrFromSnapshots(snapshots, endMonth);
  const isCurrentEnd = endMonth === currentMonth(now);
  const end_mrr = snapEnd != null && !isCurrentEnd ? snapEnd : live_active_mrr;
  const active_mrr = live_active_mrr;

  // ── MRR movement across the period ────────────────────────────────────────
  const new_mrr = clients
    .filter((c) => {
      const m = monthOf(c.date_signed);
      return m != null && monthsSet.has(m);
    })
    .reduce((s, c) => s + num(c.mrr), 0);

  const churned_clients: ChurnedClient[] = [];
  for (const m of period.months) {
    churned_clients.push(
      ...computeDeparturesForMonth(clients, statusHistory, m, effectiveChurnDateByClient),
    );
  }
  const lost_mrr = churned_clients.reduce((s, c) => s + c.mrr, 0);
  const churned_count = churned_clients.length;

  const priorMonth = addMonths(period.startMonth, -1);
  const snapStart = activeMrrFromSnapshots(snapshots, priorMonth);

  let expansion_mrr = 0;
  let contraction_mrr = 0;
  for (const m of period.months) {
    const prior = addMonths(m, -1);
    const ec = expansionContractionFromSnapshots(snapshots, prior, m);
    expansion_mrr += ec.expansion_mrr;
    contraction_mrr += ec.contraction_mrr;
  }

  const net_new_mrr = new_mrr + expansion_mrr - contraction_mrr - lost_mrr;

  // Start-of-period MRR: snapshot before first month when present; else reconstruct.
  const start_mrr =
    snapStart != null ? snapStart : Math.max(0, end_mrr - net_new_mrr);

  // ── Revenue & cash (cash-collected basis) ─────────────────────────────────
  let new_cash = 0;
  let recurring_cash = 0;
  let total_cash = 0;
  let net_of_fees = 0;
  const byType = new Map<string, number>();
  const byLeadSource = new Map<string, number>();

  for (const b of billings) {
    const collected = collectedInPeriod(b, monthsSet);
    if (collected === 0) continue;
    total_cash += collected;
    net_of_fees += collected - num(b.processing_fee);
    if (b.revenue_segment === "front_end") new_cash += collected;
    else if (b.revenue_segment === "back_end") recurring_cash += collected;
    const type = b.revenue_type ?? "untagged";
    byType.set(type, (byType.get(type) ?? 0) + collected);
    const src = b.lead_source ?? "Unknown";
    byLeadSource.set(src, (byLeadSource.get(src) ?? 0) + collected);
  }

  const new_logo_cash = computeNewLogoCash(billings, monthsSet);

  let open_ar = 0;
  let overdue_ar = 0;
  for (const b of billings) {
    if (!isRevenue(b)) continue;
    const amounts: BillingAmounts = {
      amount: num(b.amount),
      amount_paid: b.amount_paid,
      due_date: b.due_date,
      billed_on: b.billed_on,
      status: b.status,
    };
    const state = recordedState(amounts, now);
    if (state === "paid" || state === "refunded" || state === "voided") continue;
    const bal = balanceOf({ amount: num(b.amount), amount_paid: b.amount_paid });
    open_ar += bal;
    if (state === "overdue" || state === "failed") overdue_ar += bal;
  }

  const revenue: Revenue = {
    new_cash,
    new_logo_cash,
    recurring_cash,
    total_cash,
    net_of_fees,
    by_type: toSortedBreakdown(byType),
    by_lead_source: toSortedBreakdown(byLeadSource),
    open_ar,
    overdue_ar,
  };

  // ── Churn & retention ─────────────────────────────────────────────────────
  const new_clients_signed = clients.filter((c) => {
    const m = monthOf(c.date_signed);
    return m != null && monthsSet.has(m);
  }).length;
  let signed_closes = 0;
  let hasCloseCounts = false;
  for (const m of period.months) {
    if (typeof signedClosesByMonth[m] === "number") {
      hasCloseCounts = true;
      signed_closes += signedClosesByMonth[m];
    }
  }
  if (!hasCloseCounts) signed_closes = new_clients_signed;

  const active_at_start = Math.max(0, active_clients - new_clients_signed + churned_count);

  const reasonAgg = new Map<string, { count: number; lost_mrr: number }>();
  for (const h of churned_clients) {
    const code = h.reason_code ?? "unknown";
    const cur = reasonAgg.get(code) ?? { count: 0, lost_mrr: 0 };
    cur.count += 1;
    cur.lost_mrr += h.mrr;
    reasonAgg.set(code, cur);
  }
  const churn_by_reason: ChurnReasonBucket[] = [...reasonAgg.entries()]
    .map(([reason_code, v]) => ({ reason_code, count: v.count, lost_mrr: v.lost_mrr }))
    .sort((a, b) => b.lost_mrr - a.lost_mrr);

  const denomMovement = lost_mrr + contraction_mrr;
  const quick_ratio = denomMovement > 0 ? (new_mrr + expansion_mrr) / denomMovement : null;
  const nrr_pct =
    start_mrr > 0
      ? ((start_mrr + expansion_mrr - contraction_mrr - lost_mrr) / start_mrr) * 100
      : null;

  const churn: Churn = {
    logo_churn_pct: pct(churned_count, active_at_start),
    gross_revenue_churn_pct: pct(lost_mrr, start_mrr),
    nrr_pct,
    quick_ratio,
    churned_clients,
    churned_count,
    churn_by_reason,
    avg_tenure_months: averageTenureMonths(clients, now),
  };

  const portfolio = computePortfolio(clients, activeClients, active_mrr, monthsSet, now);

  const headline: Headline = {
    active_mrr,
    active_clients,
    arpa,
    new_mrr,
    lost_mrr,
    net_new_mrr,
    cash_collected: total_cash,
    gross_revenue_churn_pct: pct(lost_mrr, start_mrr),
    start_mrr,
  };

  const mrrBridge: MrrBridge = {
    start_mrr,
    new_mrr,
    expansion_mrr,
    contraction_mrr,
    lost_mrr,
    end_mrr,
  };

  const unitEconomics = computeUnitEconomics({
    finance,
    active_mrr,
    arpa,
    avg_tenure_months: churn.avg_tenure_months,
    cac_closes: signed_closes,
    new_cash,
    total_cash,
    start_mrr,
  });

  const trend = computeTrend({
    clients,
    statusHistory,
    billings,
    financeByMonth,
    signedClosesByMonth,
    snapshots,
    endMonth,
    months: trendMonths,
    currentActiveMrr: active_mrr,
    now,
  });

  return {
    month: endMonth,
    period,
    headline,
    revenue,
    mrrBridge,
    churn,
    portfolio,
    unitEconomics,
    trend,
  };
}

function sumFinanceAcrossMonths(
  financeByMonth: Map<string, Record<string, number>>,
  months: string[],
): Record<string, number> {
  const sumKeys = ["marketing_spend", "operating_expenses", "delivery_costs"] as const;
  const lastKeys = ["cash_balance", "headcount"] as const;
  const out: Record<string, number> = {};
  for (const k of sumKeys) {
    let total = 0;
    let any = false;
    for (const m of months) {
      const v = financeByMonth.get(m)?.[k];
      if (typeof v === "number" && Number.isFinite(v)) {
        total += v;
        any = true;
      }
    }
    if (any) out[k] = total;
  }
  const last = months[months.length - 1];
  const lastFin = financeByMonth.get(last) ?? {};
  for (const k of lastKeys) {
    if (typeof lastFin[k] === "number" && Number.isFinite(lastFin[k])) out[k] = lastFin[k];
  }
  return out;
}

/** month -> (metric_key -> value) from the raw business_metrics rows. */
function bucketBusinessMetrics(rows: BusinessMetricRow[]): Map<string, Record<string, number>> {
  const out = new Map<string, Record<string, number>>();
  for (const r of rows) {
    if (r.value_numeric == null || !Number.isFinite(r.value_numeric)) continue;
    const m = monthOf(r.period_date);
    if (!m) continue;
    const bucket = out.get(m) ?? {};
    bucket[r.metric_key] = r.value_numeric;
    out.set(m, bucket);
  }
  return out;
}

// ── Unit economics & finance (derived from imported inputs + portfolio) ───────

function computeUnitEconomics(args: {
  finance: Record<string, number>;
  active_mrr: number;
  arpa: number;
  avg_tenure_months: number | null;
  /** Signed closes this month (CAC denominator). */
  cac_closes: number;
  new_cash: number;
  total_cash: number;
  start_mrr: number;
}): UnitEconomics {
  const f = args.finance;
  const has = (k: string) => typeof f[k] === "number" && Number.isFinite(f[k]);
  const val = (k: string) => (has(k) ? f[k] : null);

  const marketing_spend = val("marketing_spend");
  const operating_expenses = val("operating_expenses");
  const delivery_costs = val("delivery_costs");
  const cash_balance = val("cash_balance");
  const headcount = val("headcount");

  // CAC = marketing spend ÷ signed closes (acquisition closes).
  const cac_closes = Math.max(0, args.cac_closes);
  const cac =
    marketing_spend != null && cac_closes > 0 ? marketing_spend / cac_closes : null;

  const gross_margin_pct =
    delivery_costs != null && args.total_cash > 0
      ? ((args.total_cash - delivery_costs) / args.total_cash) * 100
      : null;
  const marginFrac = gross_margin_pct != null ? gross_margin_pct / 100 : null;

  // Revenue LTV = ARPA × tenure; multiplied by gross margin when known.
  const ltvRevenue =
    args.arpa > 0 && args.avg_tenure_months != null ? args.arpa * args.avg_tenure_months : null;
  const ltv = ltvRevenue != null ? ltvRevenue * (marginFrac ?? 1) : null;
  const ltv_cac = ltv != null && cac != null && cac > 0 ? ltv / cac : null;
  const cac_payback_months =
    cac != null && args.arpa > 0 ? cac / (args.arpa * (marginFrac ?? 1)) : null;
  // First-month cash ROAS: new cash collected ÷ acquisition spend.
  const roas =
    marketing_spend != null && marketing_spend > 0 ? args.new_cash / marketing_spend : null;

  // Profitability.
  const operating_profit =
    operating_expenses != null ? args.total_cash - operating_expenses : null;
  const profit_margin_pct =
    operating_profit != null && args.total_cash > 0
      ? (operating_profit / args.total_cash) * 100
      : null;

  // Sustainability.
  const net_burn = operating_expenses != null ? operating_expenses - args.total_cash : null;
  const is_profitable = net_burn != null && net_burn <= 0;
  const runway_months =
    cash_balance != null && net_burn != null && net_burn > 0 ? cash_balance / net_burn : null;

  // Rule of 40 = annualized MRR growth % + operating profit margin %.
  const mrrGrowthPct =
    args.start_mrr > 0 ? ((args.active_mrr - args.start_mrr) / args.start_mrr) * 100 : null;
  const annualizedGrowth = mrrGrowthPct != null ? mrrGrowthPct * 12 : null;
  const rule_of_40 =
    annualizedGrowth != null && profit_margin_pct != null
      ? annualizedGrowth + profit_margin_pct
      : null;

  const revenue_per_head =
    headcount != null && headcount > 0 ? (args.active_mrr * 12) / headcount : null;

  return {
    marketing_spend,
    operating_expenses,
    delivery_costs,
    cash_balance,
    headcount,
    cac,
    cac_closes,
    ltv,
    ltv_is_margin_based: marginFrac != null,
    ltv_cac,
    cac_payback_months,
    roas,
    gross_margin_pct,
    operating_profit,
    profit_margin_pct,
    net_burn,
    runway_months,
    is_profitable,
    rule_of_40,
    revenue_per_head,
  };
}

// ── Sub-computations ──────────────────────────────────────────────────────────

function toSortedBreakdown(m: Map<string, number>): RevenueBreakdown[] {
  return Array.from(m.entries())
    .map(([key, amount]) => ({ key, amount }))
    .sort((a, b) => b.amount - a.amount);
}

/** Sum of each client's first-ever paid billing whose payment lands in `months`. */
function computeNewLogoCash(billings: BusinessBilling[], months: Set<string>): number {
  const firstPaid = new Map<string, BusinessBilling>();
  for (const b of billings) {
    if (!isRevenue(b) || !b.paid_on) continue;
    if (num(b.amount_paid) - num(b.passthrough_amount) <= 0) continue;
    const cur = firstPaid.get(b.client_id);
    if (!cur || b.paid_on < (cur.paid_on as string)) firstPaid.set(b.client_id, b);
  }
  let total = 0;
  for (const b of firstPaid.values()) {
    const m = monthOf(b.paid_on);
    if (m && months.has(m)) {
      total += Math.max(0, num(b.amount_paid) - num(b.passthrough_amount));
    }
  }
  return total;
}

/** Mean tenure in months: date_signed → churned_at (or now for active clients). */
function averageTenureMonths(clients: BusinessClient[], now: Date): number | null {
  const spans: number[] = [];
  for (const c of clients) {
    if (!c.date_signed) continue;
    const start = Date.parse(c.date_signed);
    if (Number.isNaN(start)) continue;
    const endStr = c.churned_at;
    const end = endStr ? Date.parse(endStr) : now.getTime();
    if (Number.isNaN(end) || end < start) continue;
    spans.push((end - start) / (1000 * 60 * 60 * 24 * 30.44));
  }
  if (!spans.length) return null;
  return spans.reduce((s, v) => s + v, 0) / spans.length;
}

function computePortfolio(
  clients: BusinessClient[],
  activeClients: BusinessClient[],
  active_mrr: number,
  months: Set<string>,
  now: Date,
): Portfolio {
  const lifecycleMap = new Map<string, number>();
  for (const c of clients) {
    const s = c.lifecycle_status ?? "unknown";
    lifecycleMap.set(s, (lifecycleMap.get(s) ?? 0) + 1);
  }
  const order = ["new_account", "onboarding", "active", "paused", "off_boarding", "churned"];
  const lifecycle: LifecycleBucket[] = Array.from(lifecycleMap.entries())
    .map(([status, count]) => ({ status, count }))
    .sort((a, b) => {
      const ai = order.indexOf(a.status);
      const bi = order.indexOf(b.status);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });

  const new_clients_signed = clients.filter((c) => {
    const m = monthOf(c.date_signed);
    return m != null && months.has(m);
  }).length;

  const offerMap = new Map<string, { mrr: number; count: number }>();
  for (const c of activeClients) {
    const offer = c.offer ?? c.reporting_type ?? "Other";
    const cur = offerMap.get(offer) ?? { mrr: 0, count: 0 };
    cur.mrr += num(c.mrr);
    cur.count += 1;
    offerMap.set(offer, cur);
  }
  const by_offer: OfferBucket[] = Array.from(offerMap.entries())
    .map(([offer, v]) => ({ offer, mrr: v.mrr, count: v.count }))
    .sort((a, b) => b.mrr - a.mrr);

  const activeMrrValues = activeClients
    .map((c) => num(c.mrr))
    .sort((a, b) => b - a);
  const top_client_pct = active_mrr > 0 && activeMrrValues.length ? (activeMrrValues[0] / active_mrr) * 100 : null;
  const top5 = activeMrrValues.slice(0, 5).reduce((s, v) => s + v, 0);
  const top5_pct = active_mrr > 0 ? (top5 / active_mrr) * 100 : null;

  const dayMs = 1000 * 60 * 60 * 24;
  const contracts: ContractEnding[] = [];
  let contracts_ending_90d_mrr = 0;
  for (const c of activeClients) {
    if (!c.contract_end_date) continue;
    const end = Date.parse(c.contract_end_date);
    if (Number.isNaN(end)) continue;
    const daysLeft = Math.round((end - now.getTime()) / dayMs);
    if (daysLeft < 0) continue;
    if (daysLeft <= 90) contracts_ending_90d_mrr += num(c.mrr);
    if (daysLeft <= 60) {
      contracts.push({
        client_id: c.id,
        name: c.name,
        mrr: num(c.mrr),
        contract_end_date: c.contract_end_date,
        days_left: daysLeft,
      });
    }
  }
  contracts.sort((a, b) => a.days_left - b.days_left);

  return {
    lifecycle,
    new_clients_signed,
    by_offer,
    top_client_pct,
    top5_pct,
    contracts_ending_60d: contracts,
    contracts_ending_90d_mrr,
  };
}

/**
 * Trailing month-by-month series. Cash figures are exact (from paid billings).
 * MRR end uses monthly snapshots when present; otherwise walks backward from
 * live Active MRR using each month's net movement (new − lost ± expansion).
 */
function computeTrend(args: {
  clients: BusinessClient[];
  statusHistory: StatusHistoryRow[];
  billings: BusinessBilling[];
  financeByMonth: Map<string, Record<string, number>>;
  signedClosesByMonth: Record<string, number>;
  snapshots: ClientMonthlySnapshot[];
  endMonth: string;
  months: number;
  currentActiveMrr: number;
  now: Date;
}): TrendPoint[] {
  const {
    clients,
    statusHistory,
    billings,
    financeByMonth,
    signedClosesByMonth,
    snapshots,
    endMonth,
    months,
    currentActiveMrr,
    now,
  } = args;

  const monthsList: string[] = [];
  for (let i = months - 1; i >= 0; i--) monthsList.push(addMonths(endMonth, -i));

  const newClientsByMonthCount = new Map<string, number>();
  for (const c of clients) {
    const m = monthOf(c.date_signed);
    if (!m) continue;
    newClientsByMonthCount.set(m, (newClientsByMonthCount.get(m) ?? 0) + 1);
  }

  const cashByMonth = new Map<string, { total: number; front: number; back: number }>();
  for (const b of billings) {
    const m = monthOf(b.paid_on);
    if (!m || !isRevenue(b)) continue;
    const cur = cashByMonth.get(m) ?? { total: 0, front: 0, back: 0 };
    const amt = Math.max(0, num(b.amount_paid) - num(b.passthrough_amount));
    cur.total += amt;
    if (b.revenue_segment === "front_end") cur.front += amt;
    else if (b.revenue_segment === "back_end") cur.back += amt;
    cashByMonth.set(m, cur);
  }

  const newMrrByMonth = new Map<string, number>();
  for (const c of clients) {
    const m = monthOf(c.date_signed);
    if (!m) continue;
    newMrrByMonth.set(m, (newMrrByMonth.get(m) ?? 0) + num(c.mrr));
  }
  const lostMrrByMonth = new Map<string, number>();
  for (const m of monthsList) {
    const deps = computeDeparturesForMonth(clients, statusHistory, m);
    lostMrrByMonth.set(
      m,
      deps.reduce((s, d) => s + d.mrr, 0),
    );
  }

  const mrrEndByMonth = new Map<string, number>();
  let running = currentActiveMrr;
  for (let i = monthsList.length - 1; i >= 0; i--) {
    const m = monthsList[i];
    const snap = activeMrrFromSnapshots(snapshots, m);
    const isCurrent = m === currentMonth(now);
    if (snap != null && !isCurrent) {
      mrrEndByMonth.set(m, snap);
      running = snap;
    } else {
      mrrEndByMonth.set(m, Math.max(0, running));
    }
    const prior = addMonths(m, -1);
    const { expansion_mrr, contraction_mrr } = expansionContractionFromSnapshots(
      snapshots,
      prior,
      m,
    );
    const net =
      (newMrrByMonth.get(m) ?? 0) +
      expansion_mrr -
      contraction_mrr -
      (lostMrrByMonth.get(m) ?? 0);
    running = running - net;
  }

  return monthsList.map((m) => {
    const cash = cashByMonth.get(m) ?? { total: 0, front: 0, back: 0 };
    const fin = financeByMonth.get(m) ?? {};
    const marketing_spend = typeof fin.marketing_spend === "number" ? fin.marketing_spend : null;
    const operating_expenses = typeof fin.operating_expenses === "number" ? fin.operating_expenses : null;
    const closes =
      typeof signedClosesByMonth[m] === "number"
        ? signedClosesByMonth[m]
        : (newClientsByMonthCount.get(m) ?? 0);
    const cac = marketing_spend != null && closes > 0 ? marketing_spend / closes : null;
    const roas = marketing_spend != null && marketing_spend > 0 ? cash.front / marketing_spend : null;
    const operating_profit = operating_expenses != null ? cash.total - operating_expenses : null;
    return {
      month: m,
      cash_collected: cash.total,
      new_cash: cash.front,
      recurring_cash: cash.back,
      mrr_end: mrrEndByMonth.get(m) ?? 0,
      marketing_spend,
      operating_expenses,
      cac,
      roas,
      operating_profit,
    };
  });
}

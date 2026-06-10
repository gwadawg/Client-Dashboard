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

export type BusinessInput = {
  clients: BusinessClient[];
  statusHistory: StatusHistoryRow[];
  billings: BusinessBilling[];
  /** Imported / manual company-wide inputs (marketing spend, expenses, cash …). */
  businessMetrics?: BusinessMetricRow[];
  /** Target month, "YYYY-MM". Defaults to the current calendar month. */
  month?: string;
  /** Number of trailing months (including target) for the trend series. */
  trendMonths?: number;
  /** Reference "now" for tenure / contract-ending windows. Defaults to new Date(). */
  now?: Date;
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
  // Reconstructed MRR at the start of the target month (approximate until
  // client_monthly_snapshots accrue). Used as the churn-rate denominator.
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
};

export type BusinessMetrics = {
  month: string;
  headline: Headline;
  revenue: Revenue;
  mrrBridge: MrrBridge;
  churn: Churn;
  portfolio: Portfolio;
  unitEconomics: UnitEconomics;
  trend: TrendPoint[];
};

// ── Date helpers (YYYY-MM bucketing, timezone-safe) ───────────────────────────

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
  // Both "2026-06-03" and "2026-06-03T12:00:00Z" start with YYYY-MM-DD.
  const m = value.slice(0, 7);
  return /^\d{4}-\d{2}$/.test(m) ? m : null;
}

/** Step a YYYY-MM back by n months. */
function addMonths(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${base.getUTCFullYear()}-${String(base.getUTCMonth() + 1).padStart(2, "0")}`;
}

function num(v: number | null | undefined): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function pct(part: number, whole: number): number | null {
  if (!whole) return null;
  return (part / whole) * 100;
}

/** A billing counts as revenue unless it is a passthrough (ad-spend reimbursement). */
function isRevenue(b: BusinessBilling): boolean {
  return b.revenue_type !== "passthrough";
}

/** Collected cash on a billing in a given month (dated by paid_on). */
function collectedInMonth(b: BusinessBilling, month: string): number {
  if (!isRevenue(b)) return 0;
  if (monthOf(b.paid_on) !== month) return 0;
  return num(b.amount_paid);
}

// ── Engine ────────────────────────────────────────────────────────────────────

export function computeBusinessMetrics(input: BusinessInput): BusinessMetrics {
  const now = input.now ?? new Date();
  const month = input.month ?? currentMonth(now);
  const trendMonths = input.trendMonths ?? 12;
  const { clients, statusHistory, billings } = input;

  // Imported / manual inputs bucketed as month -> key -> value.
  const financeByMonth = bucketBusinessMetrics(input.businessMetrics ?? []);
  const finance = financeByMonth.get(month) ?? {};

  const clientById = new Map(clients.map((c) => [c.id, c]));

  // ── Current portfolio snapshot (as-of now) ────────────────────────────────
  const activeClients = clients.filter((c) => c.lifecycle_status === ACTIVE);
  const active_mrr = activeClients.reduce((s, c) => s + num(c.mrr), 0);
  const active_clients = activeClients.length;
  const arpa = active_clients ? active_mrr / active_clients : 0;

  // ── MRR movement for the target month ─────────────────────────────────────
  const new_mrr = clients
    .filter((c) => monthOf(c.date_signed) === month)
    .reduce((s, c) => s + num(c.mrr), 0);

  const churnRowsThisMonth = statusHistory.filter(
    (h) => DEPARTURE_STATUSES.has(h.new_status) && monthOf(h.changed_at) === month,
  );
  const lost_mrr = churnRowsThisMonth.reduce((s, h) => s + num(h.mrr_at_change), 0);

  // Expansion / contraction need month-over-month MRR deltas on retained clients,
  // which require client_monthly_snapshots. Best-effort 0 until those accrue.
  const expansion_mrr = 0;
  const contraction_mrr = 0;

  const net_new_mrr = new_mrr + expansion_mrr - contraction_mrr - lost_mrr;

  // Reconstructed start-of-month MRR. For the current month, end-of-month MRR is
  // the live active_mrr, so start = end - net movement. (Approximate for past
  // months; exact once snapshots exist.)
  const start_mrr = Math.max(0, active_mrr - net_new_mrr);

  // ── Revenue & cash (cash-collected basis) ─────────────────────────────────
  let new_cash = 0;
  let recurring_cash = 0;
  let total_cash = 0;
  let net_of_fees = 0;
  const byType = new Map<string, number>();
  const byLeadSource = new Map<string, number>();

  for (const b of billings) {
    const collected = collectedInMonth(b, month);
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

  // New-logo cash cross-check: each client's first-ever paid billing, counted
  // when that first payment lands in the target month. Tagging-independent.
  const new_logo_cash = computeNewLogoCash(billings, month);

  // Running AR (all-time, not month-scoped) from unsettled billings.
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
  const new_clients_signed = clients.filter((c) => monthOf(c.date_signed) === month).length;
  const churned_count = churnRowsThisMonth.length;
  // Active clients at month start ≈ now − signed-this-month + churned-this-month.
  const active_at_start = Math.max(0, active_clients - new_clients_signed + churned_count);

  const churned_clients: ChurnedClient[] = churnRowsThisMonth.map((h) => ({
    client_id: h.client_id,
    name: clientById.get(h.client_id)?.name ?? "Unknown",
    mrr: num(h.mrr_at_change),
    reason_code: h.reason_code ?? null,
    note: h.note ?? null,
    departure_status: h.new_status,
  }));

  const reasonAgg = new Map<string, { count: number; lost_mrr: number }>();
  for (const h of churnRowsThisMonth) {
    const code = h.reason_code ?? "unknown";
    const cur = reasonAgg.get(code) ?? { count: 0, lost_mrr: 0 };
    cur.count += 1;
    cur.lost_mrr += num(h.mrr_at_change);
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

  // ── Portfolio & risk ──────────────────────────────────────────────────────
  const portfolio = computePortfolio(clients, activeClients, active_mrr, month, now);

  // ── Headline rollup ───────────────────────────────────────────────────────
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
    end_mrr: active_mrr,
  };

  const unitEconomics = computeUnitEconomics({
    finance,
    active_mrr,
    arpa,
    avg_tenure_months: churn.avg_tenure_months,
    new_clients_signed,
    new_cash,
    total_cash,
    start_mrr,
  });

  const trend = computeTrend({
    clients,
    statusHistory,
    billings,
    financeByMonth,
    endMonth: month,
    months: trendMonths,
    currentActiveMrr: active_mrr,
  });

  return { month, headline, revenue, mrrBridge, churn, portfolio, unitEconomics, trend };
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
  new_clients_signed: number;
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

  // Acquisition efficiency.
  const cac =
    marketing_spend != null && args.new_clients_signed > 0
      ? marketing_spend / args.new_clients_signed
      : null;

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

/** Sum of each client's first-ever paid billing whose payment lands in `month`. */
function computeNewLogoCash(billings: BusinessBilling[], month: string): number {
  // Earliest paid (revenue) billing per client.
  const firstPaid = new Map<string, BusinessBilling>();
  for (const b of billings) {
    if (!isRevenue(b) || !b.paid_on) continue;
    const cur = firstPaid.get(b.client_id);
    if (!cur || b.paid_on < (cur.paid_on as string)) firstPaid.set(b.client_id, b);
  }
  let total = 0;
  for (const b of firstPaid.values()) {
    if (monthOf(b.paid_on) === month) total += num(b.amount_paid);
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
  month: string,
  now: Date,
): Portfolio {
  const lifecycleMap = new Map<string, number>();
  for (const c of clients) {
    const s = c.lifecycle_status ?? "unknown";
    lifecycleMap.set(s, (lifecycleMap.get(s) ?? 0) + 1);
  }
  // Stable, human-meaningful lifecycle ordering.
  const order = ["new_account", "onboarding", "active", "paused", "off_boarding", "churned"];
  const lifecycle: LifecycleBucket[] = Array.from(lifecycleMap.entries())
    .map(([status, count]) => ({ status, count }))
    .sort((a, b) => {
      const ai = order.indexOf(a.status);
      const bi = order.indexOf(b.status);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });

  const new_clients_signed = clients.filter((c) => monthOf(c.date_signed) === month).length;

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
 * Trailing month-by-month series. Cash figures are exact (from paid billings);
 * MRR is reconstructed by walking backward from the live active MRR using each
 * month's net movement (new − lost), so the line is approximate until real
 * client_monthly_snapshots exist.
 */
function computeTrend(args: {
  clients: BusinessClient[];
  statusHistory: StatusHistoryRow[];
  billings: BusinessBilling[];
  financeByMonth: Map<string, Record<string, number>>;
  endMonth: string;
  months: number;
  currentActiveMrr: number;
}): TrendPoint[] {
  const { clients, statusHistory, billings, financeByMonth, endMonth, months, currentActiveMrr } = args;

  const monthsList: string[] = [];
  for (let i = months - 1; i >= 0; i--) monthsList.push(addMonths(endMonth, -i));

  // New clients signed per month (for per-month CAC).
  const newClientsByMonthCount = new Map<string, number>();
  for (const c of clients) {
    const m = monthOf(c.date_signed);
    if (!m) continue;
    newClientsByMonthCount.set(m, (newClientsByMonthCount.get(m) ?? 0) + 1);
  }

  // Per-month cash + movement aggregation.
  const cashByMonth = new Map<string, { total: number; front: number; back: number }>();
  for (const b of billings) {
    const m = monthOf(b.paid_on);
    if (!m || !isRevenue(b)) continue;
    const cur = cashByMonth.get(m) ?? { total: 0, front: 0, back: 0 };
    const amt = num(b.amount_paid);
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
  for (const h of statusHistory) {
    if (!DEPARTURE_STATUSES.has(h.new_status)) continue;
    const m = monthOf(h.changed_at);
    if (!m) continue;
    lostMrrByMonth.set(m, (lostMrrByMonth.get(m) ?? 0) + num(h.mrr_at_change));
  }

  // Reconstruct end-of-month MRR backward from the latest month (= live MRR).
  const mrrEndByMonth = new Map<string, number>();
  let running = currentActiveMrr;
  for (let i = monthsList.length - 1; i >= 0; i--) {
    const m = monthsList[i];
    mrrEndByMonth.set(m, Math.max(0, running));
    const net = (newMrrByMonth.get(m) ?? 0) - (lostMrrByMonth.get(m) ?? 0);
    running = running - net; // step to previous month's end
  }

  return monthsList.map((m) => {
    const cash = cashByMonth.get(m) ?? { total: 0, front: 0, back: 0 };
    const fin = financeByMonth.get(m) ?? {};
    const marketing_spend = typeof fin.marketing_spend === "number" ? fin.marketing_spend : null;
    const operating_expenses = typeof fin.operating_expenses === "number" ? fin.operating_expenses : null;
    const newClients = newClientsByMonthCount.get(m) ?? 0;
    const cac = marketing_spend != null && newClients > 0 ? marketing_spend / newClients : null;
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

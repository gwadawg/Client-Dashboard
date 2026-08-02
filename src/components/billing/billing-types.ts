export type Billing = {
  id: string;
  client_id: string;
  billed_on: string;
  due_date: string | null;
  period_start: string | null;
  period_end: string | null;
  amount: number;
  base_amount: number | null;
  performance_amount: number | null;
  late_fee: number | null;
  discount: number | null;
  amount_paid: number | null;
  status: string;
  paid_on: string | null;
  method: string | null;
  invoice_ref: string | null;
  note: string | null;
  revenue_type?: string | null;
  revenue_segment?: string | null;
  lead_source?: string | null;
  term_months?: number | null;
  processing_fee?: number | null;
  passthrough_amount?: number | null;
  stripe_invoice_id?: string | null;
  stripe_payment_intent_id?: string | null;
  is_first_payment?: boolean | null;
  is_extension?: boolean | null;
  created_at: string;
};

export type ClientBilling = {
  id: string;
  name: string;
  reporting_type?: string | null;
  is_live: boolean | null;
  lifecycle_status: string | null;
  billing_paused: boolean | null;
  billing_paused_at: string | null;
  billing_paused_note: string | null;
  billing_model: string | null;
  pay_per_show: number | null;
  pay_per_bailed: number | null;
  mrr: number | null;
  billing_type: string | null;
  billing_day: number | null;
  launch_date: string | null;
  date_signed: string | null;
  contract_end_date: string | null;
  contract_term_months?: number | null;
  source?: string | null;
  performance_terms: string | null;
  share_token?: string | null;
  next_billing_date: string | null;
  next_billing_status: "upcoming" | "due_soon" | "overdue" | null;
  suggested_next_date: string | null;
  last_billing: Billing | null;
  billings: Billing[];
};

export type BillingCycle = {
  id: string;
  client_id: string;
  period_start: string;
  period_end: string;
  base_amount: number;
  show_count: number;
  live_transfer_count: number;
  bailed_count: number;
  pay_per_show: number;
  pay_per_bailed: number;
  performance_amount: number;
  discount: number;
  status: string;
  effective_status: string;
  report_sent_at: string | null;
  objection_deadline_at: string | null;
  dispute_note: string | null;
  billing_id: string | null;
  note: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  client: ClientBilling | null;
};

export type RevenueTagOpts = {
  revenue_type?: string;
  revenue_segment?: string;
  term_months?: number;
  processing_fee?: number;
  method?: string;
  note?: string;
  stripe_invoice_id?: string;
};

export type RecordOpts = {
  base: number;
  performance: number;
  lateFee: number;
  discount?: number;
  billedOn: string;
  dueDate: string;
  method?: string;
  note?: string;
  markPaid?: boolean;
} & RevenueTagOpts;

export type ScheduleOpts = {
  base: number;
  performance: number;
  discount: number;
  dueDate: string;
  note?: string;
  markPaid?: boolean;
  /** $0 paid free/pause month — advances cadence without collecting cash. */
  is_extension?: boolean;
  periodStart?: string;
  periodEnd?: string;
  method?: string;
} & RevenueTagOpts;

export type PendingSetupRow = { kind: "pending_setup"; client: ClientBilling };
export type CadenceDueRow = {
  kind: "cadence_due";
  client: ClientBilling;
  yearMonth: string;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
};
export type RecordedRow = { kind: "recorded"; client: ClientBilling; billing: Billing };
export type PerfCycleRow = { kind: "perf_cycle"; client: ClientBilling; cycle: BillingCycle; dueDate: string };
export type WorkRow = PendingSetupRow | CadenceDueRow | RecordedRow | PerfCycleRow;

export const REVENUE_TYPE_OPTIONS = [
  { value: "mrr", label: "MRR / retainer" },
  { value: "pif", label: "PIF" },
  { value: "performance", label: "Performance" },
  { value: "upsell", label: "Upsell" },
  { value: "one_off", label: "One-off" },
  { value: "passthrough", label: "Passthrough" },
] as const;

export const REVENUE_SEGMENT_OPTIONS = [
  { value: "front_end", label: "New cash" },
  { value: "back_end", label: "Recurring" },
] as const;

export const METHOD_OPTIONS = [
  { value: "stripe", label: "Stripe" },
  { value: "card", label: "Card" },
  { value: "ach", label: "ACH" },
  { value: "wire", label: "Wire" },
  { value: "manual", label: "Manual" },
] as const;

export function defaultRevenueType(billingType: string | null | undefined): string {
  if (billingType === "pif") return "pif";
  if (billingType === "monthly" || billingType === "pif_monthly") return "mrr";
  return "mrr";
}

export function revenueTypeLabel(t: string | null | undefined): string {
  if (!t) return "—";
  return REVENUE_TYPE_OPTIONS.find((o) => o.value === t)?.label ?? t;
}

export function revenueSegmentLabel(s: string | null | undefined): string {
  if (s === "front_end") return "new";
  if (s === "back_end") return "recurring";
  return "";
}

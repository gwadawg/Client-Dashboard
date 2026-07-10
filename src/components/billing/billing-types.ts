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
  next_billing_date: string | null;
  next_billing_status: "upcoming" | "due_soon" | "overdue" | null;
  suggested_next_date: string | null;
  last_billing: Billing | null;
  billings: Billing[];
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
  method?: string;
} & RevenueTagOpts;

export type SchedulePromptRow = { kind: "schedule_prompt"; client: ClientBilling };
export type RecordedRow = { kind: "recorded"; client: ClientBilling; billing: Billing };
export type WorkRow = SchedulePromptRow | RecordedRow;

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

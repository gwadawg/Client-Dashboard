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
  performance_terms: string | null;
  next_billing_date: string | null;
  next_billing_status: "upcoming" | "due_soon" | "overdue" | null;
  suggested_next_date: string | null;
  last_billing: Billing | null;
  billings: Billing[];
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
};

export type ScheduleOpts = {
  base: number;
  performance: number;
  discount: number;
  dueDate: string;
  note?: string;
  markPaid?: boolean;
  method?: string;
};

export type SchedulePromptRow = { kind: "schedule_prompt"; client: ClientBilling };
export type RecordedRow = { kind: "recorded"; client: ClientBilling; billing: Billing };
export type WorkRow = SchedulePromptRow | RecordedRow;

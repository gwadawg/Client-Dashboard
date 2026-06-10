// Structured client context package for LLM analysis and unified timelines.

export type ClientActivityRow = {
  client_id: string;
  source_id: string;
  activity_type: string;
  occurred_at: string;
  subtype: string | null;
  summary: string | null;
  source_table: string;
};

export type BillingSummary = {
  mrr: number | null;
  last_billing_on: string | null;
  last_billing_status: string | null;
  outstanding_balance: number;
  billing_count: number;
};

export type ClientContextPackage = {
  profile: Record<string, unknown>;
  lifecycle: Record<string, unknown>[];
  calls: Record<string, unknown>[];
  notes: Record<string, unknown>[];
  billings: Record<string, unknown>[];
  billing_summary: BillingSummary;
  actions: Record<string, unknown>[];
  attributes: Record<string, unknown>[];
  activity_timeline: ClientActivityRow[];
  health_latest: Record<string, unknown> | null;
  churn: {
    churned_at: string | null;
    lifecycle_status: string | null;
    latest_churn_reason: string | null;
    latest_churn_note: string | null;
  };
};

export function buildBillingSummary(
  billings: Array<{ billed_on: string; status: string | null; amount: number; amount_paid?: number | null }>,
  mrr: number | null,
): BillingSummary {
  let outstanding = 0;
  for (const b of billings) {
    if (b.status === 'voided' || b.status === 'paid' || b.status === 'refunded') continue;
    const due = Number(b.amount) || 0;
    const paid = Number(b.amount_paid) || 0;
    outstanding += Math.max(0, due - paid);
  }
  const last = billings[0];
  return {
    mrr,
    last_billing_on: last?.billed_on ?? null,
    last_billing_status: last?.status ?? null,
    outstanding_balance: outstanding,
    billing_count: billings.length,
  };
}

export function extractChurnContext(
  profile: { churned_at?: string | null; lifecycle_status?: string | null },
  lifecycle: Array<{ new_status: string; reason_code?: string | null; note?: string | null }>,
) {
  const churnRow = lifecycle.find(h => h.new_status === 'churned');
  return {
    churned_at: profile.churned_at ?? null,
    lifecycle_status: profile.lifecycle_status ?? null,
    latest_churn_reason: churnRow?.reason_code ?? null,
    latest_churn_note: churnRow?.note ?? null,
  };
}

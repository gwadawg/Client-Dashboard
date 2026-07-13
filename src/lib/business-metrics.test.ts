import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computeBusinessMetrics,
  computeDeparturesForMonth,
  type BusinessBilling,
  type BusinessClient,
  type ClientMonthlySnapshot,
  type StatusHistoryRow,
} from "./business-metrics";

function client(partial: Partial<BusinessClient> & { id: string; name: string }): BusinessClient {
  return {
    mrr: 1000,
    lifecycle_status: "active",
    date_signed: null,
    churned_at: null,
    launch_date: null,
    offer: "RM",
    reporting_type: null,
    contract_end_date: null,
    ...partial,
  };
}

describe("computeDeparturesForMonth", () => {
  it("dedupes off_boarding then churned into one Lost MRR event", () => {
    const clients = [
      client({
        id: "c1",
        name: "Acme",
        mrr: 2000,
        lifecycle_status: "churned",
        churned_at: "2026-03-20",
      }),
    ];
    const history: StatusHistoryRow[] = [
      {
        client_id: "c1",
        previous_status: "active",
        new_status: "off_boarding",
        reason_code: "price",
        note: null,
        mrr_at_change: 2000,
        changed_at: "2026-03-10T12:00:00.000Z",
      },
      {
        client_id: "c1",
        previous_status: "off_boarding",
        new_status: "churned",
        reason_code: "price",
        note: "final",
        mrr_at_change: 2000,
        changed_at: "2026-03-20T12:00:00.000Z",
      },
    ];
    const deps = computeDeparturesForMonth(clients, history, "2026-03");
    assert.equal(deps.length, 1);
    assert.equal(deps[0].mrr, 2000);
    assert.equal(deps[0].departure_status, "churned");
  });

  it("buckets by churned_at when set (backdated leave)", () => {
    const clients = [
      client({
        id: "c1",
        name: "Acme",
        lifecycle_status: "churned",
        churned_at: "2026-02-15",
      }),
    ];
    const history: StatusHistoryRow[] = [
      {
        client_id: "c1",
        previous_status: "active",
        new_status: "churned",
        reason_code: null,
        note: null,
        mrr_at_change: 1500,
        changed_at: "2026-03-05T12:00:00.000Z",
      },
    ];
    assert.equal(computeDeparturesForMonth(clients, history, "2026-02").length, 1);
    assert.equal(computeDeparturesForMonth(clients, history, "2026-03").length, 0);
  });
});

describe("computeBusinessMetrics", () => {
  it("subtracts passthrough_amount from cash and ignores full passthrough type", () => {
    const billings: BusinessBilling[] = [
      {
        client_id: "c1",
        billed_on: "2026-03-01",
        due_date: "2026-03-01",
        paid_on: "2026-03-05",
        amount: 5000,
        amount_paid: 5000,
        status: "paid",
        revenue_type: "mrr",
        revenue_segment: "back_end",
        lead_source: "Meta",
        processing_fee: 0,
        passthrough_amount: 1000,
      },
      {
        client_id: "c2",
        billed_on: "2026-03-01",
        due_date: "2026-03-01",
        paid_on: "2026-03-05",
        amount: 800,
        amount_paid: 800,
        status: "paid",
        revenue_type: "passthrough",
        revenue_segment: "back_end",
        lead_source: null,
        processing_fee: 0,
        passthrough_amount: 0,
      },
    ];
    const m = computeBusinessMetrics({
      clients: [client({ id: "c1", name: "A" }), client({ id: "c2", name: "B" })],
      statusHistory: [],
      billings,
      month: "2026-03",
      now: new Date("2026-03-15T12:00:00Z"),
    });
    assert.equal(m.revenue.total_cash, 4000);
  });

  it("uses signed closes for CAC, not roster date_signed count", () => {
    const m = computeBusinessMetrics({
      clients: [
        client({ id: "c1", name: "A", date_signed: "2026-03-01" }),
        client({ id: "c2", name: "B", date_signed: "2026-03-02" }),
      ],
      statusHistory: [],
      billings: [],
      businessMetrics: [
        { metric_key: "marketing_spend", period_date: "2026-03-01", value_numeric: 9000 },
      ],
      signedClosesByMonth: { "2026-03": 3 },
      month: "2026-03",
      now: new Date("2026-03-15T12:00:00Z"),
    });
    assert.equal(m.unitEconomics.cac_closes, 3);
    assert.equal(m.unitEconomics.cac, 3000);
    assert.equal(m.portfolio.new_clients_signed, 2);
  });

  it("uses prior-month snapshot for start MRR and expansion", () => {
    const clients = [
      client({ id: "c1", name: "Keep", mrr: 1200, lifecycle_status: "active" }),
      client({ id: "c2", name: "New", mrr: 800, lifecycle_status: "active", date_signed: "2026-03-01" }),
    ];
    const snapshots: ClientMonthlySnapshot[] = [
      {
        client_id: "c1",
        period_month: "2026-02-01",
        lifecycle_status: "active",
        mrr: 1000,
        is_active: true,
      },
      {
        client_id: "c1",
        period_month: "2026-03-01",
        lifecycle_status: "active",
        mrr: 1200,
        is_active: true,
      },
      {
        client_id: "c2",
        period_month: "2026-03-01",
        lifecycle_status: "active",
        mrr: 800,
        is_active: true,
      },
    ];
    const m = computeBusinessMetrics({
      clients,
      statusHistory: [],
      billings: [],
      snapshots,
      month: "2026-03",
      // Treat as historical month so end MRR comes from March snapshot.
      now: new Date("2026-04-15T12:00:00Z"),
    });
    assert.equal(m.headline.start_mrr, 1000);
    assert.equal(m.mrrBridge.expansion_mrr, 200);
    assert.equal(m.mrrBridge.end_mrr, 2000);
  });
});

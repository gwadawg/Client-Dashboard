import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyExpenseRules,
  expenseDedupeHash,
  mapLabelToBucket,
  normalizeMerchant,
  rollupExpensesForMonth,
  SEED_EXPENSE_RULES,
  type ExpenseCategoryRule,
} from "./expenses";

function asRules(): ExpenseCategoryRule[] {
  return SEED_EXPENSE_RULES.map((r, i) => ({
    ...r,
    id: `seed-${i}`,
    active: true,
  }));
}

describe("normalizeMerchant", () => {
  it("lowercases and strips noise", () => {
    assert.ok(normalizeMerchant("  Meta Platforms, Inc.  ").includes("meta platforms"));
  });
});

describe("mapLabelToBucket", () => {
  it("maps common labels", () => {
    assert.equal(mapLabelToBucket("CAC"), "cac");
    assert.equal(mapLabelToBucket("COGS"), "fulfillment");
    assert.equal(mapLabelToBucket("overhead"), "overhead");
    assert.equal(mapLabelToBucket("personal"), "personal");
  });
});

describe("applyExpenseRules", () => {
  it("matches GoHighLevel to fulfillment", () => {
    const m = applyExpenseRules({ merchant_raw: "GOHIGHLEVEL *SUB", amount: 297 }, asRules());
    assert.equal(m.ceo_bucket, "fulfillment");
    assert.equal(m.categorized_by, "rule");
  });

  it("matches Meta to cac", () => {
    const m = applyExpenseRules({ merchant_raw: "META PLATFORMS INC", amount: 500 }, asRules());
    assert.equal(m.ceo_bucket, "cac");
  });

  it("excludes card payment thank you", () => {
    const m = applyExpenseRules({ merchant_raw: "PAYMENT THANK YOU - CHASE", amount: 2000 }, asRules());
    assert.equal(m.exclude_from_pnl, true);
  });
});

describe("rollupExpensesForMonth", () => {
  it("sums P&L buckets and excludes personal", () => {
    const r = rollupExpensesForMonth(
      [
        { occurred_on: "2026-03-01", amount: 100, ceo_bucket: "cac", exclude_from_pnl: false },
        { occurred_on: "2026-03-02", amount: 50, ceo_bucket: "fulfillment", exclude_from_pnl: false },
        { occurred_on: "2026-03-03", amount: 25, ceo_bucket: "overhead", exclude_from_pnl: false },
        { occurred_on: "2026-03-04", amount: 40, ceo_bucket: "personal", exclude_from_pnl: true },
        { occurred_on: "2026-04-01", amount: 999, ceo_bucket: "cac", exclude_from_pnl: false },
      ],
      "2026-03",
    );
    assert.equal(r.marketing_spend, 100);
    assert.equal(r.delivery_costs, 50);
    assert.equal(r.operating_expenses, 175);
    assert.equal(r.transaction_count, 4);
  });
});

describe("expenseDedupeHash", () => {
  it("is stable for same inputs", () => {
    const a = expenseDedupeHash({
      account_id: "x",
      occurred_on: "2026-01-01",
      amount: 10,
      merchant_raw: "ClickUp",
    });
    const b = expenseDedupeHash({
      account_id: "x",
      occurred_on: "2026-01-01",
      amount: 10,
      merchant_raw: "ClickUp",
    });
    assert.equal(a, b);
  });
});

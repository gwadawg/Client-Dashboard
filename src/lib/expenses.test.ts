import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  amexExternalId,
  applyExpenseRules,
  chaseExternalId,
  cleanBankMerchant,
  expenseDedupeHash,
  isAmexActivityCsv,
  isSoftExpenseDuplicate,
  mapLabelToBucket,
  normalizeMerchant,
  rollupExpensesForMonth,
  SEED_EXPENSE_RULES,
  suggestRuleNeedle,
  type ExpenseCategoryRule,
} from "./expenses";

function asRules(): ExpenseCategoryRule[] {
  return SEED_EXPENSE_RULES.map((r, i) => ({
    ...r,
    id: `seed-${i}`,
    active: true,
    fulfillment_line: r.fulfillment_line ?? null,
  }));
}

describe("suggestRuleNeedle", () => {
  it("uses make.com for WWW.MAKE.COM card descriptors", () => {
    assert.equal(suggestRuleNeedle("WWW.MAKE.COM WWW.MAKE.COM NY"), "make.com");
  });

  it("does not collapse makeugc into make.com", () => {
    assert.equal(suggestRuleNeedle("MAKEUGC.AI LONDON"), "makeugc.ai");
  });
});

describe("amex helpers", () => {
  it("detects Amex activity headers", () => {
    assert.equal(isAmexActivityCsv(["Date", "Receipt", "Description", "Amount"]), true);
    assert.equal(isAmexActivityCsv(["Posting Date", "Details", "Description", "Amount"]), false);
  });

  it("builds stable amex external ids", () => {
    const id = amexExternalId({
      occurred_on: "2026-01-08",
      amount: 57,
      description: "BT*CLICKUP          SAN DIEGO           CA",
    });
    assert.match(id, /^amex:2026-01-08:57\.00:/);
  });

  it("soft-matches sheet ClickUp vs Amex ClickUp within date window", () => {
    assert.equal(
      isSoftExpenseDuplicate(
        { occurred_on: "2026-01-08", amount: 57, merchant_raw: "BT*CLICKUP SAN DIEGO CA" },
        { occurred_on: "2026-01-07", amount: 57, merchant_raw: "ClickUp" },
        3,
      ),
      true,
    );
    assert.equal(
      isSoftExpenseDuplicate(
        { occurred_on: "2026-01-08", amount: 57, merchant_raw: "BT*CLICKUP SAN DIEGO CA" },
        { occurred_on: "2026-01-07", amount: 99, merchant_raw: "ClickUp" },
        3,
      ),
      false,
    );
  });

  it("soft-matches monthly sheet rollups by month + merchant even when amounts differ", () => {
    assert.equal(
      isSoftExpenseDuplicate(
        { occurred_on: "2026-01-08", amount: 57, merchant_raw: "BT*CLICKUP SAN DIEGO CA" },
        {
          occurred_on: "2026-01-01",
          amount: 71.71,
          merchant_raw: "Clickup",
          account_name: "WM Company Books",
        },
        3,
      ),
      true,
    );
  });
});

describe("normalizeMerchant", () => {
  it("lowercases and strips noise", () => {
    assert.ok(normalizeMerchant("  Meta Platforms, Inc.  ").includes("meta platforms"));
  });
});

describe("mapLabelToBucket", () => {
  it("maps WM sheet Type labels", () => {
    assert.equal(mapLabelToBucket("CAC"), "cac");
    assert.equal(mapLabelToBucket("COGS"), "fulfillment");
    assert.equal(mapLabelToBucket("overhead"), "overhead");
    assert.equal(mapLabelToBucket("Passthrough"), "passthrough");
    assert.equal(mapLabelToBucket("personal"), "personal");
  });

  it("does not treat Category=Software as a CEO bucket", () => {
    assert.equal(mapLabelToBucket("Software"), null);
    assert.equal(mapLabelToBucket("Payroll"), null);
  });
});

describe("applyExpenseRules from labeled sheet", () => {
  it("matches High Level to fulfillment", () => {
    const m = applyExpenseRules({ merchant_raw: "High Level", amount: 797 }, asRules());
    assert.equal(m.ceo_bucket, "fulfillment");
    assert.equal(m.fulfillment_line, "delivery_tech");
    assert.equal(m.categorized_by, "rule");
  });

  it("tags Closebot as call_center COGS line", () => {
    const m = applyExpenseRules({ merchant_raw: "Closebot", amount: 99 }, asRules());
    assert.equal(m.ceo_bucket, "fulfillment");
    assert.equal(m.fulfillment_line, "call_center");
  });

  it("matches FB to cac and FB Recruit to overhead", () => {
    assert.equal(applyExpenseRules({ merchant_raw: "FB", amount: 50 }, asRules()).ceo_bucket, "cac");
    assert.equal(
      applyExpenseRules({ merchant_raw: "FB - Recruit", amount: 50 }, asRules()).ceo_bucket,
      "overhead",
    );
  });

  it("matches ClickUp and Notion to overhead", () => {
    assert.equal(applyExpenseRules({ merchant_raw: "Clickup", amount: 78 }, asRules()).ceo_bucket, "overhead");
    assert.equal(applyExpenseRules({ merchant_raw: "Notion", amount: 30 }, asRules()).ceo_bucket, "overhead");
  });

  it("matches Sendblue to passthrough", () => {
    const m = applyExpenseRules({ merchant_raw: "Sendblue", amount: 500 }, asRules());
    assert.equal(m.ceo_bucket, "passthrough");
    assert.equal(m.exclude_from_pnl, true);
  });

  it("matches GoHighLevel / Meta / card payment", () => {
    assert.equal(
      applyExpenseRules({ merchant_raw: "GOHIGHLEVEL *SUB", amount: 297 }, asRules()).ceo_bucket,
      "fulfillment",
    );
    assert.equal(
      applyExpenseRules({ merchant_raw: "META PLATFORMS INC", amount: 500 }, asRules()).ceo_bucket,
      "cac",
    );
    assert.equal(
      applyExpenseRules({ merchant_raw: "PAYMENT THANK YOU - CHASE", amount: 2000 }, asRules()).exclude_from_pnl,
      true,
    );
  });

  it("leaves large Wise ACH uncategorized; tiny Wise fees → overhead", () => {
    assert.equal(
      applyExpenseRules({ merchant_raw: "Wise Inc", amount: 100 }, asRules()).ceo_bucket,
      "uncategorized",
    );
    assert.equal(
      applyExpenseRules({ merchant_raw: "Wise Inc", amount: 2.5 }, asRules()).ceo_bucket,
      "overhead",
    );
  });

  it("tags Gabes Personal transfer as owner_draw excluded", () => {
    const m = applyExpenseRules(
      { merchant_raw: "Transfer to Gabes Personal", amount: 1000 },
      asRules(),
    );
    assert.equal(m.ceo_bucket, "owner_draw");
    assert.equal(m.exclude_from_pnl, true);
  });
});

describe("cleanBankMerchant / chaseExternalId", () => {
  it("extracts ORIG CO NAME and POS DEBIT merchants", () => {
    assert.equal(
      cleanBankMerchant("ORIG CO NAME:Wise Inc               ORIG ID:9453233521 DESC DATE:260709"),
      "Wise Inc",
    );
    assert.ok(
      cleanBankMerchant(
        "POS DEBIT                HIGHLEVEL INC.            +18887324197 TX",
      ).includes("HIGHLEVEL"),
    );
  });

  it("prefers TRN for external id and keeps same-day Wise distinct", () => {
    const a = chaseExternalId({
      occurred_on: "2026-07-10",
      amount: 100,
      description: "ORIG CO NAME:Wise Inc TRN: 111",
      rowIndex: 1,
    });
    const b = chaseExternalId({
      occurred_on: "2026-07-10",
      amount: 100,
      description: "ORIG CO NAME:Wise Inc TRN: 222",
      rowIndex: 2,
    });
    assert.equal(a, "chase:trn:111");
    assert.equal(b, "chase:trn:222");
    assert.notEqual(a, b);
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

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { monthKeyFromDate, uniqueMonthsFromDates } from "./expense-rollup";

describe("monthKeyFromDate", () => {
  it("parses dates and month keys", () => {
    assert.equal(monthKeyFromDate("2026-05-13"), "2026-05");
    assert.equal(monthKeyFromDate("2026-05"), "2026-05");
    assert.equal(monthKeyFromDate(null), null);
  });
});

describe("uniqueMonthsFromDates", () => {
  it("dedupes and sorts", () => {
    assert.deepEqual(
      uniqueMonthsFromDates(["2026-03-01", "2026-01-15", "2026-03-20", "2026-01"]),
      ["2026-01", "2026-03"],
    );
  });
});

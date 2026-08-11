import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  defaultBoardMode,
  formatPeriodLabel,
  periodAlignsWithMonthlyGoals,
} from "./board-mode";

describe("floor board date alignment", () => {
  it("defaults Today mode for today/yesterday presets", () => {
    assert.equal(defaultBoardMode("today"), "today");
    assert.equal(defaultBoardMode("yesterday"), "today");
    assert.equal(defaultBoardMode("this_week"), "period");
    assert.equal(defaultBoardMode("this_month"), "period");
  });

  it("aligns monthly goals only when range starts on the 1st of that month", () => {
    assert.equal(
      periodAlignsWithMonthlyGoals("2026-08-01", "2026-08-10").aligned,
      true,
    );
    assert.equal(
      periodAlignsWithMonthlyGoals("2026-08-01", "2026-08-31").aligned,
      true,
    );
    assert.equal(
      periodAlignsWithMonthlyGoals("2026-08-04", "2026-08-10").aligned,
      false,
    );
    assert.equal(
      periodAlignsWithMonthlyGoals("2026-07-01", "2026-08-10").aligned,
      false,
    );
  });

  it("formats a readable period label from preset + range", () => {
    const label = formatPeriodLabel("this_week", "2026-08-04", "2026-08-10");
    assert.match(label, /This Week/);
    assert.match(label, /2026-08-04/);
    assert.match(label, /2026-08-10/);
  });
});

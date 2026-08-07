import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildContactRateCurve, buildSpendLadder } from "./scale";
import { createDefaultState } from "./state";

describe("buildSpendLadder", () => {
  it("scales spend off Current budget and keeps rates", () => {
    const s = createDefaultState();
    const ladder = buildSpendLadder(s, [1, 2]);
    assert.equal(ladder.length, 2);
    assert.equal(ladder[0].spend, s.current.ad_spend);
    assert.equal(ladder[1].spend, s.current.ad_spend * 2);
    // Double budget, same CPL/rates → double deals.
    assert.ok(
      Math.abs(ladder[1].waizDeals - ladder[0].waizDeals * 2) < 1e-6,
    );
  });

  it("delta net grows with spend when Waiz economics are better", () => {
    const s = createDefaultState();
    const ladder = buildSpendLadder(s, [1, 3]);
    assert.ok(ladder[0].deltaNet > 0);
    assert.ok(ladder[1].deltaNet > ladder[0].deltaNet);
  });
});

describe("buildContactRateCurve", () => {
  it("cost per conversation falls as contact rate rises", () => {
    const pts = buildContactRateCurve(10_000, 200, 10, 40, 10);
    assert.equal(pts.length, 4);
    assert.ok(pts[0].costPerConversation! > pts[3].costPerConversation!);
    // 10% of 200 leads = 20 conversations → $500 each.
    assert.equal(pts[0].costPerConversation, 500);
  });

  it("returns null cost when no leads convert", () => {
    const pts = buildContactRateCurve(10_000, 0, 10, 20, 10);
    assert.equal(pts[0].costPerConversation, null);
  });
});

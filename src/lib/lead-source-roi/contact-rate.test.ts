import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeContactRatePct } from "./contact-rate";

describe("computeContactRatePct", () => {
  it("computes spoken / leads as percent", () => {
    assert.equal(computeContactRatePct(100, 20), 20);
    assert.equal(computeContactRatePct(200, 50), 25);
  });

  it("returns null for zero or invalid leads", () => {
    assert.equal(computeContactRatePct(0, 5), null);
    assert.equal(computeContactRatePct(-1, 5), null);
  });

  it("clamps over 100% when spoken exceeds leads", () => {
    assert.equal(computeContactRatePct(10, 15), 100);
  });
});

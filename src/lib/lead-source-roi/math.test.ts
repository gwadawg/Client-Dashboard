import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  resolveVolume,
  simulateSide,
  simulateCompare,
  applyWaizPack,
} from "./math";
import type { CompareState, SideInputs } from "./types";
import { DEFAULT_COMPARE_STATE } from "./config";

function side(over: Partial<SideInputs> = {}): SideInputs {
  return {
    ad_spend: 10_000,
    cpl: 100,
    leads: 0,
    driver: "cpl",
    contact_rate_pct: 20,
    close_rate_pct: 25,
    avg_commission: 4_000,
    program_fee: 2_000,
    ...over,
  };
}

describe("lead-source-roi math", () => {
  it("resolveVolume with driver=cpl derives leads from spend/cpl", () => {
    const v = resolveVolume(side({ ad_spend: 10_000, cpl: 100, driver: "cpl" }));
    assert.equal(v.leads, 100);
    assert.equal(v.cpl, 100);
  });

  it("resolveVolume with driver=leads derives cpl from spend/leads", () => {
    const v = resolveVolume(
      side({ ad_spend: 10_000, leads: 200, driver: "leads", cpl: 0 }),
    );
    assert.equal(v.leads, 200);
    assert.equal(v.cpl, 50);
  });

  it("resolveVolume guards zero divisor", () => {
    const v = resolveVolume(side({ ad_spend: 10_000, cpl: 0, driver: "cpl" }));
    assert.equal(v.leads, 0);
  });

  it("simulateSide: contact and close chain + ROI formulas", () => {
    // 100 leads, 20% contact = 20, 25% close = 5 deals
    // gross = 5 * 4000 = 20000; investment ad only = 10000
    const out = simulateSide(
      side({
        ad_spend: 10_000,
        cpl: 100,
        driver: "cpl",
        contact_rate_pct: 20,
        close_rate_pct: 25,
        avg_commission: 4_000,
        program_fee: 2_000,
      }),
      false,
    );
    assert.equal(out.leads, 100);
    assert.equal(out.contacts, 20);
    assert.equal(out.deals, 5);
    assert.equal(out.gross_commission, 20_000);
    assert.equal(out.investment, 10_000);
    assert.equal(out.net_commission, 10_000);
    assert.equal(out.roi_multiple, 2);
    assert.equal(out.roi_pct, 1);
    assert.equal(out.cost_per_conversation, 500);
  });

  it("simulateSide includes program fee when includeFees true", () => {
    const out = simulateSide(
      side({
        ad_spend: 10_000,
        cpl: 100,
        driver: "cpl",
        contact_rate_pct: 20,
        close_rate_pct: 25,
        avg_commission: 4_000,
        program_fee: 2_000,
      }),
      true,
    );
    assert.equal(out.investment, 12_000);
    assert.equal(out.net_commission, 8_000);
    assert.ok(out.cost_per_conversation_loaded != null);
    assert.equal(out.cost_per_conversation_loaded, 600); // 12000/20
  });

  it("simulateSide returns null ROI when investment is 0", () => {
    const out = simulateSide(
      side({ ad_spend: 0, cpl: 100, program_fee: 0 }),
      false,
    );
    assert.equal(out.roi_multiple, null);
    assert.equal(out.roi_pct, null);
  });

  it("applyWaizPack worst raises CPL and lowers rates", () => {
    const base = side({
      cpl: 55,
      contact_rate_pct: 32,
      close_rate_pct: 18,
      driver: "cpl",
    });
    const worst = applyWaizPack(base, "worst");
    assert.ok(worst.cpl >= base.cpl);
    assert.ok(worst.contact_rate_pct <= base.contact_rate_pct);
    assert.ok(worst.close_rate_pct <= base.close_rate_pct);
    assert.equal(worst.driver, "cpl");
  });

  it("simulateCompare: worst net <= base net <= best net for demo shape", () => {
    const state: CompareState = {
      ...DEFAULT_COMPARE_STATE,
      include_fees: false,
      link_spend: true,
    };
    const r = simulateCompare(state);
    assert.ok(r.waiz_worst.net_commission <= r.waiz.net_commission + 1e-9);
    assert.ok(r.waiz.net_commission <= r.waiz_best.net_commission + 1e-9);
    assert.equal(
      r.delta.net_commission,
      r.waiz.net_commission - r.current.net_commission,
    );
  });
});

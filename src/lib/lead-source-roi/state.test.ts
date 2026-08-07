import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createDefaultState,
  patchSide,
  setLinkSpend,
  setLinkCommission,
  setIncludeFees,
  encodeCompareState,
  decodeCompareState,
  normalizeSide,
} from "./state";
import { resolveVolume } from "./math";

describe("lead-source-roi state", () => {
  it("createDefaultState resolves volume on both sides", () => {
    const s = createDefaultState();
    const c = resolveVolume(s.current);
    assert.ok(c.leads > 0);
    assert.equal(s.link_spend, true);
    assert.equal(s.link_commission, false);
    assert.equal(s.include_fees, false);
  });

  it("default leaves Waiz commission independent of Current", () => {
    let s = createDefaultState();
    s = patchSide(s, "current", { avg_commission: 2_500 });
    s = patchSide(s, "waiz", { avg_commission: 6_500 });
    assert.equal(s.current.avg_commission, 2_500);
    assert.equal(s.waiz.avg_commission, 6_500);
  });

  it("patch current spend with link_spend mirrors to waiz", () => {
    let s = createDefaultState();
    s = patchSide(s, "current", { ad_spend: 20_000 });
    assert.equal(s.current.ad_spend, 20_000);
    assert.equal(s.waiz.ad_spend, 20_000);
  });

  it("unlinked spend does not mirror", () => {
    let s = setLinkSpend(createDefaultState(), false);
    s = patchSide(s, "current", { ad_spend: 15_000 });
    assert.equal(s.current.ad_spend, 15_000);
    assert.notEqual(s.waiz.ad_spend, 15_000);
  });

  it("editing cpl sets driver and recomputes leads", () => {
    let s = createDefaultState();
    s = patchSide(s, "current", { cpl: 50 });
    assert.equal(s.current.driver, "cpl");
    assert.equal(s.current.leads, s.current.ad_spend / 50);
  });

  it("editing leads sets driver and recomputes cpl", () => {
    let s = createDefaultState();
    s = patchSide(s, "current", { leads: 250 });
    assert.equal(s.current.driver, "leads");
    assert.equal(s.current.cpl, s.current.ad_spend / 250);
  });

  it("link_commission no longer syncs Waiz commission to Current", () => {
    let s = setLinkCommission(createDefaultState(), true);
    assert.equal(s.link_commission, false);
    s = patchSide(s, "current", { avg_commission: 6_000 });
    s = patchSide(s, "waiz", { avg_commission: 9_000 });
    assert.equal(s.current.avg_commission, 6_000);
    assert.equal(s.waiz.avg_commission, 9_000);
  });

  it("decode forces commission unlinked even when payload had lc true", () => {
    const payload = {
      v: 1,
      c: createDefaultState().current,
      w: { ...createDefaultState().waiz, avg_commission: 8_000 },
      ls: true,
      lc: true,
      f: false,
    };
    const enc = Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
    const dec = decodeCompareState(enc);
    assert.ok(dec);
    assert.equal(dec!.link_commission, false);
    assert.equal(dec!.waiz.avg_commission, 8_000);
  });

  it("encode/decode round-trips", () => {
    let s = createDefaultState();
    s = patchSide(s, "current", { ad_spend: 12_345, contact_rate_pct: 22 });
    s = setIncludeFees(s, true);
    const enc = encodeCompareState(s);
    const dec = decodeCompareState(enc);
    assert.ok(dec);
    assert.equal(dec!.current.ad_spend, 12_345);
    assert.equal(dec!.current.contact_rate_pct, 22);
    assert.equal(dec!.include_fees, true);
    assert.equal(dec!.waiz.ad_spend, 12_345);
  });

  it("decode garbage returns null", () => {
    assert.equal(decodeCompareState("%%%not-base64%%%"), null);
  });

  it("normalizeSide clamps percentages", () => {
    const n = normalizeSide({
      ad_spend: 1000,
      cpl: 10,
      leads: 0,
      driver: "cpl",
      contact_rate_pct: 150,
      close_rate_pct: -5,
      avg_commission: 100,
      program_fee: 0,
    });
    assert.equal(n.contact_rate_pct, 100);
    assert.equal(n.close_rate_pct, 0);
  });
});

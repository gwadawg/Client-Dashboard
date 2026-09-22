import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  draftToVirtualCard,
  parseVirtualCardDraft,
  slugifyName,
  validateForPublish,
  emptyVirtualCardDraft,
} from "./intake";
import { getVirtualCard, listVirtualCardSlugs } from "./registry";
import { buildVCard, phoneE164 } from "./vcard";

describe("virtual-card registry fallback", () => {
  it("lists paul-scheper", () => {
    assert.ok(listVirtualCardSlugs().includes("paul-scheper"));
  });

  it("returns paul without inventing bookingUrl", () => {
    const card = getVirtualCard("paul-scheper");
    assert.ok(card);
    assert.equal(card!.slug, "paul-scheper");
    assert.equal(card!.bookingUrl, undefined);
    assert.equal(card!.stylePackId, "forest");
  });
});

describe("virtual-card intake", () => {
  it("slugifies names", () => {
    assert.equal(slugifyName("Paul Scheper"), "paul-scheper");
  });

  it("requires booking URL when bookingNeeded", () => {
    const d = {
      ...emptyVirtualCardDraft(),
      slug: "test-lo",
      fullName: "Test LO",
      company: "Co",
      nmls: "123",
      statesLicensed: ["CA"],
      phone: "5551234567",
      email: "a@b.com",
      headshotUrl: "https://example.com/h.jpg",
      product: "rm" as const,
      stylePackId: "forest",
      bookingNeeded: true,
      bookingUrl: "",
    };
    assert.ok(validateForPublish(d).some(e => /Booking URL/i.test(e)));
  });

  it("allows publish without booking when not needed", () => {
    const d = {
      ...emptyVirtualCardDraft(),
      slug: "test-lo",
      fullName: "Test LO",
      company: "Co",
      nmls: "123",
      statesLicensed: ["CA"],
      phone: "5551234567",
      email: "a@b.com",
      headshotUrl: "https://example.com/h.jpg",
      product: "rm" as const,
      stylePackId: "forest",
      bookingNeeded: false,
      bookingUrl: "",
    };
    assert.deepEqual(validateForPublish(d), []);
    const card = draftToVirtualCard(d);
    assert.equal(card.bookingUrl, undefined);
  });

  it("parses draft and builds card with learn link", () => {
    const draft = parseVirtualCardDraft({
      slug: "jane-doe",
      fullName: "Jane Doe",
      company: "Acme",
      nmls: "99",
      statesLicensed: ["TX"],
      phone: "5125551212",
      email: "j@acme.com",
      headshotUrl: "https://example.com/j.jpg",
      product: "dscr",
      stylePackId: "operator",
      bookingNeeded: true,
      bookingUrl: "https://calendly.com/jane",
    });
    const card = draftToVirtualCard(draft);
    assert.equal(card.product, "dscr");
    assert.equal(card.bookingUrl, "https://calendly.com/jane");
    assert.ok(card.secondaryLinks?.[0]?.href.includes("/learn"));
  });
});

describe("virtual-card vcard helpers", () => {
  it("formats e164", () => {
    assert.equal(phoneE164("9496367242"), "+19496367242");
  });

  it("includes card URL in vcard", () => {
    const card = getVirtualCard("paul-scheper")!;
    const body = buildVCard(card);
    assert.match(body, /URL:https:\/\/loanofficer\.me\/paul-scheper/);
  });
});

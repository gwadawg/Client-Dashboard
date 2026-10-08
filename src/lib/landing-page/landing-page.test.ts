import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { describe, it } from "node:test";
import YAML from "yaml";
import { assetFileId } from "./assets";
import { headshotExtension, logoRepoFile } from "./headshot";
import {
  draftForPublish,
  draftFromClient,
  prefillLandingDraft,
  validateForPublish,
  type SlugContext,
} from "./intake";
import { verifyGithubSignature } from "./signature";
import type { LandingClient, LandingDraft } from "./types";
import { draftToYaml } from "./yaml";

const openSlug: SlugContext = {
  slugTaken: false,
  repoYamlExists: false,
  clientOwnsSlug: false,
};

function filled(overrides: Partial<LandingDraft> = {}): LandingDraft {
  return {
    slug: "jane-doe",
    theme: "theme-1",
    accent: "",
    preview: false,
    name: "Jane Doe",
    firstName: "Jane",
    title: "DSCR Specialist",
    company: "Acme Lending",
    tagline: "DSCR refinance for rental investors",
    bio: "Reads rental files.",
    phone: "(555) 555-0100",
    email: "jane@acme.example",
    street: "100 Main Street",
    city: "Austin",
    region: "TX",
    postalCode: "78701",
    nmlsIndividual: "111111",
    nmlsCompany: "222222",
    smsStatus: "ready",
    stateNotices: ["texas"],
    applyUrl: "https://example.com/jane-quiz",
    bookingUrl: "",
    ...overrides,
  };
}

const client: LandingClient = {
  id: "c1",
  name: "Jane Doe",
  reporting_type: "DSCR",
  primary_contact_name: "Jane Doe",
  email: "jane@acme.example",
  phone: "5555550100",
  nmls: "111111",
  brokerage_name: "Acme Lending",
  legal_business_name: null,
  biography: "Reads rental files.",
  street_address: "100 Main Street",
  city: "Austin",
  state: "TX",
  zip_code: "78701",
  states_licensed: ["TX"],
  headshot_url: null,
  logo_url: null,
  landing_page_url: null,
  thank_you_page_url: null,
};

describe("landing page intake", () => {
  it("prefills from the client and suggests texas", () => {
    const draft = draftFromClient(client, "Jane");
    assert.equal(draft.slug, "jane-doe");
    assert.equal(draft.nmlsIndividual, "111111");
    assert.equal(draft.company, "Acme Lending");
    assert.deepEqual(draft.stateNotices, ["texas"]);
    assert.equal(draft.smsStatus, "ready");
    assert.equal(draft.preview, true);
  });

  it("lets a saved value win over the client row", () => {
    const saved = filled({ company: "Saved Co", phone: "" });
    const draft = prefillLandingDraft(client, saved, null);
    assert.equal(draft.company, "Saved Co");
    assert.equal(draft.phone, "5555550100");
  });

  it("rejects reserved, demo, and colliding slugs", () => {
    assert.ok(validateForPublish(filled({ slug: "themes" }), openSlug).some(e => /reserved/i.test(e)));
    assert.ok(validateForPublish(filled({ slug: "demo-lo" }), openSlug).some(e => /demo/i.test(e)));
    assert.ok(
      validateForPublish(filled(), { ...openSlug, slugTaken: true }).some(e => /another client/i.test(e)),
    );
    assert.ok(
      validateForPublish(filled(), { ...openSlug, repoYamlExists: true }).some(e => /landing repo/i.test(e)),
    );
    assert.equal(
      validateForPublish(filled(), { ...openSlug, repoYamlExists: true, clientOwnsSlug: true }).filter(e =>
        /landing repo/i.test(e),
      ).length,
      0,
    );
  });

  it("rejects a custom color on the dark template and requires one on theme-custom", () => {
    assert.ok(validateForPublish(filled({ accent: "#112233" }), openSlug).some(e => /custom color/i.test(e)));
    assert.ok(
      validateForPublish(filled({ theme: "theme-custom", accent: "" }), openSlug).some(e => /hex/i.test(e)),
    );
    assert.equal(
      validateForPublish(filled({ theme: "theme-custom", accent: "#1B4D3E" }), openSlug).length,
      0,
    );
  });

  it("forces preview on the first publish and allows it off later", () => {
    assert.equal(draftForPublish(filled({ preview: false }), false).preview, true);
    assert.equal(draftForPublish(filled({ preview: false }), true).preview, false);
  });
});

describe("landing page yaml", () => {
  it("round-trips the fields the factory requires", () => {
    const yaml = draftToYaml(draftForPublish(filled({ preview: false }), false));
    const parsed = YAML.parse(yaml) as Record<string, unknown>;
    const compliance = parsed.compliance as Record<string, unknown>;
    const sms = compliance.sms as Record<string, unknown>;
    const assets = parsed.assets as Record<string, unknown>;
    const products = parsed.products as Record<string, unknown>;
    assert.equal(parsed.draft, false);
    assert.equal(parsed.preview, true);
    assert.equal(parsed.slug, "jane-doe");
    assert.equal(parsed.theme, "theme-1");
    assert.equal(parsed.brand, undefined);
    assert.equal(compliance.nmlsCompany, "222222");
    assert.equal(sms.status, "ready");
    assert.deepEqual(compliance.stateNotices, ["texas"]);
    assert.equal(parsed.applyUrl, "https://example.com/jane-quiz");
    assert.equal(assets.headshot, "");
    assert.equal(products.primaryResidence, false);
    assert.equal((parsed.contacts as { phoneE164: string }).phoneE164, "15555550100");

    const later = YAML.parse(draftToYaml(draftForPublish(filled({ preview: false }), true))) as {
      preview: boolean;
    };
    assert.equal(later.preview, false);
  });
});

describe("landing headshot", () => {
  it("maps png and rejects gif", () => {
    assert.equal(headshotExtension({ contentType: "image/png" }), "png");
    assert.equal(headshotExtension({ filename: "photo.jpeg" }), "jpeg");
    assert.throws(() => headshotExtension({ contentType: "image/gif" }), /PNG, JPG, or WEBP/);
  });

  it("reads the storage id from a public URL and builds the logo path", () => {
    assert.equal(
      assetFileId(
        "https://example.supabase.co/storage/v1/object/public/client-headshots/logos/abc-123.png",
      ),
      "abc-123.png",
    );
    assert.equal(assetFileId(null), null);
    assert.equal(assetFileId("   "), null);
    assert.equal(
      logoRepoFile("jane-doe", { filename: "mark.webp" }).path,
      "brand_assets/clients/jane-doe/logo.webp",
    );
  });
});

describe("github webhook signature", () => {
  it("accepts a matching signature and rejects a mismatch", () => {
    const body = JSON.stringify({ zen: "test" });
    const secret = "secret";
    const header = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
    assert.equal(verifyGithubSignature(body, header, secret), true);
    assert.equal(verifyGithubSignature(body, header, "other"), false);
    assert.equal(verifyGithubSignature(body, null, secret), false);
  });
});

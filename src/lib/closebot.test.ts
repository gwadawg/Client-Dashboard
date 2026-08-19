import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  cleanHttpUrl,
  cleanHttpUrls,
  changedAtFromDateInput,
  isClosebotBugType,
  isClosebotLogStatus,
  isClosebotTicketStatus,
  parseAgentNodes,
  parseFollowUps,
  parseToneChips,
  pickVersionAt,
  slugifyClosebotName,
} from "./closebot";

describe("closebot helpers", () => {
  it("slugifies agent names", () => {
    assert.equal(slugifyClosebotName("Qualifier Bot"), "qualifier-bot");
    assert.equal(slugifyClosebotName("  Hello!!!  "), "hello");
  });

  it("parses date-only changed_at as UTC midnight", () => {
    assert.equal(changedAtFromDateInput("2026-08-07"), "2026-08-07T00:00:00.000Z");
  });

  it("validates status enum", () => {
    assert.equal(isClosebotLogStatus("watching"), true);
    assert.equal(isClosebotLogStatus("nope"), false);
  });

  it("normalizes http urls", () => {
    const { urls, error } = cleanHttpUrls(["example.com/ticket/1", "https://x.test/a"]);
    assert.equal(error, undefined);
    assert.deepEqual(urls, ["https://example.com/ticket/1", "https://x.test/a"]);
  });

  it("rejects invalid urls", () => {
    const { error } = cleanHttpUrls(["not a url!!!"]);
    assert.match(String(error), /Invalid URL/);
  });

  it("parses agent nodes", () => {
    const { nodes, error } = parseAgentNodes([
      {
        type: "agent_node",
        name: "Reverse Agent",
        description: "Book the appointment",
        prompt: "Confirm what they want and book.",
      },
    ]);
    assert.equal(error, undefined);
    assert.deepEqual(nodes, [
      {
        type: "agent_node",
        name: "Reverse Agent",
        description: "Book the appointment",
        prompt: "Confirm what they want and book.",
      },
    ]);
  });

  it("rejects unknown node types", () => {
    const { error } = parseAgentNodes([{ type: "webhook", name: "X", description: "" }]);
    assert.match(String(error), /type is invalid/);
  });

  it("parses nested follow-ups", () => {
    const { followUps, error } = parseFollowUps([
      {
        name: "No reply",
        prompt: "Nudge them",
        types: [{ after: 6, unit: "hours" }, { after: 24, unit: "hours" }],
      },
    ]);
    assert.equal(error, undefined);
    assert.equal(followUps[0].types[0].after, 6);
    assert.equal(followUps[0].types[1].unit, "hours");
  });

  it("parses tone chips without duplicates", () => {
    const { tone } = parseToneChips(["Warm", "warm", " Direct "]);
    assert.deepEqual(tone, ["Warm", "Direct"]);
  });

  it("validates ticket status and bug type", () => {
    assert.equal(isClosebotTicketStatus("investigating"), true);
    assert.equal(isClosebotTicketStatus("watching"), false);
    assert.equal(isClosebotBugType("booking_fail"), true);
    assert.equal(isClosebotBugType("typo"), false);
  });

  it("requires a single contact url", () => {
    const ok = cleanHttpUrl("ghl.com/contacts/abc");
    assert.equal(ok.error, undefined);
    assert.equal(ok.url, "https://ghl.com/contacts/abc");
    const missing = cleanHttpUrl("  ");
    assert.match(String(missing.error), /required/);
  });

  it("picks the live version at occurred_at", () => {
    const v1 = {
      id: "11111111-1111-4111-8111-111111111111",
      status: "superseded",
      went_live_at: "2026-07-01T00:00:00.000Z",
      superseded_at: "2026-08-01T00:00:00.000Z",
    };
    const v2 = {
      id: "22222222-2222-4222-8222-222222222222",
      status: "live",
      went_live_at: "2026-08-01T00:00:00.000Z",
      superseded_at: null,
    };
    const pending = {
      id: "33333333-3333-4333-8333-333333333333",
      status: "pending",
      went_live_at: null,
      superseded_at: null,
    };
    assert.equal(pickVersionAt([v1, v2, pending], "2026-07-15T12:00:00.000Z"), v1.id);
    assert.equal(pickVersionAt([v1, v2, pending], "2026-08-10T12:00:00.000Z"), v2.id);
    assert.equal(pickVersionAt([v1, v2, pending], "2026-08-01T00:00:00.000Z"), v2.id);
    assert.equal(pickVersionAt([v1, v2, pending], "2026-06-01T00:00:00.000Z"), null);
  });
});

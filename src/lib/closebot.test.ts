import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  cleanHttpUrls,
  changedAtFromDateInput,
  isClosebotLogStatus,
  parseAgentNodes,
  parseFollowUps,
  parseToneChips,
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
        types: [{ label: "SMS 2h", details: "Delay 2 hours" }],
      },
    ]);
    assert.equal(error, undefined);
    assert.equal(followUps[0].types[0].label, "SMS 2h");
  });

  it("parses tone chips without duplicates", () => {
    const { tone } = parseToneChips(["Warm", "warm", " Direct "]);
    assert.deepEqual(tone, ["Warm", "Direct"]);
  });
});

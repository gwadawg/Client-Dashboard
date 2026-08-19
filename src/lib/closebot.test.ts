import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  cleanHttpUrl,
  cleanHttpUrls,
  changedAtFromDateInput,
  classifyClosebotCoverage,
  isClosebotBugTypeSlug,
  isClosebotLogStatus,
  isClosebotTicketCoverage,
  isClosebotTicketStatus,
  logCoversOccurrence,
  parseAgentNodes,
  parseBugTypeSlugs,
  parseFollowUps,
  parseToneChips,
  pickVersionAt,
  shortCodeFromName,
  slugifyClosebotBugType,
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

  it("validates ticket status and bug type slugs", () => {
    assert.equal(isClosebotTicketStatus("investigating"), true);
    assert.equal(isClosebotTicketStatus("watching"), false);
    assert.equal(isClosebotBugTypeSlug("booking_fail"), true);
    assert.equal(isClosebotBugTypeSlug("Typo"), false);
    assert.equal(slugifyClosebotBugType("Wrong Product"), "wrong_product");
    assert.equal(shortCodeFromName("Wrong Product"), "WRON");
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

describe("closebot pre-fix coverage", () => {
  const bookingLog = {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    agent_id: "agent-1",
    status: "worked",
    changed_at: "2026-08-12T00:00:00.000Z",
    bug_types: ["booking_fail"],
  };
  const watchingLog = {
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    agent_id: "agent-1",
    status: "watching",
    changed_at: "2026-08-20T00:00:00.000Z",
    bug_types: ["wrong_reply"],
  };
  const untaggedLog = {
    id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    agent_id: "agent-1",
    status: "worked",
    changed_at: "2026-08-12T00:00:00.000Z",
    bug_types: [] as string[],
  };
  const revertedLog = {
    id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    agent_id: "agent-1",
    status: "reverted",
    changed_at: "2026-08-12T00:00:00.000Z",
    bug_types: ["booking_fail"],
  };

  it("labels same-type reports that happened before a later covering log as pre_fix", () => {
    const next = classifyClosebotCoverage([bookingLog], {
      agentId: "agent-1",
      bugType: "booking_fail",
      occurredAt: "2026-08-08T00:00:00.000Z",
    });
    assert.equal(next.coverage, "pre_fix");
    assert.equal(next.coveredByLogId, bookingLog.id);
  });

  it("lets a different type through even when the date is before an update", () => {
    const next = classifyClosebotCoverage([bookingLog], {
      agentId: "agent-1",
      bugType: "wrong_reply",
      occurredAt: "2026-08-08T00:00:00.000Z",
    });
    assert.equal(next.coverage, "actionable");
    assert.equal(next.coveredByLogId, null);
  });

  it("does not suppress tickets when the log tagged no bug types", () => {
    const next = classifyClosebotCoverage([untaggedLog], {
      agentId: "agent-1",
      bugType: "booking_fail",
      occurredAt: "2026-08-08T00:00:00.000Z",
    });
    assert.equal(next.coverage, "actionable");
  });

  it("ignores reverted logs", () => {
    const next = classifyClosebotCoverage([revertedLog], {
      agentId: "agent-1",
      bugType: "booking_fail",
      occurredAt: "2026-08-08T00:00:00.000Z",
    });
    assert.equal(next.coverage, "actionable");
  });

  it("keeps reports after the covering log as actionable", () => {
    const next = classifyClosebotCoverage([bookingLog], {
      agentId: "agent-1",
      bugType: "booking_fail",
      occurredAt: "2026-08-15T00:00:00.000Z",
    });
    assert.equal(next.coverage, "actionable");
  });

  it("treats the same UTC calendar day as pre-fix", () => {
    assert.equal(
      logCoversOccurrence("2026-08-19T00:00:00.000Z", "2026-08-19T00:00:00.000Z"),
      true,
    );
    const next = classifyClosebotCoverage([bookingLog], {
      agentId: "agent-1",
      bugType: "booking_fail",
      occurredAt: "2026-08-12T00:00:00.000Z",
    });
    assert.equal(next.coverage, "pre_fix");
  });

  it("picks the earliest covering log", () => {
    const laterSameType = {
      ...bookingLog,
      id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      changed_at: "2026-08-18T00:00:00.000Z",
    };
    const next = classifyClosebotCoverage([laterSameType, bookingLog], {
      agentId: "agent-1",
      bugType: "booking_fail",
      occurredAt: "2026-08-08T00:00:00.000Z",
    });
    assert.equal(next.coveredByLogId, bookingLog.id);
  });

  it("reclassify-on-ship: a later covering log marks earlier same-type tickets pre_fix", () => {
    const before = classifyClosebotCoverage([], {
      agentId: "agent-1",
      bugType: "booking_fail",
      occurredAt: "2026-08-08T00:00:00.000Z",
    });
    assert.equal(before.coverage, "actionable");
    const after = classifyClosebotCoverage([bookingLog, watchingLog], {
      agentId: "agent-1",
      bugType: "booking_fail",
      occurredAt: "2026-08-08T00:00:00.000Z",
    });
    assert.equal(after.coverage, "pre_fix");
    const otherType = classifyClosebotCoverage([bookingLog, watchingLog], {
      agentId: "agent-1",
      bugType: "loop_stuck",
      occurredAt: "2026-08-08T00:00:00.000Z",
    });
    assert.equal(otherType.coverage, "actionable");
  });

  it("untyped tickets stay actionable", () => {
    const next = classifyClosebotCoverage([bookingLog], {
      agentId: "agent-1",
      bugType: null,
      occurredAt: "2026-08-08T00:00:00.000Z",
    });
    assert.equal(next.coverage, "actionable");
  });

  it("parses bug type slugs and coverage enums", () => {
    assert.equal(isClosebotTicketCoverage("pre_fix"), true);
    assert.equal(isClosebotTicketCoverage("new"), false);
    const parsed = parseBugTypeSlugs(["booking_fail", "booking_fail", "wrong_reply"]);
    assert.deepEqual(parsed.slugs, ["booking_fail", "wrong_reply"]);
    const bad = parseBugTypeSlugs(["Typo"]);
    assert.match(String(bad.error), /invalid slug/);
  });
});

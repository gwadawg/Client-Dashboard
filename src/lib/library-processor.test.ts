import { describe, expect, it } from "vitest";
import {
  extractRelatedFromBody,
  extractStageHeadings,
  extractHeadings,
  processLibraryDoc,
} from "./library-processor";

describe("extractStageHeadings", () => {
  it("keeps script-style stage nav", () => {
    const headings = extractHeadings(`
## North star
## Stage 1 — Introduction
### Stage 2 — Expectations
## Call checklist (5 things)
`);
    const nav = extractStageHeadings(headings);
    expect(nav.map((h) => h.title)).toEqual(
      expect.arrayContaining([
        "North star",
        "Stage 1 — Introduction",
        "Stage 2 — Expectations",
        "Call checklist (5 things)",
      ]),
    );
  });

  it("falls back to all H2 chapters for general SOPs", () => {
    const headings = extractHeadings(`
## Purpose
## When to use
## Procedure
## Escalation
`);
    const nav = extractStageHeadings(headings);
    expect(nav.map((h) => h.title)).toEqual([
      "Purpose",
      "When to use",
      "Procedure",
      "Escalation",
    ]);
  });
});

describe("extractRelatedFromBody", () => {
  it("extracts /library/slug links", () => {
    const related = extractRelatedFromBody(
      "See [Watchshift SOP](/library/watchshift) and [Flip the Frame](/library/flip-the-frame#section).",
    );
    expect(related).toEqual([
      { slug: "watchshift", label: "Watchshift SOP", relation: "reference" },
      { slug: "flip-the-frame", label: "Flip the Frame", relation: "reference" },
    ]);
  });
});

describe("processLibraryDoc related merge", () => {
  it("merges body links into related_docs and drops self", () => {
    const processed = processLibraryDoc({
      slug: "watchshift",
      title: "Watchshift",
      body: "## Purpose\n\nSee [Intro Call](/library/intro-call-script) and [Watchshift](/library/watchshift).",
      owner: "setter",
      artifact_type: "sop",
      related_docs: [{ slug: "flip-the-frame", label: "Flip", relation: "reference" }],
    });
    expect(processed.related_docs.map((r) => r.slug)).toEqual([
      "flip-the-frame",
      "intro-call-script",
    ]);
    expect(processed.stage_nav.map((h) => h.title)).toEqual(["Purpose"]);
  });
});

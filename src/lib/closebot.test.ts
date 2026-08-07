import { describe, expect, it } from "vitest";
import {
  cleanHttpUrls,
  changedAtFromDateInput,
  isClosebotLogStatus,
  slugifyClosebotName,
} from "./closebot";

describe("closebot helpers", () => {
  it("slugifies agent names", () => {
    expect(slugifyClosebotName("Qualifier Bot")).toBe("qualifier-bot");
    expect(slugifyClosebotName("  Hello!!!  ")).toBe("hello");
  });

  it("parses date-only changed_at as UTC midnight", () => {
    expect(changedAtFromDateInput("2026-08-07")).toBe("2026-08-07T00:00:00.000Z");
  });

  it("validates status enum", () => {
    expect(isClosebotLogStatus("watching")).toBe(true);
    expect(isClosebotLogStatus("nope")).toBe(false);
  });

  it("normalizes http urls", () => {
    const { urls, error } = cleanHttpUrls(["example.com/ticket/1", "https://x.test/a"]);
    expect(error).toBeUndefined();
    expect(urls).toEqual(["https://example.com/ticket/1", "https://x.test/a"]);
  });

  it("rejects invalid urls", () => {
    const { error } = cleanHttpUrls(["not a url!!!"]);
    expect(error).toMatch(/Invalid URL/);
  });
});

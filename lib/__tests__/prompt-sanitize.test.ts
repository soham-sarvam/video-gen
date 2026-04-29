import { describe, expect, it } from "vitest";
import { sanitizeUserPrompt } from "../prompt-sanitize";

describe("sanitizeUserPrompt", () => {
  it("trims and normalizes CRLF", () => {
    expect(sanitizeUserPrompt("  a\r\nb  ", 100)).toBe("a\nb");
  });

  it("clamps with ellipsis under max", () => {
    const long = "word ".repeat(900).trim();
    const out = sanitizeUserPrompt(long, 80);
    expect(out.length).toBeLessThanOrEqual(80);
    expect(out.endsWith("…")).toBe(true);
  });
});

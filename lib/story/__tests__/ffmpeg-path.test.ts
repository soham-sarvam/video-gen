import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { resolveFfmpegPath } from "../ffmpeg-path";

describe("resolveFfmpegPath", () => {
  it("returns a path that exists on disk", () => {
    const p = resolveFfmpegPath();
    expect(typeof p).toBe("string");
    expect(p.length).toBeGreaterThan(0);
    expect(existsSync(p)).toBe(true);
  });
});

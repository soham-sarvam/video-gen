import { existsSync, statSync, unlinkSync } from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
import { trimLastSeconds, trimAndUpload } from "../video-trim";

vi.mock("@/lib/providers/fal", () => ({
  falProvider: {
    uploadFromBuffer: vi.fn().mockResolvedValue("https://fal/trim.mp4"),
  },
}));
vi.mock("@/lib/providers/kie", () => ({
  kieProvider: {
    uploadFromBuffer: vi.fn().mockResolvedValue("https://kie/trim.mp4"),
  },
}));

const FIXTURE = path.join(__dirname, "fixtures", "sample-5s.mp4");
const OUT = path.join(__dirname, "fixtures", "trimmed.mp4");

describe("video-trim", () => {
  afterAll(() => {
    if (existsSync(OUT)) unlinkSync(OUT);
  });

  it("trimLastSeconds writes a non-empty mp4 smaller than original", async () => {
    await trimLastSeconds(FIXTURE, OUT, 2);
    expect(existsSync(OUT)).toBe(true);
    const trimmed = statSync(OUT).size;
    const original = statSync(FIXTURE).size;
    expect(trimmed).toBeGreaterThan(0);
    expect(trimmed).toBeLessThan(original);
  });

  it("trimAndUpload returns provider URL", async () => {
    const url = await trimAndUpload(FIXTURE, 2, "kie");
    expect(url).toBe("https://kie/trim.mp4");
  });
});

import { existsSync, statSync, unlinkSync } from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { stitchClips } from "../stitcher";

const FIX = path.join(__dirname, "fixtures", "sample-5s.mp4");
const OUT = path.join(__dirname, "fixtures", "stitched.mp4");

describe("stitchClips", () => {
  afterAll(() => {
    if (existsSync(OUT)) unlinkSync(OUT);
  });

  it("concatenates 2 copies of sample-5s.mp4 into one ~10s mp4", async () => {
    await stitchClips([FIX, FIX], OUT);
    expect(existsSync(OUT)).toBe(true);
    expect(statSync(OUT).size).toBeGreaterThan(statSync(FIX).size);
  });
});

import { existsSync, statSync, unlinkSync } from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { extractLastFrame } from "../frame-extract";

const FIXTURE = path.join(__dirname, "fixtures", "sample-5s.mp4");
const OUT = path.join(__dirname, "fixtures", "out-last.png");

describe("extractLastFrame", () => {
  afterAll(() => {
    if (existsSync(OUT)) unlinkSync(OUT);
  });

  it("writes a non-empty PNG at the requested path", async () => {
    await extractLastFrame(FIXTURE, OUT);
    expect(existsSync(OUT)).toBe(true);
    expect(statSync(OUT).size).toBeGreaterThan(500);
  });
});

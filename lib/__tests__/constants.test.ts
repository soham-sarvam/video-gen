import { describe, expect, it } from "vitest";
import {
  GENERATION_MODES,
  MAX_STORY_DURATION,
  STORY_LENGTHS,
  STORY_LENGTH_TO_SECONDS,
  isStoryMode,
} from "@/lib/constants";

describe("Story Mode constants", () => {
  it("exposes single/half/minute story lengths", () => {
    expect(STORY_LENGTHS).toEqual(["single", "half", "minute"]);
  });

  it("maps lengths to expected target durations", () => {
    expect(STORY_LENGTH_TO_SECONDS.single).toBe(15);
    expect(STORY_LENGTH_TO_SECONDS.half).toBe(30);
    expect(STORY_LENGTH_TO_SECONDS.minute).toBe(60);
  });

  it("caps story duration at 60s", () => {
    expect(MAX_STORY_DURATION).toBe(60);
  });

  it("treats half/minute as Story Mode and single as not", () => {
    expect(isStoryMode("single")).toBe(false);
    expect(isStoryMode("half")).toBe(true);
    expect(isStoryMode("minute")).toBe(true);
  });

  it("exposes quality/fast generation modes", () => {
    expect(GENERATION_MODES).toEqual(["quality", "fast"]);
  });
});

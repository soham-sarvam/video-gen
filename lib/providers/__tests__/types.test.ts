import { describe, expect, it } from "vitest";
import type { GenerationInput } from "../types";

describe("GenerationInput", () => {
  it("accepts an optional firstFrameUrl", () => {
    const input: GenerationInput = {
      model: {
        value: "kie:fast",
        label: "x",
        description: "x",
        provider: "kie",
        tier: "fast",
        slug: "bytedance/seedance-2-fast",
        maxResolution: "720p",
        supportsWebSearch: true,
      },
      prompt: "p",
      resolution: "720p",
      aspectRatio: "16:9",
      duration: "5",
      generateAudio: true,
      imageUrls: [],
      videoUrls: [],
      audioUrls: [],
      firstFrameUrl: "https://example.com/frame.png",
    };
    expect(input.firstFrameUrl).toBe("https://example.com/frame.png");
  });
});

import { describe, expect, it } from "vitest";
import { buildOutlineSystemPrompt, buildSynthSystemPrompt } from "../system-prompt";

describe("buildOutlineSystemPrompt", () => {
  it("includes Seedance core and storyboarding grammar", async () => {
    const sys = await buildOutlineSystemPrompt({
      stylePackId: "01-cinematic",
      mode: "quality",
      languageCode: "hi-IN",
    });
    expect(sys).toMatch(/Seedance 2\.0|@Image1|explicit roles/i);
    expect(sys).toMatch(/8-element|Prompt Structure|Subject\/Character/i);
  });

  it("Quality mode rules say beats carry rich metadata without fullPrompt", async () => {
    const sys = await buildOutlineSystemPrompt({
      stylePackId: "01-cinematic",
      mode: "quality",
      languageCode: "hi-IN",
    });
    expect(sys).toMatch(/Quality mode/i);
    expect(sys).toMatch(/DO NOT generate fullPrompt|synthes/i);
    expect(sys).toMatch(/sceneDescription|cameraDirection/i);
  });

  it("Fast mode rules require a fullPrompt per beat", async () => {
    const sys = await buildOutlineSystemPrompt({
      stylePackId: "01-cinematic",
      mode: "fast",
      languageCode: "hi-IN",
    });
    expect(sys).toMatch(/Fast mode/i);
    expect(sys).toMatch(/fullPrompt/);
  });

  it("includes the chosen style pack (inline directives)", async () => {
    const sys = await buildOutlineSystemPrompt({
      stylePackId: "11-social-hook",
      mode: "quality",
      languageCode: "hi-IN",
    });
    expect(sys).toMatch(/Social Hook|vertical|9:16|hook/i);
  });
});

describe("buildSynthSystemPrompt", () => {
  it("emphasises @video1 continuation directive", async () => {
    const sys = await buildSynthSystemPrompt({
      stylePackId: "01-cinematic",
      languageCode: "hi-IN",
      tier: "motion-match",
    });
    expect(sys).toMatch(/@Video1/i);
    expect(sys).toMatch(/continu/i);
  });

  it("requires lip-sync directive for dialogue beats", async () => {
    const sys = await buildSynthSystemPrompt({
      stylePackId: "01-cinematic",
      languageCode: "hi-IN",
      tier: "fresh",
    });
    expect(sys).toMatch(/lip-?sync|articulat|phoneme/i);
  });
});

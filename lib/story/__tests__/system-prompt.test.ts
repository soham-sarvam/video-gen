import { describe, expect, it } from "vitest";
import { buildOutlineSystemPrompt, buildSynthSystemPrompt } from "../system-prompt";

describe("buildOutlineSystemPrompt", () => {
  it("includes core foundation skill content", async () => {
    const sys = await buildOutlineSystemPrompt({
      stylePackId: "01-cinematic",
      mode: "quality",
      languageCode: "hi-IN",
    });
    expect(sys).toMatch(/atomic_element_mapping|asset type|reference syntax/i);
    expect(sys).toMatch(/8-element|subject\/scene|camera/i);
  });

  it("Quality mode rules say beats carry only metadata", async () => {
    const sys = await buildOutlineSystemPrompt({
      stylePackId: "01-cinematic",
      mode: "quality",
      languageCode: "hi-IN",
    });
    expect(sys).toMatch(/Quality mode/i);
    expect(sys).toMatch(/full prompt.*synthes/i);
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

  it("includes the chosen style pack content", async () => {
    const sys = await buildOutlineSystemPrompt({
      stylePackId: "11-social-hook",
      mode: "quality",
      languageCode: "hi-IN",
    });
    // The 11-social-hook SKILL.md should be inlined or excerpted
    expect(sys).toMatch(/social|vertical|9:16|hook/i);
  });
});

describe("buildSynthSystemPrompt", () => {
  it("emphasises @video1 continuation directive", async () => {
    const sys = await buildSynthSystemPrompt({
      stylePackId: "01-cinematic",
      languageCode: "hi-IN",
      tier: "motion-match",
    });
    expect(sys).toMatch(/@video1.*continu|continu.*@video1/i);
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

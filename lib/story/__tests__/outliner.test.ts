import { describe, expect, it, vi } from "vitest";

const mockGenerateContent = vi.fn().mockResolvedValue({
  text: JSON.stringify({
    storyId: "abc",
    mode: "quality",
    totalDurationSeconds: 30,
    language: "hi-IN",
    stylePackId: "01-cinematic",
    voiceTimbreSpeaker: "shubh",
    beats: [
      {
        index: 1,
        durationSeconds: 15,
        oneLineSummary: "wide opener",
        hasDialogue: false,
        role: "opener",
        shotType: "wide",
        bgmIntensity: "low",
      },
      {
        index: 2,
        durationSeconds: 15,
        oneLineSummary: "close-up reveal",
        hasDialogue: true,
        dialogue: { text: "नमस्ते।", speaker: "shubh", languageCode: "hi-IN" },
        role: "continuation",
        shotType: "closeup",
        bgmIntensity: "low",
      },
    ],
  }),
});

vi.mock("@google/genai", () => ({
  GoogleGenAI: vi.fn().mockImplementation(function () {
    return { models: { generateContent: mockGenerateContent } };
  }),
}));

import { outlineStory } from "../outliner";

describe("outlineStory", () => {
  it("returns a validated outline", async () => {
    process.env.GEMINI_API_KEY = "x";
    const { outline, warnings } = await outlineStory({
      prompt: "test",
      language: "hi-IN",
      storyLength: "half",
      mode: "quality",
      stylePack: "01-cinematic",
      model: "kie:fast",
      resolution: "720p",
      aspectRatio: "16:9",
      references: { images: [], videos: [], audios: [] },
    });
    expect(outline.beats.length).toBe(2);
    expect(outline.totalDurationSeconds).toBe(30);
    expect(warnings).toEqual([]);
  });
});

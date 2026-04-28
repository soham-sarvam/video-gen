import { describe, expect, it, vi } from "vitest";

const generateContent = vi.fn();
vi.mock("@google/genai", () => ({
  GoogleGenAI: vi.fn().mockImplementation(function () {
    return { models: { generateContent } };
  }),
}));

import { synthesizeBeatPrompt } from "../beat-prompt-synth";
import type { BeatOutline, StoryOutline, BeatRun } from "../types";

const FIX = {
  sceneDescription: "A test scene with warm lighting and detailed environment.",
  cameraDirection: "Medium shot, slow push-in, eye-level, 50mm lens.",
  lightingNotes: "Warm golden hour sidelight, soft fill from ambient sky.",
  audioDirection: "Ambient: gentle wind. BGM: soft piano at low intensity.",
} as const;

const BEAT: BeatOutline = {
  index: 2,
  durationSeconds: 8,
  oneLineSummary: "Close-up reveal",
  beatType: "dialogue",
  hasDialogue: true,
  dialogue: { text: "नमस्ते।", speaker: "shubh", languageCode: "hi-IN" },
  role: "continuation",
  shotType: "closeup",
  bgmIntensity: "low",
  ...FIX,
};

const STORY: StoryOutline = {
  storyId: "x",
  mode: "quality",
  totalDurationSeconds: 30,
  language: "hi-IN",
  stylePackId: "01-cinematic",
  voiceTimbreSpeaker: "shubh",
  resolution: "720p",
  aspectRatio: "16:9",
  generateAudio: true,
  beats: [],
};

const PREV: BeatRun = {
  index: 1,
  durationSeconds: 15,
  oneLineSummary: "Wide establishing",
  beatType: "establishing",
  hasDialogue: false,
  role: "opener",
  shotType: "wide",
  bgmIntensity: "low",
  ...FIX,
  status: "completed",
  taskId: "t1",
  fullPrompt: "p1",
  tier: "fresh",
  endStateDescription: "Protagonist standing at the doorway, golden rim-light",
};

describe("synthesizeBeatPrompt", () => {
  it("synthesizes a continuation prompt referencing @video1 and dialogue", async () => {
    process.env.GEMINI_API_KEY = "x";
    generateContent.mockResolvedValueOnce({
      text:
        `Close-up of @image1 character continuing from @video1's end state. ` +
        `Dialogue: "नमस्ते।" @audio1 references the narration's timbre, pitch, and accent. ` +
        `Lips articulate every phoneme — tight lip-sync, no drift. Spoken in Hindi (hi-IN). ` +
        `Avoid: identity drift, warped face, extra people, text glitches, jitter.`,
    });
    const prompt = await synthesizeBeatPrompt({
      beatOutline: BEAT,
      story: STORY,
      previousBeat: PREV,
      tier: "motion-match",
    });
    expect(prompt).toMatch(/@video1/);
    expect(prompt).toMatch(/@audio1/);
    expect(prompt).toMatch(/"नमस्ते।"/);
    expect(prompt).toMatch(/lip-sync|articulat/i);
  });

  it("synthesizes an opener prompt without @video1", async () => {
    process.env.GEMINI_API_KEY = "x";
    generateContent.mockResolvedValueOnce({
      text:
        `Wide establishing shot of @image1 character. Dialogue: "नमस्ते।" ` +
        `@audio1 references the narration's timbre. Lips articulate every phoneme. ` +
        `Spoken in Hindi (hi-IN). Avoid: identity drift, warped face, jitter.`,
    });
    const prompt = await synthesizeBeatPrompt({
      beatOutline: { ...BEAT, role: "opener" },
      story: STORY,
      previousBeat: null,
      tier: "fresh",
    });
    expect(prompt).not.toMatch(/@video1/);
    expect(prompt).toMatch(/@image1/);
  });
});

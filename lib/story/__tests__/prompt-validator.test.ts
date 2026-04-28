import { describe, expect, it } from "vitest";
import { validateBeatPrompt } from "../prompt-validator";
import type { BeatOutline } from "../types";

const dialogueBeat: BeatOutline = {
  index: 2,
  durationSeconds: 8,
  oneLineSummary: "Close-up reveal",
  beatType: "dialogue",
  hasDialogue: true,
  dialogue: { text: "नमस्ते।", speaker: "shubh", languageCode: "hi-IN" },
  role: "continuation",
  shotType: "closeup",
  bgmIntensity: "low",
  sceneDescription: "A test scene with warm lighting and detailed environment.",
  cameraDirection: "Medium shot, slow push-in, eye-level, 50mm lens.",
  lightingNotes: "Warm golden hour sidelight, soft fill from ambient sky.",
  audioDirection:
    "Ambient: gentle wind. BGM: soft piano at low intensity.",
};

describe("validateBeatPrompt", () => {
  it("passes a fully-decorated dialogue prompt", () => {
    const prompt = `
      Close-up of the protagonist. Dialogue: "नमस्ते।"
      @audio1 references the narration's timbre, pitch, and accent precisely.
      Lips articulate every phoneme of the dialogue with tight lip-sync,
      no phoneme drift. Spoken in Hindi (hi-IN).
      @video1 references the previous shot — continue from its end state.
      @image1 character as the subject.
    `;
    const errs = validateBeatPrompt(prompt, dialogueBeat, "motion-match");
    expect(errs).toEqual([]);
  });

  it("flags missing quoted dialogue", () => {
    const prompt = `Close-up. references @audio1 timbre. lip-sync mouth. Hindi. @video1 continue from.`;
    const errs = validateBeatPrompt(prompt, dialogueBeat, "motion-match");
    expect(errs.some((e) => /quoted dialogue/.test(e))).toBe(true);
  });

  it("flags missing @audio1 timbre directive", () => {
    const prompt = `Dialogue: "नमस्ते।" lip-sync mouth. Hindi. @video1 continue from. @image1 character.`;
    const errs = validateBeatPrompt(prompt, dialogueBeat, "motion-match");
    expect(errs.some((e) => /audio1.*timbre/i.test(e))).toBe(true);
  });

  it("flags missing lip-articulation directive", () => {
    const prompt = `Dialogue: "नमस्ते।" @audio1 timbre references. Hindi. @video1 continue from. @image1.`;
    const errs = validateBeatPrompt(prompt, dialogueBeat, "motion-match");
    expect(errs.some((e) => /lip-?sync|articulat|phoneme|mouth/i.test(e))).toBe(true);
  });

  it("flags missing language directive", () => {
    const prompt = `Dialogue: "abc." @audio1 references timbre. lip-sync mouth phoneme articulation. @video1 continue.`;
    const errs = validateBeatPrompt(prompt, { ...dialogueBeat, dialogue: { ...dialogueBeat.dialogue!, text: "abc." } }, "motion-match");
    expect(errs.some((e) => /language/i.test(e))).toBe(true);
  });

  it("flags missing @video1 continuation cue for motion-match tier", () => {
    const prompt = `Dialogue: "नमस्ते।" @audio1 timbre. lip-sync mouth. Hindi. @image1 character.`;
    const errs = validateBeatPrompt(prompt, dialogueBeat, "motion-match");
    expect(errs.some((e) => /@video1.*continu/.test(e))).toBe(true);
  });

  it("does NOT require @video1 for fresh tier", () => {
    const prompt = `Dialogue: "नमस्ते।" @audio1 timbre. lip-sync mouth. Hindi. @image1 character.`;
    const errs = validateBeatPrompt(prompt, dialogueBeat, "fresh");
    expect(errs.some((e) => /@video1/.test(e))).toBe(false);
  });
});

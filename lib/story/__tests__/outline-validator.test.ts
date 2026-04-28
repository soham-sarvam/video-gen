import { describe, expect, it } from "vitest";
import { validateOutline } from "../outline-validator";
import type { StoryOutline } from "../types";

const baseOutline: StoryOutline = {
  storyId: "x",
  mode: "quality",
  totalDurationSeconds: 30,
  language: "hi-IN",
  stylePackId: "01-cinematic",
  voiceTimbreSpeaker: "shubh",
  beats: [
    {
      index: 1,
      durationSeconds: 15,
      oneLineSummary: "open",
      hasDialogue: false,
      role: "opener",
      shotType: "wide",
      bgmIntensity: "low",
    },
    {
      index: 2,
      durationSeconds: 15,
      oneLineSummary: "close",
      hasDialogue: false,
      role: "continuation",
      shotType: "closeup",
      bgmIntensity: "low",
    },
  ],
};

describe("validateOutline", () => {
  it("passes a clean outline", () => {
    const errs = validateOutline(baseOutline, "kie:fast");
    expect(errs).toEqual([]);
  });

  it("flags durations not summing to total", () => {
    const bad = { ...baseOutline, beats: [...baseOutline.beats, { ...baseOutline.beats[0], index: 3, role: "continuation" as const }] };
    const errs = validateOutline(bad, "kie:fast");
    expect(errs.some((e) => /sum/i.test(e))).toBe(true);
  });

  it("flags first beat not being opener", () => {
    const bad = {
      ...baseOutline,
      beats: [
        { ...baseOutline.beats[0], role: "continuation" as const },
        baseOutline.beats[1],
      ],
    };
    const errs = validateOutline(bad, "kie:fast");
    expect(errs.some((e) => /first.*opener/i.test(e))).toBe(true);
  });

  it("flags dialogue beats not ending on terminal punctuation", () => {
    const bad = {
      ...baseOutline,
      beats: [
        baseOutline.beats[0],
        {
          ...baseOutline.beats[1],
          hasDialogue: true,
          dialogue: { text: "incomplete sentence", speaker: "shubh" as const, languageCode: "hi-IN" as const },
        },
      ],
    };
    const errs = validateOutline(bad, "kie:fast");
    expect(errs.some((e) => /terminal punctuation/i.test(e))).toBe(true);
  });

  it("flags pinFrame on non-KIE provider", () => {
    const bad = {
      ...baseOutline,
      beats: [
        baseOutline.beats[0],
        { ...baseOutline.beats[1], pinFrame: true },
      ],
    };
    const errs = validateOutline(bad, "fal:fast");
    expect(errs.some((e) => /pinFrame.*KIE/.test(e))).toBe(true);
  });

  it("flags out-of-range beat duration", () => {
    const bad = {
      ...baseOutline,
      totalDurationSeconds: 60,
      beats: [
        { ...baseOutline.beats[0], durationSeconds: 30 },
        { ...baseOutline.beats[1], durationSeconds: 30 },
      ],
    };
    const errs = validateOutline(bad, "kie:fast");
    expect(errs.some((e) => /4–15s|4-15s/.test(e))).toBe(true);
  });

  it("flags beat count outside 3-8", () => {
    const bad = {
      ...baseOutline,
      totalDurationSeconds: 8,
      beats: [{ ...baseOutline.beats[0], durationSeconds: 8 }],
    };
    const errs = validateOutline(bad, "kie:fast");
    expect(errs.some((e) => /3.*8 beats/i.test(e))).toBe(true);
  });
});

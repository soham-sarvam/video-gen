import { describe, expect, it } from "vitest";
import type {
  BeatOutline,
  BeatRun,
  StoryOutline,
  StoryRun,
} from "../types";

describe("Story types", () => {
  it("BeatOutline has required fields", () => {
    const beat: BeatOutline = {
      index: 1,
      durationSeconds: 8,
      oneLineSummary: "wide shot",
      hasDialogue: false,
      role: "opener",
      shotType: "wide",
      bgmIntensity: "low",
    };
    expect(beat.index).toBe(1);
  });

  it("StoryOutline carries mode + voiceTimbreSpeaker", () => {
    const outline: StoryOutline = {
      storyId: "abc",
      mode: "quality",
      totalDurationSeconds: 60,
      language: "hi-IN",
      stylePackId: "01-cinematic",
      voiceTimbreSpeaker: "shubh",
      beats: [],
    };
    expect(outline.mode).toBe("quality");
  });

  it("BeatRun extends BeatOutline with task results", () => {
    const run: BeatRun = {
      index: 1,
      durationSeconds: 8,
      oneLineSummary: "wide",
      hasDialogue: false,
      role: "opener",
      shotType: "wide",
      bgmIntensity: "low",
      status: "completed",
      taskId: "t",
      videoUrl: "https://x/v.mp4",
      localUrl: "/uploads/x.mp4",
      diskPath: "/abs/x.mp4",
      fullPrompt: "p",
      tier: "fresh",
    };
    expect(run.status).toBe("completed");
  });
});

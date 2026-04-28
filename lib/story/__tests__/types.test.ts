import { describe, expect, it } from "vitest";
import type {
  BeatOutline,
  BeatRun,
  StoryOutline,
} from "../types";

describe("Story types", () => {
  it("BeatOutline has required fields", () => {
    const beat: BeatOutline = {
      index: 1,
      durationSeconds: 8,
      oneLineSummary: "wide shot",
      beatType: "establishing",
      hasDialogue: false,
      role: "opener",
      shotType: "wide",
      bgmIntensity: "low",
      sceneDescription:
        "A test scene with warm lighting and detailed environment.",
      cameraDirection: "Medium shot, slow push-in, eye-level, 50mm lens.",
      lightingNotes: "Warm golden hour sidelight, soft fill from ambient sky.",
      audioDirection:
        "Ambient: gentle wind. BGM: soft piano at low intensity.",
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
      resolution: "720p",
      aspectRatio: "16:9",
      generateAudio: true,
      beats: [],
    };
    expect(outline.mode).toBe("quality");
  });

  it("BeatRun extends BeatOutline with task results", () => {
    const run: BeatRun = {
      index: 1,
      durationSeconds: 8,
      oneLineSummary: "wide",
      beatType: "establishing",
      hasDialogue: false,
      role: "opener",
      shotType: "wide",
      bgmIntensity: "low",
      sceneDescription:
        "A test scene with warm lighting and detailed environment.",
      cameraDirection: "Medium shot, slow push-in, eye-level, 50mm lens.",
      lightingNotes: "Warm golden hour sidelight, soft fill from ambient sky.",
      audioDirection:
        "Ambient: gentle wind. BGM: soft piano at low intensity.",
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

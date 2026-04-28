import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/providers", () => ({
  getProvider: () => ({
    submit: vi.fn().mockResolvedValue({ taskId: "t-mock" }),
    status: vi.fn().mockResolvedValue({
      taskId: "t-mock",
      status: "completed",
      queuePosition: null,
      logs: [],
      rawStatus: "success",
    }),
    result: vi.fn().mockResolvedValue({
      videoUrl: "https://x/v.mp4",
      seed: 1,
    }),
  }),
}));

vi.mock("../beat-prompt-synth", () => ({
  synthesizeBeatPrompt: vi.fn().mockResolvedValue("synthesized prompt"),
}));

vi.mock("../archive", () => ({
  ensureStoryDir: vi.fn().mockResolvedValue("/tmp/story"),
  writeState: vi.fn().mockResolvedValue(undefined),
  archiveBeatVideo: vi.fn().mockResolvedValue({
    diskPath: "/tmp/story/beat-1/video.mp4",
    localUrl: "/uploads/generations/kie/story-x/beat-1/video.mp4",
    sizeBytes: 100,
  }),
}));

vi.mock("../video-trim", () => ({
  trimAndUpload: vi.fn().mockResolvedValue("https://cdn/trail.mp4"),
}));

vi.mock("../frame-extract", () => ({
  extractLastFrame: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../end-state-describer", () => ({
  describeEndState: vi.fn().mockResolvedValue("Protagonist mid-stride at sunset."),
}));

import { sequentialRunner } from "../runners/sequential-runner";
import type { StoryOutline } from "../types";

const OUTLINE: StoryOutline = {
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
};

describe("sequentialRunner", () => {
  it("processes beats one at a time and threads previous trail into next request", async () => {
    const run = await sequentialRunner.run({
      outline: OUTLINE,
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
      references: { images: [], videos: [], audios: [] },
      voiceTimbreCdnUrl: "https://cdn/voice.wav",
    });
    expect(run.beats.length).toBe(2);
    expect(run.beats[0].status).toBe("completed");
    expect(run.beats[1].status).toBe("completed");
    expect(run.beats[1].tier).toBe("motion-match");
  });
});

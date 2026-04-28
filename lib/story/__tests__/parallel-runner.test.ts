import { describe, expect, it, vi } from "vitest";

const submit = vi.fn().mockResolvedValue({ taskId: "t" });
const status = vi.fn().mockResolvedValue({
  taskId: "t",
  status: "completed",
  queuePosition: null,
  logs: [],
  rawStatus: "success",
});
const result = vi.fn().mockResolvedValue({ videoUrl: "https://x/v.mp4", seed: 1 });

vi.mock("@/lib/providers", () => ({
  getProvider: () => ({ submit, status, result }),
}));

vi.mock("../archive", () => ({
  ensureStoryDir: vi.fn().mockResolvedValue("/tmp/story"),
  writeState: vi.fn().mockResolvedValue(undefined),
  archiveBeatVideo: vi.fn().mockResolvedValue({
    diskPath: "/tmp/v.mp4",
    localUrl: "/u/v.mp4",
    sizeBytes: 100,
  }),
}));

import { parallelRunner } from "../runners/parallel-runner";
import type { StoryOutline } from "../types";

const OUTLINE: StoryOutline = {
  storyId: "y",
  mode: "fast",
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
      fullPrompt: "prompt 1 references @audio1 timbre lip-sync",
    },
    {
      index: 2,
      durationSeconds: 15,
      oneLineSummary: "close",
      hasDialogue: false,
      role: "opener",
      shotType: "closeup",
      bgmIntensity: "low",
      fullPrompt: "prompt 2 references @audio1 timbre lip-sync",
    },
  ],
};

describe("parallelRunner", () => {
  it("submits both beats concurrently and returns completed runs", async () => {
    const run = await parallelRunner.run({
      outline: OUTLINE,
      model: {
        value: "kie:fast",
        label: "x",
        description: "x",
        provider: "kie",
        tier: "fast",
        slug: "s",
        maxResolution: "720p",
        supportsWebSearch: true,
      },
      references: { images: [], videos: [], audios: [] },
      voiceTimbreCdnUrl: "https://cdn/v.wav",
    });
    expect(run.beats.length).toBe(2);
    expect(submit).toHaveBeenCalledTimes(2);
    for (const b of run.beats) expect(b.status).toBe("completed");
  });
});

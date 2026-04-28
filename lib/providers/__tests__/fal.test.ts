import { describe, expect, it, vi } from "vitest";
import type { GenerationInput } from "../types";

const FAL_MODEL_FAST = {
  value: "fal:fast",
  label: "x",
  description: "x",
  provider: "fal" as const,
  tier: "fast" as const,
  slug: "bytedance/seedance-2.0/fast/reference-to-video",
  maxResolution: "720p" as const,
  supportsWebSearch: false,
};

describe("falProvider.submit", () => {
  it("uses fast/image-to-video endpoint when firstFrameUrl is set", async () => {
    process.env.FAL_API_KEY = "test-key";
    const submitMock = vi.fn().mockResolvedValue({ request_id: "r1" });
    vi.doMock("@fal-ai/client", () => ({
      fal: {
        config: vi.fn(),
        queue: { submit: submitMock },
        storage: { upload: vi.fn() },
      },
    }));
    vi.resetModules();
    const { falProvider } = await import("../fal");

    await falProvider.submit({
      model: FAL_MODEL_FAST,
      prompt: "p",
      resolution: "720p",
      aspectRatio: "16:9",
      duration: "5",
      generateAudio: false,
      imageUrls: ["https://cdn/i.png"],
      videoUrls: [],
      audioUrls: [],
      firstFrameUrl: "https://cdn/f.png",
    } as GenerationInput);

    expect(submitMock).toHaveBeenCalledOnce();
    const [endpoint, opts] = submitMock.mock.calls[0];
    expect(endpoint).toBe("bytedance/seedance-2.0/fast/image-to-video");
    expect(opts.input.image_url).toBe("https://cdn/f.png");
  });

  it("uses reference-to-video when firstFrameUrl is not set", async () => {
    process.env.FAL_API_KEY = "test-key";
    const submitMock = vi.fn().mockResolvedValue({ request_id: "r1" });
    vi.doMock("@fal-ai/client", () => ({
      fal: {
        config: vi.fn(),
        queue: { submit: submitMock },
        storage: { upload: vi.fn() },
      },
    }));
    vi.resetModules();
    const { falProvider } = await import("../fal");

    await falProvider.submit({
      model: FAL_MODEL_FAST,
      prompt: "p",
      resolution: "720p",
      aspectRatio: "16:9",
      duration: "5",
      generateAudio: false,
      imageUrls: [],
      videoUrls: [],
      audioUrls: [],
    } as GenerationInput);

    const [endpoint] = submitMock.mock.calls[0];
    expect(endpoint).toBe("bytedance/seedance-2.0/fast/reference-to-video");
  });
});

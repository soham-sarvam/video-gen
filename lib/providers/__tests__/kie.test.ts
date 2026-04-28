import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { kieProvider } from "../kie";
import type { GenerationInput } from "../types";

const KIE_MODEL = {
  value: "kie:fast",
  label: "x",
  description: "x",
  provider: "kie" as const,
  tier: "fast" as const,
  slug: "bytedance/seedance-2-fast",
  maxResolution: "720p" as const,
  supportsWebSearch: true,
};

describe("kieProvider.submit", () => {
  beforeEach(() => {
    process.env.KIE_API_KEY = "test-key";
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("includes first_frame_url in createTask body when set", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ code: 200, msg: "ok", data: { taskId: "t1" } }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const input: GenerationInput = {
      model: KIE_MODEL,
      prompt: "p",
      resolution: "720p",
      aspectRatio: "16:9",
      duration: "5",
      generateAudio: true,
      imageUrls: [],
      videoUrls: [],
      audioUrls: [],
      firstFrameUrl: "https://cdn/frame.png",
    };

    await kieProvider.submit(input);

    expect(fetchMock).toHaveBeenCalledOnce();
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.input.first_frame_url).toBe("https://cdn/frame.png");
  });

  it("omits first_frame_url when not set", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ code: 200, msg: "ok", data: { taskId: "t1" } }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await kieProvider.submit({
      model: KIE_MODEL,
      prompt: "p",
      resolution: "720p",
      aspectRatio: "16:9",
      duration: "5",
      generateAudio: true,
      imageUrls: [],
      videoUrls: [],
      audioUrls: [],
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.input.first_frame_url).toBeUndefined();
  });
});

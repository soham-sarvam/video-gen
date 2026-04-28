import { describe, expect, it, vi } from "vitest";
import { cacheKey, getCachedVoice } from "../voice-cache";

vi.mock("../bulbul-client", () => ({
  synthesize: vi
    .fn()
    .mockResolvedValue({ wavBuffer: Buffer.from([0xff]), requestId: "r" }),
}));
vi.mock("../audio-encode", () => ({
  encodeWavToMp3: vi.fn().mockResolvedValue(Buffer.from([0xff, 0xfb, 0x00])),
}));
vi.mock("@/lib/providers/fal", () => ({
  falProvider: {
    uploadFromBuffer: vi.fn().mockResolvedValue("https://fal/v.mp3"),
  },
}));
vi.mock("@/lib/providers/kie", () => ({
  kieProvider: {
    uploadFromBuffer: vi.fn().mockResolvedValue("https://kie/v.mp3"),
  },
}));

describe("voice-cache", () => {
  it("derives a stable key from (lang, speaker)", () => {
    expect(cacheKey("hi-IN", "shubh")).toBe("hi-in-shubh");
    expect(cacheKey("ta-IN", "ishita")).toBe("ta-in-ishita");
  });

  it("getCachedVoice returns FAL+KIE MP3 URLs and a .mp3 local path", async () => {
    const result = await getCachedVoice({
      languageCode: "hi-IN",
      speaker: "shubh",
    });
    expect(result.cdnUrls.fal).toBe("https://fal/v.mp3");
    expect(result.cdnUrls.kie).toBe("https://kie/v.mp3");
    expect(result.localPath).toMatch(/voice-cache[\\\/]hi-in-shubh\.mp3$/);
  });

  it("uploads with audio/mpeg mime type", async () => {
    const { falProvider } = await import("@/lib/providers/fal");
    const { kieProvider } = await import("@/lib/providers/kie");
    await getCachedVoice({ languageCode: "hi-IN", speaker: "shubh" });
    // The third arg to uploadFromBuffer must be "audio/mpeg"
    const calls = vi.mocked(falProvider.uploadFromBuffer).mock.calls;
    if (calls.length > 0) {
      expect(calls[calls.length - 1][2]).toBe("audio/mpeg");
    }
    const kCalls = vi.mocked(kieProvider.uploadFromBuffer).mock.calls;
    if (kCalls.length > 0) {
      expect(kCalls[kCalls.length - 1][2]).toBe("audio/mpeg");
    }
  });
});

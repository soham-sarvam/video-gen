import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { synthesize } from "../bulbul-client";

describe("bulbul-client.synthesize", () => {
  beforeEach(() => {
    process.env.BULBUL_TTS_API_KEY = "test-key";
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calls Sarvam TTS with correct endpoint, headers, and body", async () => {
    const fakeWav = Buffer.from([0x52, 0x49, 0x46, 0x46]);
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ request_id: "r1", audios: [fakeWav.toString("base64")] }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await synthesize({ text: "नमस्ते", languageCode: "hi-IN", speaker: "shubh" });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.sarvam.ai/text-to-speech");
    expect(opts.method).toBe("POST");
    expect(opts.headers["api-subscription-key"]).toBe("test-key");
    expect(opts.headers["Content-Type"]).toBe("application/json");
    const body = JSON.parse(opts.body);
    expect(body).toMatchObject({
      text: "नमस्ते",
      target_language_code: "hi-IN",
      model: "bulbul:v3",
      speaker: "shubh",
      speech_sample_rate: 24000,
    });
    expect(result.wavBuffer.equals(fakeWav)).toBe(true);
  });

  it("concatenates multiple audio chunks", async () => {
    const part1 = Buffer.from([0x01, 0x02]);
    const part2 = Buffer.from([0x03, 0x04]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ request_id: "r1", audios: [part1.toString("base64"), part2.toString("base64")] }), { status: 200, headers: { "content-type": "application/json" } }),
    ));
    const result = await synthesize({ text: "x", languageCode: "hi-IN", speaker: "ishita" });
    expect(result.wavBuffer.length).toBe(4);
    expect(Array.from(result.wavBuffer)).toEqual([0x01, 0x02, 0x03, 0x04]);
  });

  it("throws when API key missing", async () => {
    delete process.env.BULBUL_TTS_API_KEY;
    await expect(
      synthesize({ text: "x", languageCode: "hi-IN", speaker: "shubh" }),
    ).rejects.toThrow(/BULBUL_TTS_API_KEY/);
  });

  it("surfaces non-2xx response with status and body", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "rate limited" }), { status: 429 }),
    ));
    await expect(
      synthesize({ text: "x", languageCode: "hi-IN", speaker: "shubh" }),
    ).rejects.toThrow(/429.*rate limited/);
  });
});

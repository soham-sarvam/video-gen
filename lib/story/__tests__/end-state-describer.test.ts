import { describe, expect, it, vi } from "vitest";

const mockGenerateContent = vi.fn().mockResolvedValue({
  text: "Protagonist mid-stride, looking left, golden-hour rim light.",
});

vi.mock("@google/genai", () => ({
  GoogleGenAI: vi.fn().mockImplementation(function () {
    return { models: { generateContent: mockGenerateContent } };
  }),
}));

import { describeEndState } from "../end-state-describer";

describe("describeEndState", () => {
  it("returns a one-line description", async () => {
    process.env.GEMINI_API_KEY = "x";
    const result = await describeEndState({
      framePngBuffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      contextSummary: "wide establishing of village at dusk",
    });
    expect(result.length).toBeGreaterThan(10);
    expect(result.length).toBeLessThan(300);
  });
});

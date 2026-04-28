/**
 * Gemini Vision wrapper that turns a clip's last frame into a one-line
 * "what does this clip end on" description. The reactive synthesizer
 * folds this into the next beat's prompt to ground continuation.
 */
import { GoogleGenAI } from "@google/genai";
import { GEMINI_MODEL } from "@/lib/constants";

let cachedClient: GoogleGenAI | null = null;
function getClient(): GoogleGenAI {
  if (cachedClient) return cachedClient;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured.");
  cachedClient = new GoogleGenAI({ apiKey });
  return cachedClient;
}

export interface DescribeEndStateInput {
  framePngBuffer: Buffer;
  contextSummary: string;
}

export async function describeEndState(
  input: DescribeEndStateInput,
): Promise<string> {
  const client = getClient();
  const res = await client.models.generateContent({
    model: GEMINI_MODEL,
    contents: [
      {
        role: "user",
        parts: [
          {
            inlineData: {
              mimeType: "image/png",
              data: input.framePngBuffer.toString("base64"),
            },
          },
          {
            text:
              `Describe in ONE concise sentence (≤30 words) what the visible scene shows: ` +
              `subject pose, framing, lighting, action implied. ` +
              `Context for this clip: "${input.contextSummary}". ` +
              `Output only the sentence — no preamble.`,
          },
        ],
      },
    ],
    config: {
      temperature: 0.3,
      maxOutputTokens: 128,
    },
  });
  return (res.text ?? "").trim().replace(/\s+/g, " ");
}

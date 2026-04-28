/**
 * Gemini 3.1 Pro outliner for Story Mode.
 *
 * Returns a validated StoryOutline. One auto-retry on validator failure
 * (errors injected back into the prompt).
 */
import { GoogleGenAI } from "@google/genai";
import { nanoid } from "nanoid";
import { GEMINI_MODEL } from "@/lib/constants";
import { validateOutline } from "./outline-validator";
import { pickAutoStylePack } from "./style-pack-registry";
import { buildOutlineSystemPrompt } from "./system-prompt";
import type { OutlineRequest, StoryOutline } from "./types";

let cachedClient: GoogleGenAI | null = null;
function getClient(): GoogleGenAI {
  if (cachedClient) return cachedClient;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured.");
  cachedClient = new GoogleGenAI({ apiKey });
  return cachedClient;
}

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    storyId: { type: "string" },
    mode: { type: "string", enum: ["quality", "fast"] },
    totalDurationSeconds: { type: "number" },
    language: { type: "string" },
    stylePackId: { type: "string" },
    voiceTimbreSpeaker: { type: "string" },
    beats: {
      type: "array",
      items: {
        type: "object",
        properties: {
          index: { type: "number" },
          durationSeconds: { type: "number" },
          oneLineSummary: { type: "string" },
          hasDialogue: { type: "boolean" },
          dialogue: {
            type: "object",
            properties: {
              text: { type: "string" },
              speaker: { type: "string" },
              languageCode: { type: "string" },
            },
          },
          role: { type: "string", enum: ["opener", "continuation"] },
          pinFrame: { type: "boolean" },
          shotType: { type: "string" },
          bgmIntensity: { type: "string" },
          fullPrompt: { type: "string" },
        },
        required: ["index", "durationSeconds", "oneLineSummary", "hasDialogue", "role", "shotType", "bgmIntensity"],
      },
    },
  },
  required: ["mode", "totalDurationSeconds", "language", "stylePackId", "voiceTimbreSpeaker", "beats"],
};

function targetSeconds(length: "single" | "half" | "minute"): number {
  return length === "single" ? 15 : length === "half" ? 30 : 60;
}

export async function outlineStory(
  req: OutlineRequest,
): Promise<{ outline: StoryOutline; warnings: string[] }> {
  const client = getClient();
  const stylePackId = req.stylePack === "auto"
    ? pickAutoStylePack(req.prompt, {
        imageCount: req.references.images.length,
        videoCount: req.references.videos.length,
        audioCount: req.references.audios.length,
      })
    : req.stylePack;

  // Default voice from current language; planner can override.
  const initialSpeaker = "shubh"; // Gemini may overwrite based on script
  const total = targetSeconds(req.storyLength);

  const systemInstruction = await buildOutlineSystemPrompt({
    stylePackId,
    mode: req.mode,
    languageCode: req.language,
  });

  const userPrompt = [
    `Story request:`,
    `- prompt: ${req.prompt}`,
    `- target total duration: ${total}s`,
    `- target language: ${req.language}`,
    `- mode: ${req.mode}`,
    `- chosen style pack: ${stylePackId}`,
    `- canonical voice speaker (default): ${initialSpeaker}`,
    `- references: ${req.references.images.length} images, ${req.references.videos.length} videos, ${req.references.audios.length} audio`,
    ``,
    `Return a StoryOutline JSON.`,
  ].join("\n");

  const callOnce = async (extra: string): Promise<StoryOutline> => {
    const res = await client.models.generateContent({
      model: GEMINI_MODEL,
      contents: extra ? `${userPrompt}\n\n${extra}` : userPrompt,
      config: {
        systemInstruction,
        temperature: 0.5,
        maxOutputTokens: 4096,
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA as never,
        thinkingConfig: { thinkingBudget: 4096 },
      },
    });
    const text = res.text?.trim() ?? "";
    if (!text) throw new Error("Gemini returned empty outline.");
    const parsed = JSON.parse(text) as StoryOutline;
    parsed.storyId = parsed.storyId || nanoid(12);
    parsed.stylePackId = stylePackId;
    parsed.totalDurationSeconds = total;
    return parsed;
  };

  let outline = await callOnce("");
  let warnings = validateOutline(outline, req.model);
  if (warnings.length > 0) {
    try {
      const retried = await callOnce(`Validator errors:\n${warnings.map((w) => `- ${w}`).join("\n")}\n\nRewrite the outline to fix every error above.`);
      const retriedWarnings = validateOutline(retried, req.model);
      if (retriedWarnings.length < warnings.length) {
        outline = retried;
        warnings = retriedWarnings;
      }
    } catch {
      // keep first try
    }
  }
  return { outline, warnings };
}

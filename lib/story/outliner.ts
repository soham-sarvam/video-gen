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
          beatType: {
            type: "string",
            enum: ["establishing", "dialogue", "b-roll", "action", "transition", "montage", "reaction", "cutaway"],
          },
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
          sceneDescription: { type: "string" },
          cameraDirection: { type: "string" },
          lightingNotes: { type: "string" },
          audioDirection: { type: "string" },
          fullPrompt: { type: "string" },
        },
        required: [
          "index", "durationSeconds", "oneLineSummary", "beatType",
          "hasDialogue", "role", "shotType", "bgmIntensity",
          "sceneDescription", "cameraDirection", "lightingNotes", "audioDirection",
        ],
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

  // Fast mode requires a fullPrompt per beat — that doubles the response size.
  // Bump the output token budget so structured-JSON responses don't truncate.
  const maxOutputTokens = req.mode === "fast" ? 8192 : 4096;

  const callOnce = async (extra: string): Promise<StoryOutline> => {
    const res = await client.models.generateContent({
      model: GEMINI_MODEL,
      contents: extra ? `${userPrompt}\n\n${extra}` : userPrompt,
      config: {
        systemInstruction,
        temperature: 0.5,
        maxOutputTokens,
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA as never,
        thinkingConfig: { thinkingBudget: 4096 },
      },
    });
    const text = res.text?.trim() ?? "";
    if (!text) throw new Error("Gemini returned empty outline.");
    let parsed: StoryOutline;
    try {
      parsed = JSON.parse(text) as StoryOutline;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Outline JSON parse failed: ${msg}. Likely truncation — try a shorter prompt or switch to Quality mode.`,
      );
    }
    parsed.storyId = parsed.storyId || nanoid(12);
    parsed.stylePackId = stylePackId;
    parsed.totalDurationSeconds = total;
    parsed.resolution = req.resolution;
    parsed.aspectRatio = req.aspectRatio;
    parsed.generateAudio = true;
    return parsed;
  };

  // Wrap both call paths so JSON.parse errors trigger a retry the same way
  // validator errors do — Fast mode's larger payload is the common offender.
  const safeCall = async (extra: string): Promise<{ outline: StoryOutline | null; parseError: string | null }> => {
    try {
      return { outline: await callOnce(extra), parseError: null };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("Outline JSON parse failed")) {
        return { outline: null, parseError: msg };
      }
      throw err;
    }
  };

  let outline: StoryOutline;
  let warnings: string[];
  const first = await safeCall("");
  if (first.outline) {
    outline = first.outline;
    warnings = validateOutline(outline, req.model);
  } else {
    // Parse failed — retry once with a hint to keep dialogue strings short.
    const retry = await safeCall(
      "Your previous response was not valid JSON (likely truncation). " +
        "Reduce per-beat fullPrompt verbosity, escape internal quotes, and ensure the response fits within the token budget.",
    );
    if (!retry.outline) {
      throw new Error(retry.parseError ?? first.parseError ?? "Outline parse failed twice.");
    }
    outline = retry.outline;
    warnings = validateOutline(outline, req.model);
  }

  if (warnings.length > 0) {
    try {
      const retried = await callOnce(
        `Validator errors:\n${warnings.map((w) => `- ${w}`).join("\n")}\n\nRewrite the outline to fix every error above.`,
      );
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

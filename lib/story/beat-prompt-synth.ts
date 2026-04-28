/**
 * Reactive per-beat prompt synthesizer (Quality mode).
 *
 * Given the next beat's outline metadata + the previous beat's actual output
 * description (from end-state-describer), produces a complete Seedance prompt.
 *
 * Validates the result with prompt-validator. One auto-retry on failure.
 */
import { GoogleGenAI } from "@google/genai";
import { GEMINI_MODEL } from "@/lib/constants";
import { buildSynthSystemPrompt } from "./system-prompt";
import { validateBeatPrompt } from "./prompt-validator";
import type { BeatOutline, BeatRun, ContinuityTier, StoryOutline } from "./types";

let cachedClient: GoogleGenAI | null = null;
function getClient(): GoogleGenAI {
  if (cachedClient) return cachedClient;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured.");
  cachedClient = new GoogleGenAI({ apiKey });
  return cachedClient;
}

export interface SynthesizeBeatPromptInput {
  beatOutline: BeatOutline;
  story: StoryOutline;
  previousBeat: BeatRun | null;
  tier: ContinuityTier;
}

export async function synthesizeBeatPrompt(
  input: SynthesizeBeatPromptInput,
): Promise<string> {
  const client = getClient();
  const systemInstruction = await buildSynthSystemPrompt({
    stylePackId: input.story.stylePackId,
    languageCode: input.story.language,
    tier: input.tier,
  });

  const b = input.beatOutline;
  const userParts: string[] = [
    `Beat ${b.index} of ${input.story.beats.length || "N"} (${b.durationSeconds}s, ${b.shotType}, ${b.beatType}).`,
    ``,
    `## Summary`,
    `${b.oneLineSummary}`,
    ``,
    `## Scene Description`,
    `${b.sceneDescription}`,
    ``,
    `## Camera Direction`,
    `${b.cameraDirection}`,
    ``,
    `## Lighting`,
    `${b.lightingNotes}`,
    ``,
    `## Audio Direction`,
    `${b.audioDirection}`,
    ``,
    `## Parameters`,
    `BGM intensity: ${b.bgmIntensity}`,
    `Voice timbre speaker: ${input.story.voiceTimbreSpeaker}`,
  ];
  if (b.hasDialogue && b.dialogue) {
    userParts.push(``, `## Dialogue`, `(use verbatim, in double quotes): "${b.dialogue.text}"`, `Spoken in: ${b.dialogue.languageCode}`);
  }
  if (input.previousBeat) {
    userParts.push(``, `## Continuity`, `Previous beat ended on: "${input.previousBeat.endStateDescription ?? input.previousBeat.oneLineSummary}"`);
  }
  if (input.tier === "frame-exact-motion-match") {
    userParts.push(`Use the previous beat's last frame as the first frame; visually continuous boundary.`);
  }

  const userPrompt = userParts.join("\n");

  const callOnce = async (extra: string): Promise<string> => {
    const res = await client.models.generateContent({
      model: GEMINI_MODEL,
      contents: extra ? `${userPrompt}\n\n${extra}` : userPrompt,
      config: {
        systemInstruction,
        temperature: 0.5,
        maxOutputTokens: 1024,
        thinkingConfig: { thinkingBudget: 1024 },
      },
    });
    return (res.text ?? "").trim();
  };

  let prompt = await callOnce("");
  let errors = validateBeatPrompt(prompt, input.beatOutline, input.tier);
  if (errors.length > 0) {
    try {
      const retried = await callOnce(`Validator errors:\n${errors.map((e) => `- ${e}`).join("\n")}\n\nRewrite to fix every error.`);
      const retriedErrors = validateBeatPrompt(retried, input.beatOutline, input.tier);
      if (retriedErrors.length < errors.length) {
        prompt = retried;
        errors = retriedErrors;
      }
    } catch {
      // keep first try
    }
  }
  return prompt;
}

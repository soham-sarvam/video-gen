/**
 * POST /api/story/outline
 *
 * Body: OutlineRequest (zod-validated). Server runs Gemini outliner.
 * Returns { outline, warnings }. Cheap (~$0.02), gated by user review
 * before /api/story/submit kicks off any video compute.
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import {
  ASPECT_RATIOS,
  GENERATION_MODES,
  INDIC_LANGUAGES,
  PROMPT_MAX_CHARS,
  RESOLUTIONS,
  STORY_LENGTHS,
  VIDEO_MODELS,
} from "@/lib/constants";
import { sanitizeUserPrompt } from "@/lib/prompt-sanitize";
import { outlineStory } from "@/lib/story/outliner";
import { getErrorMessage, jsonError, jsonOk } from "@/lib/server-utils";

export const runtime = "nodejs";
export const maxDuration = 120;

const OutlineSchema = z.object({
  prompt: z.string().min(10).max(PROMPT_MAX_CHARS),
  language: z.enum(INDIC_LANGUAGES.map((l) => l.value) as [string, ...string[]]),
  storyLength: z.enum(STORY_LENGTHS),
  mode: z.enum(GENERATION_MODES),
  stylePack: z.string().min(1),
  model: z.enum(VIDEO_MODELS.map((m) => m.value) as [string, ...string[]]),
  resolution: z.enum(RESOLUTIONS),
  aspectRatio: z.enum(ASPECT_RATIOS),
  references: z.object({
    images: z.array(z.any()).default([]),
    videos: z.array(z.any()).default([]),
    audios: z.array(z.any()).default([]),
  }),
});

export async function POST(request: NextRequest): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Body must be valid JSON.", 400);
  }
  if (body && typeof body === "object" && "prompt" in body && typeof (body as { prompt: unknown }).prompt === "string") {
    const b = body as { prompt: string };
    b.prompt = sanitizeUserPrompt(b.prompt, PROMPT_MAX_CHARS);
  }
  const parsed = OutlineSchema.safeParse(body);
  if (!parsed.success) {
    const paths = new Set(parsed.error.issues.map((i) => i.path.join(".")));
    const friendly =
      paths.has("prompt") && parsed.error.issues.every((i) => i.path[0] === "prompt")
        ? "That prompt is too short after cleanup. Add a bit more detail and try again."
        : "Something in the request does not match the form (language, model, or story settings). Refresh the page and try again.";
    return jsonError(friendly, 400);
  }
  try {
    const result = await outlineStory(parsed.data as never);
    return jsonOk(result);
  } catch (err) {
    const raw = getErrorMessage(err);
    const soft =
      raw.includes("Outline JSON parse failed") || raw.includes("Unterminated string")
        ? "The planner response was cut off (usually a very long brief). Try a slightly shorter prompt, or split camera/lighting into shorter sentences."
        : raw;
    return jsonError(soft, 502);
  }
}

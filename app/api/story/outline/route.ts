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
  RESOLUTIONS,
  STORY_LENGTHS,
  VIDEO_MODELS,
} from "@/lib/constants";
import { outlineStory } from "@/lib/story/outliner";
import { getErrorMessage, jsonError, jsonOk } from "@/lib/server-utils";

export const runtime = "nodejs";
export const maxDuration = 60;

const OutlineSchema = z.object({
  prompt: z.string().min(10).max(4000),
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
  const parsed = OutlineSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.issues.map((i) => i.message).join("; "), 400);
  }
  try {
    const result = await outlineStory(parsed.data as never);
    return jsonOk(result);
  } catch (err) {
    return jsonError(getErrorMessage(err), 502);
  }
}

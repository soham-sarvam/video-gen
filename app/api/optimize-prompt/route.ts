import type { NextRequest } from "next/server";
import { optimizePrompt } from "@/lib/gemini-client";
import { PROMPT_MAX_CHARS } from "@/lib/constants";
import { sanitizeUserPrompt } from "@/lib/prompt-sanitize";
import { optimizePromptSchema } from "@/lib/validation";
import { getErrorMessage, jsonError, jsonOk } from "@/lib/server-utils";
import type {
  IndicLanguageCode,
  Duration,
} from "@/lib/constants";
import type { OptimizePromptResponse } from "@/lib/types";

export const runtime = "nodejs";
// Gemini calls can take >5s for long prompts.
export const maxDuration = 60;

export async function POST(request: NextRequest): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Request body must be valid JSON.", 400);
  }
  if (body && typeof body === "object" && "rawPrompt" in body && typeof (body as { rawPrompt: unknown }).rawPrompt === "string") {
    const b = body as { rawPrompt: string };
    b.rawPrompt = sanitizeUserPrompt(b.rawPrompt, PROMPT_MAX_CHARS);
  }

  const parsed = optimizePromptSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError("Could not optimise that prompt. Check length and language, then try again.", 400);
  }

  try {
    const result: OptimizePromptResponse = await optimizePrompt({
      rawPrompt: parsed.data.rawPrompt,
      // Zod narrows these to plain string from `z.enum(...)` — assert back to
      // our literal-union types so the optimizer keeps strict typing.
      language: parsed.data.language as IndicLanguageCode,
      duration: parsed.data.duration as Duration,
      stylePack: parsed.data.stylePack,
      storyLength: parsed.data.storyLength,
      referenceImages: parsed.data.referenceImages,
      referenceVideos: parsed.data.referenceVideos,
      referenceAudios: parsed.data.referenceAudios,
    });
    return jsonOk(result);
  } catch (error: unknown) {
    return jsonError(`Prompt optimization failed: ${getErrorMessage(error)}`, 502);
  }
}

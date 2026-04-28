import type { NextRequest } from "next/server";
import { optimizePrompt } from "@/lib/gemini-client";
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

  const parsed = optimizePromptSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.issues.map((i) => i.message).join("; "), 400);
  }

  try {
    const result: OptimizePromptResponse = await optimizePrompt({
      rawPrompt: parsed.data.rawPrompt,
      // Zod narrows these to plain string from `z.enum(...)` — assert back to
      // our literal-union types so the optimizer keeps strict typing.
      language: parsed.data.language as IndicLanguageCode,
      duration: parsed.data.duration as Duration,
      referenceImages: parsed.data.referenceImages,
      referenceVideos: parsed.data.referenceVideos,
      referenceAudios: parsed.data.referenceAudios,
      // editContext is the editor-only payload: original generation
      // prompt + base64'd boundary frames. Absent → text-only behaviour
      // (the original generation flow). Present → Gemini gets pixels.
      editContext: parsed.data.editContext,
    });
    return jsonOk(result);
  } catch (error: unknown) {
    return jsonError(`Prompt optimization failed: ${getErrorMessage(error)}`, 502);
  }
}

/**
 * POST /api/story/character-sheet
 *
 * Body: { outline: StoryOutline, references: { images, videos, audios } }
 * Generates a Nano Banana Pro character sheet (or signals "use uploaded
 * images") so the UI can preview the canonical character before the user
 * approves a multi-beat run.
 *
 * Story Mode only — single-clip generations don't need a sheet because
 * there's no cross-beat identity drift to lock down.
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { prepareCharacterSheets } from "@/lib/story/character-sheet";
import { getErrorMessage, getRequestOrigin, jsonError, jsonOk } from "@/lib/server-utils";

export const runtime = "nodejs";
export const maxDuration = 60;

const Schema = z.object({
  outline: z.any(),
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
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.issues.map((i) => i.message).join("; "), 400);
  }
  try {
    const result = await prepareCharacterSheets({
      outline: parsed.data.outline,
      references: parsed.data.references,
      origin: getRequestOrigin(request),
    });
    return jsonOk({
      profiles: result.profiles,
      source: result.source,
      beatCharacterMap: result.beatCharacterMap,
    });
  } catch (err) {
    return jsonError(`Character sheet generation failed: ${getErrorMessage(err)}`, 502);
  }
}

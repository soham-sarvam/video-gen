/**
 * POST /api/story/submit
 *
 * Body: { outline: StoryOutline, model: VideoModelId, references: { images, videos, audios } }
 *
 * Kicks off the runner in the background, returns immediately with
 * { storyId }. The browser polls /api/story/status?storyId=... for progress.
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { getVideoModelById } from "@/lib/constants";
import { pickRunner } from "@/lib/story/runners";
import { writeState } from "@/lib/story/archive";
import { getCachedVoice } from "@/lib/voice/voice-cache";
import { getErrorMessage, jsonError, jsonOk } from "@/lib/server-utils";

export const runtime = "nodejs";
export const maxDuration = 30;

const SubmitSchema = z.object({
  outline: z.any(),
  model: z.string(),
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
  const parsed = SubmitSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.issues.map((i) => i.message).join("; "), 400);
  }
  const { outline, model: modelId, references } = parsed.data;

  let model;
  try {
    model = getVideoModelById(modelId);
  } catch (err) {
    return jsonError(getErrorMessage(err), 400);
  }

  // Look up or generate the canonical voice WAV/MP3; pick the FAL or KIE
  // URL depending on the active provider.
  let voiceUrl: string;
  try {
    const voice = await getCachedVoice({
      languageCode: outline.language,
      speaker: outline.voiceTimbreSpeaker,
    });
    voiceUrl = (model.provider === "kie" ? voice.cdnUrls.kie : voice.cdnUrls.fal) ?? "";
    if (!voiceUrl) throw new Error("Voice CDN upload failed for active provider.");
  } catch (err) {
    return jsonError(`Voice prep failed: ${getErrorMessage(err)}`, 502);
  }

  // Persist initial state immediately so /status has something to read.
  await writeState(model.provider, outline.storyId, {
    ...outline,
    beats: outline.beats.map((b: { index: number }) => ({
      ...b,
      status: "queued",
      taskId: "",
      fullPrompt: "",
      tier: "fresh",
    })),
    stitchStatus: "pending",
  });

  // Fire-and-forget the runner. We don't await it — the route returns
  // immediately after kicking it off. state.json is the contract for /status.
  const runner = pickRunner(outline.mode);
  void runner
    .run({
      outline,
      model,
      references,
      voiceTimbreCdnUrl: voiceUrl,
    })
    .catch(async (err) => {
      const failureState = {
        ...outline,
        beats: outline.beats,
        stitchStatus: "failed" as const,
        failure: { stage: "runner", message: getErrorMessage(err) },
      };
      await writeState(model.provider, outline.storyId, failureState).catch(
        () => undefined,
      );
    });

  return jsonOk({ storyId: outline.storyId, model: modelId });
}

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
import { prepareCharacterSheet } from "@/lib/story/character-sheet";
import { getCachedVoice } from "@/lib/voice/voice-cache";
import {
  getErrorMessage,
  getRequestOrigin,
  jsonError,
  jsonOk,
} from "@/lib/server-utils";
import type { UploadedAsset } from "@/lib/types";

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
  /** Pre-generated character sheet from /api/story/character-sheet, if any. */
  characterSheetAsset: z.any().optional(),
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
  const { outline, model: modelId, references, characterSheetAsset } = parsed.data;
  const origin = getRequestOrigin(request);

  let model;
  try {
    model = getVideoModelById(modelId);
  } catch (err) {
    return jsonError(getErrorMessage(err), 400);
  }

  // Voice timbre source policy:
  //   1. If the user uploaded a reference audio, use its FIRST entry as @audio1
  //      (the user's voice — exactly what Seedance should imitate for lip-sync).
  //   2. Only fall back to a Bulbul-generated cached sample when the user
  //      uploaded no audio at all.
  //
  // When (1) wins, that audio is REMOVED from `references.audios` before being
  //   passed to the runner so it doesn't get duplicated as @audio2 on top of
  //   @audio1 — Seedance has a 3-audio cap and we don't want to waste a slot.
  let voiceUrl: string;
  let runnerAudios = references.audios;
  try {
    const userAudio = references.audios?.[0];
    const userAudioCdn = userAudio?.cdnUrls?.[model.provider];
    if (userAudioCdn) {
      voiceUrl = userAudioCdn;
      runnerAudios = references.audios.slice(1);
    } else {
      const voice = await getCachedVoice({
        languageCode: outline.language,
        speaker: outline.voiceTimbreSpeaker,
      });
      voiceUrl =
        (model.provider === "kie" ? voice.cdnUrls.kie : voice.cdnUrls.fal) ?? "";
      if (!voiceUrl) {
        throw new Error("Voice CDN upload failed for active provider.");
      }
    }
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
  // Character sheet prep also runs in the fire-and-forget block so it
  // doesn't push us past the 30s submit budget.
  const runner = pickRunner(outline.mode);
  void (async () => {
    let runnerImages: UploadedAsset[] = references.images;
    if (characterSheetAsset && characterSheetAsset.cdnUrls) {
      runnerImages = [characterSheetAsset as UploadedAsset, ...references.images];
    } else if (references.images.length === 0) {
      try {
        const prep = await prepareCharacterSheet({
          outline,
          references: { ...references, audios: runnerAudios },
          origin,
        });
        if (prep.asset) runnerImages = [prep.asset];
      } catch (err) {
        // Non-fatal — proceed without a sheet rather than failing the run.
        console.warn(
          `[story/submit] character sheet prep failed: ${getErrorMessage(err)}`,
        );
      }
    }

    await runner
      .run({
        outline,
        model,
        references: {
          ...references,
          images: runnerImages,
          audios: runnerAudios,
        },
        voiceTimbreCdnUrl: voiceUrl,
      })
      .catch(async (err) => {
      // Preserve whatever the runner had already written to state.json — it
      // includes the failing beat's taskId, fullPrompt, and prior completed
      // beats. Falling back to raw outline beats erases that diagnostic info.
      const { readState } = await import("@/lib/story/archive");
      const current = await readState<typeof outline & { beats: typeof outline.beats }>(
        model.provider,
        outline.storyId,
      ).catch(() => null);
      const failureState = {
        ...(current ?? { ...outline, beats: outline.beats }),
        stitchStatus: "failed" as const,
        failure: { stage: "runner", message: getErrorMessage(err) },
      };
      await writeState(model.provider, outline.storyId, failureState).catch(
        () => undefined,
      );
    });
  })();

  return jsonOk({ storyId: outline.storyId, model: modelId });
}

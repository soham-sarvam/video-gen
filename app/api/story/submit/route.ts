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
import { prepareCharacterSheets } from "@/lib/story/character-sheet";
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
  /** @deprecated Legacy single-sheet path. Use characterProfiles instead. */
  characterSheetAsset: z.any().optional(),
  /** Plan-time character profiles from /api/story/character-sheet (preferred). */
  characterProfiles: z.array(z.any()).default([]),
  /** When false (default), skip Bulbul voice timbre to avoid KIE processing errors. */
  useVoiceTimbre: z.boolean().default(false),
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
  const { outline, model: modelId, references, characterSheetAsset, characterProfiles: planProfiles, useVoiceTimbre } = parsed.data;
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
  //   2. If useVoiceTimbre is enabled, fall back to a Bulbul-generated cached
  //      sample when the user uploaded no audio at all.
  //   3. Otherwise (default), skip voice timbre entirely to avoid KIE
  //      "File processing failed" errors caused by the calibration audio.
  let voiceUrl = "";
  let runnerAudios = references.audios;
  try {
    const userAudio = references.audios?.[0];
    const userAudioCdn = userAudio?.cdnUrls?.[model.provider];
    if (userAudioCdn) {
      voiceUrl = userAudioCdn;
      runnerAudios = references.audios.slice(1);
    } else if (useVoiceTimbre) {
      const voice = await getCachedVoice({
        languageCode: outline.language,
        speaker: outline.voiceTimbreSpeaker,
      });
      voiceUrl =
        (model.provider === "kie" ? voice.cdnUrls.kie : voice.cdnUrls.fal) ?? "";
      if (!voiceUrl) {
        console.warn("[story/submit] Voice CDN upload failed — continuing without voice timbre.");
      }
    }
  } catch (err) {
    console.warn(`[story/submit] Voice prep failed — continuing without: ${getErrorMessage(err)}`);
    voiceUrl = "";
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
  //
  // Character sheet resolution priority:
  //   1. Plan-time profiles (from /api/story/character-sheet, sent as characterProfiles)
  //   2. Legacy single-sheet asset (characterSheetAsset, deprecated)
  //   3. Auto-generate via prepareCharacterSheets (only if no user images and no plan-time profiles)
  const runner = pickRunner(outline.mode);
  void (async () => {
    let runnerImages: UploadedAsset[] = references.images;
    let characterProfilesForState: import("@/lib/story/types").CharacterProfile[] | undefined;

    // --- 1. Reuse plan-time profiles (preferred: avoids re-generating sheets) ---
    const typedPlanProfiles = planProfiles as import("@/lib/story/types").CharacterProfile[];
    const planAssets = typedPlanProfiles
      .filter((p) => p.asset && p.asset.cdnUrls)
      .map((p) => p.asset!);

    if (planAssets.length > 0) {
      runnerImages = [...(planAssets as UploadedAsset[]), ...references.images];
      characterProfilesForState = typedPlanProfiles.map(({ asset: _a, ...rest }) => rest);
      console.log(`[story/submit] Reusing ${planAssets.length} plan-time character sheet(s).`);
    } else if (characterSheetAsset && characterSheetAsset.cdnUrls) {
      // --- 2. Legacy single-sheet path ---
      runnerImages = [characterSheetAsset as UploadedAsset, ...references.images];
    } else if (references.images.length === 0) {
      // --- 3. Auto-generate (no plan-time profiles and no user images) ---
      try {
        const prep = await prepareCharacterSheets({
          outline,
          references: { ...references, audios: runnerAudios },
          origin,
        });
        if (prep.profiles.length > 0) {
          const sheetAssets = prep.profiles
            .filter((p) => p.asset)
            .map((p) => p.asset!);
          runnerImages = [...sheetAssets, ...references.images];
          characterProfilesForState = prep.profiles.map(({ asset: _a2, ...rest }) => rest);

          for (const [idx, charIds] of Object.entries(prep.beatCharacterMap)) {
            const beat = outline.beats.find((b: { index: number }) => b.index === Number(idx));
            if (beat) beat.characterIds = charIds;
          }
        }
      } catch (err) {
        console.warn(
          `[story/submit] character sheet prep failed: ${getErrorMessage(err)}`,
        );
      }
    }

    // Persist character profiles to state.json
    if (characterProfilesForState && characterProfilesForState.length > 0) {
      const { readState: rs } = await import("@/lib/story/archive");
      const cur = await rs(model.provider, outline.storyId).catch(() => null);
      if (cur && typeof cur === "object") {
        await writeState(model.provider, outline.storyId, {
          ...cur,
          characterProfiles: characterProfilesForState,
          characterSheetUrl: characterProfilesForState[0]?.sheetUrl,
        }).catch(() => undefined);
      }
    }

    // Build labels for @image1…@imageN so the prompt tells the model
    // what each reference slot contains (e.g. "Character sheet for The Young Girl").
    const imageLabels: string[] = [];
    if (characterProfilesForState) {
      for (const p of characterProfilesForState) {
        if (p.sheetUrl) imageLabels.push(`Character reference sheet for "${p.name}"`);
      }
    } else if (characterSheetAsset?.cdnUrls) {
      imageLabels.push("Character reference sheet");
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
        imageLabels,
      })
      .catch(async (err) => {
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

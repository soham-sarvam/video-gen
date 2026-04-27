import type { NextRequest } from "next/server";
import { submitSeedanceJob } from "@/lib/fal-client";
import {
  generateVideoSchema,
  validateAssetBundle,
  validatePromptReferences,
} from "@/lib/validation";
import { getErrorMessage, jsonError, jsonOk } from "@/lib/server-utils";
import type {
  AspectRatio,
  Duration,
  FalModelId,
  Resolution,
} from "@/lib/constants";
import type { SubmitGenerationResponse } from "@/lib/types";

export const runtime = "nodejs";
// Submission is fast (~2-5s) — we just hand the job to FAL's queue and
// return the request_id. The browser then polls /api/generation-status.
export const maxDuration = 60;

export async function POST(request: NextRequest): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Request body must be valid JSON.", 400);
  }

  const parsed = generateVideoSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.issues.map((i) => i.message).join("; "), 400);
  }
  const data = parsed.data;

  // Defense-in-depth: re-run @-reference checks even though the client
  // already validated. The prompt is the trust boundary for FAL spend.
  const refErrors = validatePromptReferences(data.prompt, {
    images: data.referenceImageUrls.length,
    videos: data.referenceVideoUrls.length,
    audios: data.referenceAudioUrls.length,
  });
  if (refErrors.length) {
    return jsonError(`Prompt validation failed: ${refErrors.join(" | ")}`, 400);
  }

  const bundleErrors = validateAssetBundle({
    images: { length: data.referenceImageUrls.length },
    videos: { length: data.referenceVideoUrls.length },
    audios: { length: data.referenceAudioUrls.length },
  });
  if (bundleErrors.length) {
    return jsonError(bundleErrors.join(" | "), 400);
  }

  try {
    const { requestId } = await submitSeedanceJob({
      prompt: data.prompt,
      model: data.model as FalModelId,
      resolution: data.resolution as Resolution,
      aspectRatio: data.aspectRatio as AspectRatio,
      duration: data.duration as Duration,
      generateAudio: data.generateAudio,
      seed: data.seed,
      referenceImageUrls: data.referenceImageUrls,
      referenceVideoUrls: data.referenceVideoUrls,
      referenceAudioUrls: data.referenceAudioUrls,
    });

    const payload: SubmitGenerationResponse = {
      requestId,
      model: data.model as FalModelId,
    };
    return jsonOk(payload);
  } catch (error: unknown) {
    return jsonError(`Submission failed: ${getErrorMessage(error)}`, 502);
  }
}

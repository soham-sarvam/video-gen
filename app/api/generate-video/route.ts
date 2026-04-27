import type { NextRequest } from "next/server";
import {
  type AspectRatio,
  type Duration,
  getVideoModelById,
  isResolutionAllowed,
  type Resolution,
  type VideoModelId,
} from "@/lib/constants";
import { getProvider } from "@/lib/providers";
import type { GenerationInput } from "@/lib/providers/types";
import type { SubmitGenerationResponse, UploadedAsset } from "@/lib/types";
import {
  generateVideoSchema,
  validateAssetBundle,
  validatePromptReferences,
} from "@/lib/validation";
import { getErrorMessage, jsonError, jsonOk } from "@/lib/server-utils";

export const runtime = "nodejs";
// Submission is fast (~2-5s) — we just hand the job to the provider's queue
// and return the taskId. The browser then polls /api/generation-status.
export const maxDuration = 60;

/**
 * Pull the right CDN URL out of an asset for the active provider.
 * Throws if the provider's URL isn't present (means the storage upload
 * failed at upload time and the user needs to re-upload).
 */
function pickProviderUrl(
  cdnUrls: UploadedAsset["cdnUrls"],
  provider: "fal" | "kie",
): string {
  const url = cdnUrls[provider];
  if (!url) {
    throw new Error(
      `Reference is missing a ${provider.toUpperCase()} CDN URL — re-upload the file.`,
    );
  }
  return url;
}

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

  // Resolve model and enforce per-tier resolution cap server-side.
  let model: ReturnType<typeof getVideoModelById>;
  try {
    model = getVideoModelById(data.model);
  } catch (err) {
    return jsonError(getErrorMessage(err), 400);
  }
  if (!isResolutionAllowed(data.resolution as Resolution, model.maxResolution)) {
    return jsonError(
      `Model "${model.label}" supports up to ${model.maxResolution}; got ${data.resolution}.`,
      400,
    );
  }

  // Defense-in-depth: re-run @-reference and bundle checks server-side.
  const refErrors = validatePromptReferences(data.prompt, {
    images: data.referenceImages.length,
    videos: data.referenceVideos.length,
    audios: data.referenceAudios.length,
  });
  if (refErrors.length) {
    return jsonError(`Prompt validation failed: ${refErrors.join(" | ")}`, 400);
  }
  const bundleErrors = validateAssetBundle({
    images: { length: data.referenceImages.length },
    videos: { length: data.referenceVideos.length },
    audios: { length: data.referenceAudios.length },
  });
  if (bundleErrors.length) {
    return jsonError(bundleErrors.join(" | "), 400);
  }

  // Build provider-agnostic GenerationInput, mapping per-asset URLs from the
  // bundle of provider CDN URLs each asset carries.
  let input: GenerationInput;
  try {
    input = {
      model,
      prompt: data.prompt,
      resolution: data.resolution as Resolution,
      aspectRatio: data.aspectRatio as AspectRatio,
      duration: data.duration as Duration,
      generateAudio: data.generateAudio,
      webSearch: model.supportsWebSearch ? data.webSearch ?? false : undefined,
      seed: data.seed,
      imageUrls: data.referenceImages.map((a) =>
        pickProviderUrl(a.cdnUrls, model.provider),
      ),
      videoUrls: data.referenceVideos.map((a) =>
        pickProviderUrl(a.cdnUrls, model.provider),
      ),
      audioUrls: data.referenceAudios.map((a) =>
        pickProviderUrl(a.cdnUrls, model.provider),
      ),
    };
  } catch (err) {
    return jsonError(getErrorMessage(err), 400);
  }

  try {
    const provider = getProvider(model);
    const { taskId } = await provider.submit(input);
    const payload: SubmitGenerationResponse = {
      taskId,
      model: data.model as VideoModelId,
    };
    return jsonOk(payload);
  } catch (error: unknown) {
    return jsonError(`Submission failed: ${getErrorMessage(error)}`, 502);
  }
}

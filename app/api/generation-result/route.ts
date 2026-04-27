/**
 * Proxies the active provider's result endpoint. Called by the client
 * once the status poll returns `status === "completed"`.
 *
 * After fetching the result we ALSO archive the generated video to local
 * disk under `public/uploads/generations/<provider>-<tier>-<taskId>.<ext>`
 * so the user has a copy that survives FAL/KIE's CDN TTL (3 days for KIE).
 * The archive is best-effort — if the download fails we still return the
 * original CDN URL so the UI keeps working.
 */
import type { NextRequest } from "next/server";
import { getVideoModelById } from "@/lib/constants";
import { archiveGeneratedVideo } from "@/lib/generation-archive";
import { getProvider } from "@/lib/providers";
import type { SeedanceVideoOutput } from "@/lib/types";
import { getErrorMessage, jsonError, jsonOk } from "@/lib/server-utils";

export const runtime = "nodejs";
// Archive download for a 1080p / 10s clip is typically <50 MB and finishes
// in 3-10s; keep some headroom.
export const maxDuration = 120;

export async function GET(request: NextRequest): Promise<Response> {
  const taskId =
    request.nextUrl.searchParams.get("taskId") ??
    request.nextUrl.searchParams.get("requestId");
  const modelId = request.nextUrl.searchParams.get("model");

  if (!taskId) return jsonError("taskId query parameter is required.", 400);
  if (!modelId) return jsonError("model query parameter is required.", 400);

  let model;
  try {
    model = getVideoModelById(modelId);
  } catch (err) {
    return jsonError(getErrorMessage(err), 400);
  }

  try {
    const provider = getProvider(model);
    const result = await provider.result(taskId, model);

    // Archive to local disk. Failures are NOT fatal — we still return the
    // upstream URL so the UI plays the video. The user just won't get an
    // offline copy in that case.
    let localUrl: string | null = null;
    try {
      const archive = await archiveGeneratedVideo(taskId, model, result.videoUrl);
      localUrl = archive.localUrl;
    } catch {
      // Best-effort archiving — swallow.
    }

    const payload: SeedanceVideoOutput = {
      videoUrl: result.videoUrl,
      seed: result.seed,
      localUrl,
    };
    return jsonOk(payload);
  } catch (err: unknown) {
    return jsonError(`Result fetch failed: ${getErrorMessage(err)}`, 502);
  }
}

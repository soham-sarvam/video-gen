/**
 * Proxies the active provider's status endpoint. Clients poll this every
 * ~2.5s while a generation job is running. Provider is determined by the
 * model id, so the same route handles both FAL and KIE jobs.
 *
 * https://fal.ai/models/bytedance/seedance-2.0/fast/reference-to-video/api#queue-status
 * KIE: GET /api/v1/common/get-task-detail?taskId=...
 */
import type { NextRequest } from "next/server";
import { getVideoModelById } from "@/lib/constants";
import { getProvider } from "@/lib/providers";
import type { GenerationStatus } from "@/lib/types";
import { getErrorMessage, jsonError, jsonOk } from "@/lib/server-utils";

export const runtime = "nodejs";
// Single HTTP round-trip to the provider — fast.
export const maxDuration = 30;

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
    const status = await provider.status(taskId, model);
    const payload: GenerationStatus = status;
    return jsonOk(payload);
  } catch (err: unknown) {
    return jsonError(`Status check failed: ${getErrorMessage(err)}`, 502);
  }
}

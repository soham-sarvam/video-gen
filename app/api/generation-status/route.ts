/**
 * Proxies fal.queue.status — clients poll this every ~2.5s while a
 * Seedance job is in progress.
 *
 * https://fal.ai/models/bytedance/seedance-2.0/fast/reference-to-video/api#queue-status
 */
import type { NextRequest } from "next/server";
import { getSeedanceJobStatus } from "@/lib/fal-client";
import {
  ALL_FAL_MODEL_IDS,
  type FalEditModelId,
  type FalModelId,
} from "@/lib/constants";
import { getErrorMessage, jsonError, jsonOk } from "@/lib/server-utils";

export const runtime = "nodejs";
// Status calls are fast — single HTTP round-trip to FAL.
export const maxDuration = 30;

// Accept generation AND edit model ids. The FAL queue API uses the
// same status/result shape regardless of which Seedance variant the
// job is running on, so one route serves both flows.
const MODEL_IDS: ReadonlySet<string> = new Set(ALL_FAL_MODEL_IDS);

export async function GET(request: NextRequest): Promise<Response> {
  const requestId = request.nextUrl.searchParams.get("requestId");
  const model = request.nextUrl.searchParams.get("model");

  if (!requestId) return jsonError("requestId query parameter is required.", 400);
  if (!model) return jsonError("model query parameter is required.", 400);
  if (!MODEL_IDS.has(model)) return jsonError(`Unknown model "${model}".`, 400);

  try {
    const status = await getSeedanceJobStatus(
      model as FalModelId | FalEditModelId,
      requestId,
    );
    return jsonOk(status);
  } catch (err: unknown) {
    return jsonError(`Status check failed: ${getErrorMessage(err)}`, 502);
  }
}

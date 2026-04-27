/**
 * Proxies fal.queue.result — called by the client once status === COMPLETED.
 *
 * https://fal.ai/models/bytedance/seedance-2.0/fast/reference-to-video/api#queue-result
 */
import type { NextRequest } from "next/server";
import { getSeedanceJobResult } from "@/lib/fal-client";
import { FAL_MODELS, type FalModelId } from "@/lib/constants";
import { getErrorMessage, jsonError, jsonOk } from "@/lib/server-utils";

export const runtime = "nodejs";
export const maxDuration = 60;

const MODEL_IDS: ReadonlySet<string> = new Set(FAL_MODELS.map((m) => m.value));

export async function GET(request: NextRequest): Promise<Response> {
  const requestId = request.nextUrl.searchParams.get("requestId");
  const model = request.nextUrl.searchParams.get("model");

  if (!requestId) return jsonError("requestId query parameter is required.", 400);
  if (!model) return jsonError("model query parameter is required.", 400);
  if (!MODEL_IDS.has(model)) return jsonError(`Unknown model "${model}".`, 400);

  try {
    const result = await getSeedanceJobResult(model as FalModelId, requestId);
    return jsonOk(result);
  } catch (err: unknown) {
    return jsonError(`Result fetch failed: ${getErrorMessage(err)}`, 502);
  }
}

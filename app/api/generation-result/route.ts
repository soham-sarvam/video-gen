/**
 * Proxies fal.queue.result — called by the client once status === COMPLETED.
 *
 * https://fal.ai/models/bytedance/seedance-2.0/fast/reference-to-video/api#queue-result
 */
import type { NextRequest } from "next/server";
import { getSeedanceJobResult } from "@/lib/fal-client";
import {
  ALL_FAL_MODEL_IDS,
  type FalEditModelId,
  type FalModelId,
} from "@/lib/constants";
import { getErrorMessage, jsonError, jsonOk } from "@/lib/server-utils";

export const runtime = "nodejs";
export const maxDuration = 60;

// Same model whitelist as /generation-status — generation + edit ids.
const MODEL_IDS: ReadonlySet<string> = new Set(ALL_FAL_MODEL_IDS);

export async function GET(request: NextRequest): Promise<Response> {
  const requestId = request.nextUrl.searchParams.get("requestId");
  const model = request.nextUrl.searchParams.get("model");

  if (!requestId) return jsonError("requestId query parameter is required.", 400);
  if (!model) return jsonError("model query parameter is required.", 400);
  if (!MODEL_IDS.has(model)) return jsonError(`Unknown model "${model}".`, 400);

  try {
    const result = await getSeedanceJobResult(
      model as FalModelId | FalEditModelId,
      requestId,
    );
    return jsonOk(result);
  } catch (err: unknown) {
    return jsonError(`Result fetch failed: ${getErrorMessage(err)}`, 502);
  }
}

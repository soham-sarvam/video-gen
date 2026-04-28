/**
 * GET /api/story/status?storyId=...&provider=...
 *
 * Reads state.json and returns the current StoryRun. Browser polls every ~3s.
 */
import type { NextRequest } from "next/server";
import { readState } from "@/lib/story/archive";
import type { Provider } from "@/lib/constants";
import type { StoryRun } from "@/lib/story/types";
import { jsonError, jsonOk } from "@/lib/server-utils";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(request: NextRequest): Promise<Response> {
  const storyId = request.nextUrl.searchParams.get("storyId");
  const provider = request.nextUrl.searchParams.get("provider") as Provider | null;
  if (!storyId) return jsonError("storyId is required.", 400);
  if (!provider || (provider !== "fal" && provider !== "kie")) {
    return jsonError("provider must be fal or kie.", 400);
  }
  const state = await readState<StoryRun>(provider, storyId);
  if (!state) return jsonError("storyId not found.", 404);
  return jsonOk(state);
}

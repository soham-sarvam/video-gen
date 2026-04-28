/**
 * GET /api/story/result?storyId=...&provider=...
 *
 * If state.json shows all beats completed but stitchStatus !== completed,
 * runs ffmpeg concat synchronously and writes final.mp4. Returns the run
 * with finalLocalUrl populated.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { nanoid } from "nanoid";
import type { NextRequest } from "next/server";
import { readState, writeFinalVideo, writeState } from "@/lib/story/archive";
import { stitchClips } from "@/lib/story/stitcher";
import type { Provider } from "@/lib/constants";
import type { StoryRun } from "@/lib/story/types";
import { getErrorMessage, jsonError, jsonOk } from "@/lib/server-utils";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: NextRequest): Promise<Response> {
  const storyId = request.nextUrl.searchParams.get("storyId");
  const provider = request.nextUrl.searchParams.get("provider") as Provider | null;
  if (!storyId) return jsonError("storyId is required.", 400);
  if (!provider || (provider !== "fal" && provider !== "kie")) {
    return jsonError("provider must be fal or kie.", 400);
  }
  const state = await readState<StoryRun>(provider, storyId);
  if (!state) return jsonError("storyId not found.", 404);

  const allCompleted = state.beats.every((b) => b.status === "completed");
  if (!allCompleted) return jsonOk(state);

  if (state.stitchStatus === "completed" && state.finalLocalUrl) {
    return jsonOk(state);
  }

  try {
    state.stitchStatus = "stitching";
    await writeState(provider, storyId, state);

    const inputPaths = state.beats
      .map((b) => b.diskPath)
      .filter((p): p is string => !!p);
    const tmpOut = path.join(tmpdir(), `stitch-${nanoid(8)}.mp4`);
    await stitchClips(inputPaths, tmpOut);
    const buf = await readFile(tmpOut);
    const url = await writeFinalVideo(provider, storyId, buf);
    state.finalLocalUrl = url;
    state.stitchStatus = "completed";
    await writeState(provider, storyId, state);
    return jsonOk(state);
  } catch (err) {
    state.stitchStatus = "failed";
    state.failure = { stage: "stitch", message: getErrorMessage(err) };
    await writeState(provider, storyId, state);
    return jsonError(getErrorMessage(err), 502);
  }
}

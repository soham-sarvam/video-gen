/**
 * Finalises a temporal-segment edit job once Seedance has completed
 * the regenerated segment.
 *
 * Triggered by the client after `/api/generation-status` reports
 * `COMPLETED`. We:
 *   1. Read the on-disk sidecar (paths to pre/sel/post + audio +
 *      source dims).
 *   2. Pull the regenerated segment URL from `fal.queue.result`.
 *   3. Download the new segment alongside the sidecar's other files.
 *   4. If Seedance returned a clip whose dims don't match the source
 *      (image-to-video maxes at 720p, so 1080p sources need scaling),
 *      run it through `normalizeToTargetDims` to bring it to source
 *      dims before concat.
 *   5. Mux audio per the chosen audioMode:
 *        keep_original       → mux saved sel-audio.m4a onto the new clip
 *        regenerate_seedance → use Seedance output as-is
 *        bulbul_dialogue     → mux saved bulbul.wav onto the new clip
 *   6. Concat pre + (final sel) + post into one MP4, copy to
 *      `public/uploads/edits/{editJobId}/final.mp4`.
 *   7. Update the sidecar with `status=finalized` + the public URL.
 *   8. Return `{ videoUrl, seed }` to the client.
 */
import { writeFile } from "node:fs/promises";
import path from "node:path";
import type { NextRequest } from "next/server";
import {
  EDIT_DIR_NAME,
  UPLOAD_DIR_NAME,
} from "@/lib/constants";
import {
  getEditJobDir,
  readEditJob,
  writeEditJob,
} from "@/lib/edit-job-store";
import {
  concatVideos,
  muxAudioOnto,
  normalizeToTargetDims,
} from "@/lib/ffmpeg-edit";
import { getSeedanceJobResult } from "@/lib/fal-client";
import { probeVideoDimensions } from "@/lib/media-probe";
import {
  getErrorMessage,
  jsonError,
  jsonOk,
} from "@/lib/server-utils";
import { editVideoFinalizeSchema } from "@/lib/validation";
import type { EditVideoFinalizeResponse } from "@/lib/types";

export const runtime = "nodejs";
// Download (1 round-trip) + 1–2 ffmpeg passes (mux + concat, plus an
// optional re-encode if dims need normalising). 90s leaves headroom
// for 1080p sources where the regen segment must be scaled up.
export const maxDuration = 90;

export async function POST(request: NextRequest): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Request body must be valid JSON.", 400);
  }

  const parsed = editVideoFinalizeSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.issues.map((i) => i.message).join("; "), 400);
  }

  let job;
  try {
    job = await readEditJob(parsed.data.editJobId);
  } catch (err: unknown) {
    return jsonError(getErrorMessage(err), 404);
  }

  if (job.status === "finalized" && job.finalVideoUrl) {
    // Idempotent: the client may double-call (e.g. on a flaky network)
    // — return the previously-finalised URL rather than re-running
    // ffmpeg or re-downloading from FAL.
    const payload: EditVideoFinalizeResponse = {
      videoUrl: job.finalVideoUrl,
      seed: null,
    };
    return jsonOk(payload);
  }

  try {
    // 1) Fetch FAL result.
    const falResult = await getSeedanceJobResult(
      job.falModel,
      job.falRequestId,
    );

    // 2) Download the new segment to the job dir.
    const jobDir = getEditJobDir(job.editJobId);
    const newSelRaw = path.join(jobDir, "new-sel-raw.mp4");
    const res = await fetch(falResult.videoUrl);
    if (!res.ok) {
      throw new Error(
        `Failed to download regenerated segment from FAL (${res.status} ${res.statusText}).`,
      );
    }
    const buf = Buffer.from(await res.arrayBuffer());
    await writeFile(newSelRaw, buf);

    // 3) Normalise dims if Seedance returned anything other than the
    //    source dims. Image-to-video is capped at 720p, so a 1080p
    //    source forces a scale-up here. We don't try to be clever
    //    about identical-dims early-exit when the codec/fps differ —
    //    a single re-encode pass keeps the concat input invariant.
    const newDims = await probeVideoDimensions(newSelRaw);
    let videoForAudioBranch = newSelRaw;
    if (
      !newDims ||
      newDims.width !== job.sourceWidth ||
      newDims.height !== job.sourceHeight
    ) {
      const normalized = path.join(jobDir, "new-sel-normalized.mp4");
      await normalizeToTargetDims(
        newSelRaw,
        job.sourceWidth,
        job.sourceHeight,
        normalized,
      );
      videoForAudioBranch = normalized;
    }

    // 4) Audio branch.
    let segmentForConcat = videoForAudioBranch;
    if (job.audioMode === "keep_original" && job.selAudioPath) {
      const muxed = path.join(jobDir, "new-sel-with-orig-audio.mp4");
      await muxAudioOnto(videoForAudioBranch, job.selAudioPath, muxed);
      segmentForConcat = muxed;
    } else if (job.audioMode === "bulbul_dialogue" && job.bulbulAudioPath) {
      const muxed = path.join(jobDir, "new-sel-with-bulbul.mp4");
      await muxAudioOnto(videoForAudioBranch, job.bulbulAudioPath, muxed);
      segmentForConcat = muxed;
    }
    // else regenerate_seedance — Seedance already owns the audio track.

    // 5) Concat pre + new sel + post (filtering out null pieces when
    //    the selection was at the head/tail of the source).
    const inputs = [job.prePath, segmentForConcat, job.postPath].filter(
      (p): p is string => Boolean(p),
    );
    const finalLocalPath = path.join(jobDir, "final.mp4");
    await concatVideos(inputs, finalLocalPath, jobDir);

    // 6) Make the final MP4 reachable from the browser. We keep it
    //    inside the job folder so all artefacts for one edit live
    //    together — easier to clean up later.
    const publicUrlPath = `/${UPLOAD_DIR_NAME}/${EDIT_DIR_NAME}/${job.editJobId}/final.mp4`;

    // 7) Update sidecar.
    await writeEditJob({
      ...job,
      status: "finalized",
      finalVideoUrl: publicUrlPath,
    });

    const payload: EditVideoFinalizeResponse = {
      videoUrl: publicUrlPath,
      seed: falResult.seed,
    };
    return jsonOk(payload);
  } catch (error: unknown) {
    // Surface the failure on the sidecar so a follow-up call can
    // decide whether to retry or just report the error to the user.
    try {
      await writeEditJob({ ...job, status: "failed" });
    } catch {
      // best-effort
    }
    return jsonError(`Edit finalization failed: ${getErrorMessage(error)}`, 502);
  }
}

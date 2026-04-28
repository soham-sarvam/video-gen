/**
 * Submits a temporal-segment edit job.
 *
 * Pipeline:
 *   1. Validate the request (Zod) and clamp the segment length to an
 *      integer in [EDIT_MIN_SEGMENT_S, EDIT_MAX_SEGMENT_S].
 *   2. Download the source MP4 to `public/uploads/edits/{editJobId}/`.
 *   3. Probe the actual source duration AND pixel dimensions with
 *      ffprobe — dims map to Seedance's resolution + aspect-ratio
 *      enums so the regenerated segment matches the unchanged
 *      pre/post slices for clean concat.
 *   4. Use FFmpeg to split into pre/sel/post (stream copy, no re-encode).
 *   5. Extract the first and last frame of `sel` as PNG.
 *   6. Branch on audioMode:
 *        keep_original       → extract original audio for later muxing
 *        regenerate_seedance → set generate_audio:true on the FAL call
 *        bulbul_dialogue     → call Sarvam Bulbul v3, save WAV for muxing
 *   7. Upload first/last frames to FAL storage (so Seedance can fetch).
 *   8. Submit `image-to-video` to FAL with the two frames as anchors.
 *   9. Persist a sidecar JSON with all paths, return the FAL requestId.
 *
 * The browser then polls `/api/generation-status` with this requestId
 * + the edit model id (whitelisted on that route), and when status
 * COMPLETED calls `/api/edit-video/finalize`.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { NextRequest } from "next/server";
import { nanoid } from "nanoid";
import {
  ALL_FAL_MODEL_IDS,
  DEFAULT_BULBUL_VOICE,
  EDIT_MAX_SEGMENT_S,
  EDIT_MAX_SOURCE_BYTES,
  EDIT_MIN_SEGMENT_S,
  type AspectRatio,
  type BulbulVoice,
  type EditAudioMode,
  type FalEditModelId,
  type IndicLanguageCode,
  type Resolution,
} from "@/lib/constants";
import {
  ensureEditJobDir,
  writeEditJob,
} from "@/lib/edit-job-store";
import {
  extractAudio,
  extractFirstFrame,
  extractLastFrame,
  splitForEdit,
} from "@/lib/ffmpeg-edit";
import {
  submitSeedanceEditJob,
  uploadFileToFalStorage,
} from "@/lib/fal-client";
import {
  snapAspectRatioForEdit,
  snapResolutionForEdit,
} from "@/lib/format-utils";
import {
  probeDurationSeconds,
  probeVideoDimensions,
} from "@/lib/media-probe";
import { synthesizeBulbul } from "@/lib/sarvam-client";
import {
  getErrorMessage,
  jsonError,
  jsonOk,
} from "@/lib/server-utils";
import { editVideoSubmitSchema } from "@/lib/validation";
import type {
  EditJob,
  EditVideoSubmitResponse,
} from "@/lib/types";

export const runtime = "nodejs";
// Slicing + (optional Bulbul call) + two FAL uploads + a FAL submit.
// Bulbul adds 2-5s; ffmpeg slicing is the slowest phase (~10–25s for
// a typical 60s 720p source).
export const maxDuration = 90;

const ALLOWED_MODEL_IDS: ReadonlySet<string> = new Set(ALL_FAL_MODEL_IDS);

interface DownloadResult {
  bytes: Buffer;
  mimeType: string;
}

async function downloadVideo(url: string): Promise<DownloadResult> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Source video fetch failed (${res.status} ${res.statusText}).`);
  }
  const contentLength = Number.parseInt(
    res.headers.get("content-length") ?? "0",
    10,
  );
  if (contentLength > EDIT_MAX_SOURCE_BYTES) {
    throw new Error(
      `Source video is ${(contentLength / (1024 * 1024)).toFixed(1)} MB; max allowed is ${EDIT_MAX_SOURCE_BYTES / (1024 * 1024)} MB.`,
    );
  }
  const arrayBuf = await res.arrayBuffer();
  if (arrayBuf.byteLength > EDIT_MAX_SOURCE_BYTES) {
    throw new Error("Source video exceeds the configured size limit.");
  }
  return {
    bytes: Buffer.from(arrayBuf),
    mimeType: res.headers.get("content-type") ?? "video/mp4",
  };
}

export async function POST(request: NextRequest): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Request body must be valid JSON.", 400);
  }

  const parsed = editVideoSubmitSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.issues.map((i) => i.message).join("; "), 400);
  }
  const data = parsed.data;

  // Defense-in-depth: schema enum already restricts this, but the route
  // shares model whitelisting with /generation-status, so stay consistent.
  if (!ALLOWED_MODEL_IDS.has(data.model)) {
    return jsonError(`Unknown model "${data.model}".`, 400);
  }

  const editJobId = nanoid(12);
  const jobDir = await ensureEditJobDir(editJobId);

  try {
    // 1) Download source.
    const { bytes } = await downloadVideo(data.sourceVideoUrl);
    const sourcePath = path.join(jobDir, "source.mp4");
    await writeFile(sourcePath, bytes);

    // 2) Probe true duration + pixel dims.
    const sourceDurationS = await probeDurationSeconds(sourcePath);
    if (sourceDurationS === null) {
      return jsonError(
        "Could not read the source video duration. The file may be corrupted.",
        400,
      );
    }
    if (data.segmentEndS > sourceDurationS + 0.05) {
      return jsonError(
        `Segment end (${data.segmentEndS}s) is past the source duration (${sourceDurationS.toFixed(2)}s).`,
        400,
      );
    }
    const dims = await probeVideoDimensions(sourcePath);
    if (!dims) {
      return jsonError(
        "Could not read source video dimensions; the file's video stream may be missing or corrupt.",
        400,
      );
    }

    // 3) Round the segment length to an integer in [4, 15] — Seedance's
    //    image-to-video duration enum only accepts integer strings.
    const rawLength = data.segmentEndS - data.segmentStartS;
    const segmentDurationS = Math.min(
      EDIT_MAX_SEGMENT_S,
      Math.max(EDIT_MIN_SEGMENT_S, Math.round(rawLength)),
    );
    const segmentStartS = data.segmentStartS;
    const segmentEndS = Math.min(
      sourceDurationS,
      segmentStartS + segmentDurationS,
    );

    // 4) Snap source dims onto the closest Seedance enums. We prefer
    //    explicit values over `auto` so the regenerated segment comes
    //    back at deterministic dimensions — easier to concat. The
    //    finalize route still re-checks and scales if Seedance ignored
    //    the hint and capped at 720p (the image-to-video ceiling).
    const seedanceResolution: Resolution =
      data.resolution ?? snapResolutionForEdit(dims.height);
    const seedanceAspectRatio: AspectRatio =
      data.aspectRatio ?? snapAspectRatioForEdit(dims.width, dims.height);

    // 5) Slice into pre/sel/post.
    const { prePath, selPath, postPath } = await splitForEdit(
      sourcePath,
      segmentStartS,
      segmentEndS,
      jobDir,
      sourceDurationS,
    );

    // 6) Extract first + last frame.
    //    - extractFirstFrame uses output-seek to decode from t=0
    //      reliably even when the slice's timestamps don't begin at 0.
    //    - extractLastFrame uses `-sseof -1 -update 1` to grab the
    //      literal last decoded frame, side-stepping the keyframe-snap
    //      footgun that made the naive `-ss (dur - 0.04)` approach
    //      silently produce no output on stream-copied slices.
    const firstFramePath = path.join(jobDir, "first.png");
    const lastFramePath = path.join(jobDir, "last.png");
    await extractFirstFrame(selPath, firstFramePath);
    await extractLastFrame(selPath, lastFramePath);

    // 7) Audio mode branch.
    //    - keep_original   → save the source segment's audio for later mux
    //    - regen_seedance  → no local audio prep; FAL call carries the flag
    //    - bulbul_dialogue → synthesise WAV via Sarvam, save for later mux
    const audioMode: EditAudioMode = data.audioMode;
    let selAudioPath: string | null = null;
    let bulbulAudioPath: string | null = null;
    let generateAudioOnFal = false;

    if (audioMode === "keep_original") {
      selAudioPath = await extractAudio(
        selPath,
        path.join(jobDir, "sel-audio.m4a"),
      );
      // If the source has no audio stream, falling back to a silent
      // overlay is a sensible default — matches what the original had.
    } else if (audioMode === "regenerate_seedance") {
      generateAudioOnFal = true;
    } else if (audioMode === "bulbul_dialogue") {
      // Schema already guarantees these are present when audioMode is
      // bulbul_dialogue; the casts are just to satisfy the type system.
      const bulbulOut = path.join(jobDir, "bulbul.wav");
      await synthesizeBulbul({
        text: data.bulbulText as string,
        language: data.bulbulLanguage as IndicLanguageCode,
        speaker: (data.bulbulVoice as BulbulVoice | undefined) ?? DEFAULT_BULBUL_VOICE,
        outPath: bulbulOut,
      });
      bulbulAudioPath = bulbulOut;
    }

    // 8) Upload frames to FAL storage so the FAL inference servers can
    //    fetch them. Mirrors the pattern in lib/upload-utils.ts where
    //    we hand FAL CDN URLs (not localhost URLs) for inference inputs.
    const firstFrameBuf = await readFile(firstFramePath);
    const lastFrameBuf = await readFile(lastFramePath);
    const firstFrameFile = new File([firstFrameBuf], "first.png", {
      type: "image/png",
    });
    const lastFrameFile = new File([lastFrameBuf], "last.png", {
      type: "image/png",
    });
    const [firstFrameUrl, lastFrameUrl] = await Promise.all([
      uploadFileToFalStorage(firstFrameFile),
      uploadFileToFalStorage(lastFrameFile),
    ]);

    // 9) Submit Seedance image-to-video.
    const { requestId } = await submitSeedanceEditJob({
      prompt: data.prompt,
      model: data.model as FalEditModelId,
      firstFrameUrl,
      lastFrameUrl,
      durationSeconds: segmentDurationS,
      generateAudio: generateAudioOnFal,
      resolution: seedanceResolution,
      aspectRatio: seedanceAspectRatio,
    });

    // 10) Persist sidecar — finalize reads this to find every
    //     intermediate path it needs to mux + concat back together.
    const job: EditJob = {
      editJobId,
      sourceVideoUrl: data.sourceVideoUrl,
      segmentStartS,
      segmentEndS,
      segmentDurationS,
      audioMode,
      prePath,
      selPath,
      postPath,
      selAudioPath,
      bulbulAudioPath,
      firstFrameUrl,
      lastFrameUrl,
      sourceWidth: dims.width,
      sourceHeight: dims.height,
      seedanceResolution,
      seedanceAspectRatio,
      falRequestId: requestId,
      falModel: data.model as FalEditModelId,
      status: "submitted",
      createdAt: new Date().toISOString(),
    };
    await writeEditJob(job);

    const payload: EditVideoSubmitResponse = {
      editJobId,
      requestId,
      model: data.model as FalEditModelId,
      segmentDurationS,
    };
    return jsonOk(payload);
  } catch (error: unknown) {
    return jsonError(
      `Edit submission failed: ${getErrorMessage(error)}`,
      502,
    );
  }
}

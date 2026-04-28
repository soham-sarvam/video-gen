/**
 * Server-only FFmpeg helpers for the segment editor.
 *
 * Why we spawn the binary directly (no fluent-ffmpeg or similar):
 *   - The same pattern as `media-probe.ts`'s ffprobe wrapper — keeps
 *     the dependency surface tiny.
 *   - Lets us pass exact args (`-c copy`, `-async 1`, etc.) without a
 *     wrapper API translating them lossily.
 *   - Bundled via `ffmpeg-static`, so deployments don't need a system
 *     ffmpeg install.
 *
 * Design notes:
 *   - Slicing and concat use `-c copy` (stream copy) — no re-encode,
 *     fast, lossless. The only exception is when we mux original audio
 *     onto the regenerated segment (audio codec + container shifts can
 *     force a re-encode).
 *   - All operations are async and surface stderr in errors so debugging
 *     a failed edit doesn't require reading server logs.
 */
import { spawn } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import ffmpegStatic from "ffmpeg-static";

/**
 * Mirror of `resolveFfprobePath()` from media-probe.ts. Turbopack can
 * rewrite `__dirname` inside `ffmpeg-static` to a path under `.next/`
 * where the binary doesn't actually live; fall back to the canonical
 * node_modules layout.
 */
function resolveFfmpegPath(): string {
  const reported: string | null = (ffmpegStatic as unknown as string) ?? null;
  if (reported && existsSync(reported)) return reported;

  const binName = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
  const fallback = path.join(
    process.cwd(),
    "node_modules",
    "ffmpeg-static",
    binName,
  );
  return fallback;
}

const FFMPEG_PATH: string = resolveFfmpegPath();

interface RunResult {
  stdout: string;
  stderr: string;
}

function runFfmpeg(args: string[]): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const proc = spawn(FFMPEG_PATH, args, { windowsHide: true });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    proc.on("error", (err) => reject(err));
    proc.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        // ffmpeg writes everything we care about (errors AND progress)
        // to stderr. Truncate so we don't dump megabytes back to the
        // route handler.
        reject(
          new Error(
            `ffmpeg exited ${code}: ${stderr.slice(-1000) || "no stderr"}`,
          ),
        );
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface SplitForEditResult {
  /** Path to the slice [0, segmentStartS), or null when start === 0. */
  prePath: string | null;
  /** Path to the slice [segmentStartS, segmentEndS) — the part we regen. */
  selPath: string;
  /** Path to the slice [segmentEndS, end), or null when the selection ends at the source's end. */
  postPath: string | null;
}

/**
 * Splits the source MP4 into up to three pieces using stream copy.
 * Stream copy means no re-encode, so this is fast and lossless, but the
 * cut times are nudged to the nearest keyframe by ffmpeg internally.
 * We accept that — the segment we regenerate gets first/last frames
 * extracted at the SAME nudged boundaries below, so the eventual concat
 * lines up.
 */
export async function splitForEdit(
  sourcePath: string,
  segmentStartS: number,
  segmentEndS: number,
  outDir: string,
  sourceDurationS: number,
): Promise<SplitForEditResult> {
  const selPath = path.join(outDir, "sel.mp4");
  const prePath = segmentStartS > 0 ? path.join(outDir, "pre.mp4") : null;
  const postPath =
    segmentEndS < sourceDurationS - 0.1 ? path.join(outDir, "post.mp4") : null;

  // Selected segment.
  await runFfmpeg([
    "-y",
    "-ss",
    segmentStartS.toString(),
    "-to",
    segmentEndS.toString(),
    "-i",
    sourcePath,
    "-c",
    "copy",
    "-avoid_negative_ts",
    "make_zero",
    selPath,
  ]);

  if (prePath) {
    await runFfmpeg([
      "-y",
      "-ss",
      "0",
      "-to",
      segmentStartS.toString(),
      "-i",
      sourcePath,
      "-c",
      "copy",
      "-avoid_negative_ts",
      "make_zero",
      prePath,
    ]);
  }

  if (postPath) {
    await runFfmpeg([
      "-y",
      "-ss",
      segmentEndS.toString(),
      "-i",
      sourcePath,
      "-c",
      "copy",
      "-avoid_negative_ts",
      "make_zero",
      postPath,
    ]);
  }

  return { prePath, selPath, postPath };
}

/**
 * Throws a clear error if ffmpeg "succeeded" (exit 0) but didn't
 * actually write the expected output. ffmpeg silently produces nothing
 * when its filter graph yields zero frames — most often when the seek
 * lands past the last decodable frame in a stream-copied slice.
 */
function assertWritten(outPath: string, context: string, lastStderr: string): void {
  if (existsSync(outPath) && statSync(outPath).size > 0) return;
  throw new Error(
    `ffmpeg reported success but did not write ${context} (${path.basename(outPath)}). Last stderr: ${lastStderr.slice(-400) || "<empty>"}`,
  );
}

/**
 * Extracts the first decodable frame of `videoPath` as PNG.
 *
 * Uses output-seek (`-ss` AFTER `-i`) at position 0 so ffmpeg has to
 * actually decode from the start — input-seek can skip ahead of the
 * first I-frame on streams whose timestamps don't begin at zero.
 */
export async function extractFirstFrame(
  videoPath: string,
  outPngPath: string,
): Promise<void> {
  const { stderr } = await runFfmpeg([
    "-y",
    "-i",
    videoPath,
    "-vframes",
    "1",
    "-q:v",
    "2",
    outPngPath,
  ]);
  assertWritten(outPngPath, "first frame", stderr);
}

/**
 * Extracts the LAST decodable frame of `videoPath` as PNG.
 *
 * Why a separate function from extractFirstFrame: the obvious approach
 * `-ss (duration - 0.04)` is a footgun. With `-ss` BEFORE `-i`, ffmpeg
 * fast-seeks to the keyframe at-or-before that timestamp; on a
 * stream-copied slice with a sparse keyframe interval, that keyframe
 * can sit AFTER the timestamp we asked for, leaving zero frames to
 * decode. ffmpeg then exits cleanly without writing anything — the
 * exact ENOENT we hit in the wild.
 *
 * `-sseof -1` seeks 1s before EOF (input-seek, but anchored to a
 * known-decodable region) and `-update 1` overwrites the output PNG
 * with each emitted frame, leaving us with the literal last one.
 */
export async function extractLastFrame(
  videoPath: string,
  outPngPath: string,
): Promise<void> {
  const { stderr } = await runFfmpeg([
    "-y",
    "-sseof",
    "-1",
    "-i",
    videoPath,
    "-update",
    "1",
    "-q:v",
    "2",
    outPngPath,
  ]);
  assertWritten(outPngPath, "last frame", stderr);
}

/**
 * Extracts the audio stream of a clip into a stand-alone .m4a file
 * using stream copy. Returns null if the clip has no audio stream.
 */
export async function extractAudio(
  videoPath: string,
  outAudioPath: string,
): Promise<string | null> {
  try {
    await runFfmpeg([
      "-y",
      "-i",
      videoPath,
      "-vn",
      "-c:a",
      "copy",
      outAudioPath,
    ]);
    return outAudioPath;
  } catch (err) {
    // Most common cause: the source clip has no audio stream. We
    // surface this as null so callers can decide whether to fall back
    // to letting Seedance generate audio for the regenerated segment.
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.toLowerCase().includes("does not contain")) return null;
    if (msg.toLowerCase().includes("no audio")) return null;
    throw err;
  }
}

/**
 * Replaces the audio track on `videoPath` with `audioPath`. Re-encodes
 * audio to AAC for broad MP4 compatibility but keeps the video stream
 * untouched. `-shortest` clamps to the shorter of the two streams so a
 * sub-frame audio drift doesn't add a black tail.
 */
export async function muxAudioOnto(
  videoPath: string,
  audioPath: string,
  outPath: string,
): Promise<void> {
  await runFfmpeg([
    "-y",
    "-i",
    videoPath,
    "-i",
    audioPath,
    "-map",
    "0:v:0",
    "-map",
    "1:a:0",
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-async",
    "1",
    "-shortest",
    outPath,
  ]);
}

/**
 * Re-encodes `inputPath` to exact target dimensions using a centred
 * scale + pad filter. Used to bridge the resolution gap between a
 * source clip (which may be 1080p) and Seedance image-to-video output
 * (currently capped at 720p) so the concat-demuxer doesn't reject the
 * mismatched streams.
 *
 * `force_original_aspect_ratio=decrease + pad` preserves aspect ratio
 * by letterboxing/pillarboxing rather than stretching. The audio
 * stream is stream-copied to avoid an unnecessary re-encode.
 */
export async function normalizeToTargetDims(
  inputPath: string,
  targetWidth: number,
  targetHeight: number,
  outPath: string,
): Promise<void> {
  const filter = `scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=decrease,pad=${targetWidth}:${targetHeight}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1`;
  await runFfmpeg([
    "-y",
    "-i",
    inputPath,
    "-vf",
    filter,
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "18",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "copy",
    outPath,
  ]);
}

/**
 * Concatenates same-codec MP4s using the concat demuxer (no re-encode).
 * Caller must guarantee inputs share resolution, codec, fps, and
 * pixel format. Use `normalizeToTargetDims` first if you suspect a
 * mismatch — Seedance image-to-video maxes at 720p, so 1080p sources
 * will need their regenerated segment scaled up before concat.
 */
export async function concatVideos(
  inputs: string[],
  outPath: string,
  workDir: string,
): Promise<void> {
  if (inputs.length === 0) {
    throw new Error("concatVideos requires at least one input.");
  }
  if (inputs.length === 1) {
    // No-op concat — copy the single file to the output path.
    await runFfmpeg(["-y", "-i", inputs[0], "-c", "copy", outPath]);
    return;
  }

  const listPath = path.join(workDir, "concat-list.txt");
  // ffmpeg's concat demuxer needs single-quoted POSIX-style paths and
  // chokes on backslashes — normalise on Windows by converting to
  // forward slashes (ffmpeg accepts those just fine).
  const lines = inputs
    .map((p) => `file '${p.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`)
    .join("\n");
  await writeFile(listPath, lines, "utf8");

  await runFfmpeg([
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    listPath,
    "-c",
    "copy",
    outPath,
  ]);
}

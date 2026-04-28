/**
 * ffmpeg trim helper for Story Mode's reactive chaining.
 *
 * `trimLastSeconds` keeps the last N seconds of an mp4, suitable for use as
 * `reference_video_urls[0]` in the next beat's request (motion-match tier).
 *
 * `trimAndUpload` does the trim then uploads to the active provider's CDN
 * and returns the public URL.
 */
import { readFile, unlink } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { tmpdir } from "node:os";
import { nanoid } from "nanoid";
import type { Provider } from "@/lib/constants";
import { falProvider } from "@/lib/providers/fal";
import { kieProvider } from "@/lib/providers/kie";
import { resolveFfmpegPath } from "./ffmpeg-path";

export async function trimLastSeconds(
  inputPath: string,
  outputPath: string,
  seconds: number,
): Promise<void> {
  const ffmpegPath = resolveFfmpegPath();
  const args = [
    "-y",
    "-hide_banner",
    "-loglevel", "error",
    "-sseof", `-${seconds}`,
    "-i", inputPath,
    "-c", "copy",
    outputPath,
  ];

  await new Promise<void>((resolve, reject) => {
    const child = spawn(ffmpegPath, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (d) => (stderr += String(d)));
    child.on("error", (err) => reject(err));
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg trimLastSeconds exited ${code}: ${stderr.slice(-400)}`));
    });
  });
}

export async function trimAndUpload(
  inputPath: string,
  seconds: number,
  provider: Provider,
): Promise<string> {
  const tempPath = path.join(tmpdir(), `trim-${nanoid(8)}.mp4`);
  try {
    await trimLastSeconds(inputPath, tempPath, seconds);
    const buffer = await readFile(tempPath);
    const filename = `trail-${nanoid(8)}.mp4`;
    if (provider === "kie") {
      return await kieProvider.uploadFromBuffer(buffer, filename, "video/mp4");
    }
    return await falProvider.uploadFromBuffer(buffer, filename, "video/mp4");
  } finally {
    await unlink(tempPath).catch(() => undefined);
  }
}

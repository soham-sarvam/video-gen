/**
 * ffmpeg concat for Story Mode. Uses the demuxer-concat method (no re-encode)
 * which preserves per-beat audio + video without quality loss.
 */
import { spawn } from "node:child_process";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { nanoid } from "nanoid";
import { resolveFfmpegPath } from "./ffmpeg-path";

export async function stitchClips(
  inputPaths: string[],
  outputPath: string,
): Promise<void> {
  if (inputPaths.length === 0) {
    throw new Error("stitchClips: at least one input is required.");
  }

  const ffmpegPath = resolveFfmpegPath();
  const listPath = path.join(tmpdir(), `concat-${nanoid(8)}.txt`);
  const listContent = inputPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n");
  await mkdir(path.dirname(listPath), { recursive: true });
  await writeFile(listPath, listContent, "utf-8");

  try {
    const args = [
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      listPath,
      "-c",
      "copy",
      outputPath,
    ];

    await new Promise<void>((resolve, reject) => {
      const child = spawn(ffmpegPath, args, { stdio: ["ignore", "ignore", "pipe"] });
      let stderr = "";
      child.stderr.on("data", (d) => (stderr += String(d)));
      child.on("error", (err) => reject(err));
      child.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`ffmpeg concat exited ${code}: ${stderr.slice(-400)}`));
      });
    });
  } finally {
    await unlink(listPath).catch(() => undefined);
  }
}

/**
 * Extracts the FIRST frame of an mp4 as a PNG using ffmpeg-static.
 * Used by the character sheet pipeline when the user uploaded a reference
 * video but no images — the first decoded frame is fed to Nano Banana Pro
 * as the identity anchor for the character sheet.
 */
import { spawn } from "node:child_process";
import { resolveFfmpegPath } from "./ffmpeg-path";

export async function extractFirstFrame(
  inputPath: string,
  outputPngPath: string,
): Promise<void> {
  const ffmpegPath = resolveFfmpegPath();

  // -ss 0 + -frames:v 1 grabs the first decodable frame. We avoid -ss
  // before -i (input seeking) so codecs without keyframes at t=0 still
  // resolve cleanly via output-side seeking.
  const args = [
    "-y",
    "-hide_banner",
    "-loglevel", "error",
    "-i", inputPath,
    "-vf", "select=eq(n\\,0)",
    "-frames:v", "1",
    "-q:v", "2",
    outputPngPath,
  ];

  await new Promise<void>((resolve, reject) => {
    const child = spawn(ffmpegPath, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (d) => (stderr += String(d)));
    child.on("error", (err) => reject(err));
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg extractFirstFrame exited ${code}: ${stderr.slice(-400)}`));
    });
  });
}

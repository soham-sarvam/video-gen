/**
 * Extracts the last frame of an mp4 as a PNG using ffmpeg-static.
 * Used by the deluxe (frame-exact + motion-match) continuity tier in
 * Story Mode, to produce first_frame_url for the next beat.
 */
import { spawn } from "node:child_process";
import { resolveFfmpegPath } from "./ffmpeg-path";

export async function extractLastFrame(
  inputPath: string,
  outputPngPath: string,
): Promise<void> {
  const ffmpegPath = resolveFfmpegPath();

  // -sseof -0.1 seeks ~100ms before EOF; -frames:v 1 grabs one frame.
  // 0.1s is wide enough to land on a keyframe at 24-30fps while still
  // being the "last" frame for continuity purposes.
  const args = [
    "-y",
    "-hide_banner",
    "-loglevel", "error",
    "-sseof", "-0.1",
    "-i", inputPath,
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
      else reject(new Error(`ffmpeg extractLastFrame exited ${code}: ${stderr.slice(-400)}`));
    });
  });
}

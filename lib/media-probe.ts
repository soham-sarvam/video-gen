/**
 * Server-only ffprobe wrapper.
 *
 * Browser metadata (e.g. `<video>.duration`) is unreliable on:
 *   - mp4 with missing/late moov atom
 *   - mp3 with broken ID3 frames
 *   - WebM streams without cues
 *   - any file where the user/uploader stripped headers
 *
 * ffprobe parses the actual stream, so we treat its `format.duration` as
 * the trust boundary. Bundled via `ffprobe-static` so deployments don't
 * need a system ffmpeg install.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import ffprobeStatic from "ffprobe-static";

interface FfprobeFormat {
  format?: { duration?: string };
}

/**
 * Turbopack/webpack can rewrite `__dirname` inside `ffprobe-static/index.js`
 * to a path under `.next/...` where the binary doesn't actually live. If
 * the package's reported path is missing, fall back to the canonical
 * node_modules layout (`bin/<platform>/<arch>/ffprobe[.exe]`).
 *
 * Pair this with `serverExternalPackages: ["ffprobe-static"]` in
 * next.config.ts — that's the real fix; this is the safety net.
 */
function resolveFfprobePath(): string {
  const reported = ffprobeStatic.path;
  if (reported && existsSync(reported)) return reported;

  const platformDir = process.platform; // "win32" | "darwin" | "linux"
  const archDir = process.arch; // "x64" | "arm64" | ...
  const binName = process.platform === "win32" ? "ffprobe.exe" : "ffprobe";
  const fallback = path.join(
    process.cwd(),
    "node_modules",
    "ffprobe-static",
    "bin",
    platformDir,
    archDir,
    binName,
  );
  return fallback;
}

const FFPROBE_PATH: string = resolveFfprobePath();

/**
 * Returns the duration of an audio/video file in seconds, or null if
 * ffprobe cannot determine it (corrupted/unsupported file).
 */
export async function probeDurationSeconds(filePath: string): Promise<number | null> {
  return new Promise((resolve) => {
    const args = [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "json",
      filePath,
    ];

    const proc = spawn(FFPROBE_PATH, args, { windowsHide: true });
    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    proc.on("error", () => resolve(null));
    proc.on("close", (code) => {
      if (code !== 0) {
        // Surface the probe error to the server logs, not the response.
        // eslint-disable-next-line no-console
        console.warn(`ffprobe exited ${code}: ${stderr.slice(0, 200)}`);
        resolve(null);
        return;
      }
      try {
        const parsed = JSON.parse(stdout) as FfprobeFormat;
        const raw = parsed.format?.duration;
        const seconds = raw ? Number.parseFloat(raw) : Number.NaN;
        resolve(Number.isFinite(seconds) && seconds > 0 ? seconds : null);
      } catch {
        resolve(null);
      }
    });
  });
}

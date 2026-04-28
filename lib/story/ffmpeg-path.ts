/**
 * Mirrors the ffprobe-static fallback in lib/media-probe.ts.
 * Turbopack rewrites ffmpeg-static's __dirname during bundling, so the
 * package-reported path can be wrong at runtime. Fall back to canonical
 * node_modules layout if existsSync fails on the reported path.
 *
 * Pair with `serverExternalPackages: ["ffmpeg-static"]` in next.config.ts.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import ffmpegStaticPath from "ffmpeg-static";

export function resolveFfmpegPath(): string {
  const reported = ffmpegStaticPath as unknown as string | null;
  if (reported && existsSync(reported)) return reported;

  const binName = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
  return path.join(process.cwd(), "node_modules", "ffmpeg-static", binName);
}

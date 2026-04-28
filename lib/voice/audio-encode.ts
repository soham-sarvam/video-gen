/**
 * Re-encodes a Bulbul WAV buffer into MP3 (CBR 96 kbps, mono, 24 kHz)
 * with a hard ≤14s duration clamp. Used by voice-cache to guarantee
 * the cached sample fits Seedance's audio_urls limits (≤15s, ≤15 MB).
 *
 * Single ffmpeg invocation: read WAV from stdin, write MP3 to stdout.
 * No temp files needed — ffmpeg supports pipe:0 / pipe:1.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import ffmpegStaticPath from "ffmpeg-static";

function resolveFfmpegPath(): string {
  const reported = ffmpegStaticPath as unknown as string | null;
  if (reported && existsSync(reported)) return reported;
  // Fallback for Next.js bundle relocation (mirrors lib/media-probe.ts pattern)
  const binName = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
  return path.join(process.cwd(), "node_modules", "ffmpeg-static", binName);
}

export interface EncodeOptions {
  /** Maximum output duration in seconds. Hard clamp via `-t`. Default 14. */
  maxSeconds?: number;
  /** CBR bitrate, e.g. "96k". Default "96k". */
  bitrate?: string;
  /** Output sample rate. Default 24000. */
  sampleRate?: number;
}

/**
 * Re-encodes WAV bytes to MP3 with a max-duration clamp.
 * Implemented via ffmpeg pipe:0 → pipe:1 so no temp files touch disk.
 */
export async function encodeWavToMp3(
  wavBuffer: Buffer,
  opts: EncodeOptions = {},
): Promise<Buffer> {
  const ffmpegPath = resolveFfmpegPath();
  const args = [
    "-y",
    "-hide_banner",
    "-loglevel", "error",
    "-f", "wav",
    "-i", "pipe:0",
    "-t", String(opts.maxSeconds ?? 14),
    "-c:a", "libmp3lame",
    "-b:a", opts.bitrate ?? "96k",
    "-ar", String(opts.sampleRate ?? 24000),
    "-ac", "1",
    "-f", "mp3",
    "pipe:1",
  ];

  return await new Promise<Buffer>((resolve, reject) => {
    const child = spawn(ffmpegPath, args, { stdio: ["pipe", "pipe", "pipe"] });
    const chunks: Buffer[] = [];
    let stderr = "";
    child.stdout.on("data", (d) => chunks.push(Buffer.from(d)));
    child.stderr.on("data", (d) => (stderr += String(d)));
    child.on("error", (err) => reject(err));
    child.on("close", (code) => {
      if (code === 0) resolve(Buffer.concat(chunks));
      else reject(new Error(`ffmpeg encodeWavToMp3 exited ${code}: ${stderr.slice(-400)}`));
    });
    child.stdin.on("error", (err) => reject(err));
    child.stdin.end(wavBuffer);
  });
}

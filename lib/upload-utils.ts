/**
 * Server-side file storage helpers.
 *
 * Files land in `public/<UPLOAD_DIR_NAME>/` so Next.js serves them
 * automatically at `/<UPLOAD_PUBLIC_PATH>/<filename>`. We do NOT add
 * a custom static-file route handler — that would defeat the point of
 * using Next.js's built-in `public/` serving.
 */
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fal } from "@fal-ai/client";
import { nanoid } from "nanoid";
import {
  ASSET_LIMITS,
  type AssetKind,
  UPLOAD_DIR_NAME,
  UPLOAD_PUBLIC_PATH,
} from "./constants";
import { buildAbsoluteUrl } from "./format-utils";
import { probeDurationSeconds } from "./media-probe";
import type { UploadedAsset } from "./types";

/** Pull a human-readable message from the FAL client's ApiError shape. */
function extractFalUploadError(err: unknown): string {
  if (!err || typeof err !== "object") return "Unknown FAL storage error.";
  const e = err as Record<string, unknown>;
  const body = e.body as Record<string, unknown> | undefined;
  if (body && typeof body.detail === "string") return body.detail;
  if (typeof e.message === "string") return e.message;
  return "FAL storage upload failed.";
}

let falConfigured = false;
function ensureFalConfigured(): void {
  if (falConfigured) return;
  const credentials = process.env.FAL_API_KEY;
  if (!credentials) {
    throw new Error("FAL_API_KEY is not configured on the server.");
  }
  fal.config({ credentials });
  falConfigured = true;
}

/** Resolves the absolute upload directory on disk. */
function getUploadDir(): string {
  return path.join(process.cwd(), "public", UPLOAD_DIR_NAME);
}

/** Picks the first declared file extension for a MIME type. Falls back to "" */
function pickExtension(kind: AssetKind, mimeType: string): string {
  const exts = ASSET_LIMITS[kind].acceptedTypes[mimeType];
  return exts?.[0] ?? "";
}

/** Strips characters that would be unsafe in a filename. */
function safeStem(name: string): string {
  const stem = name.replace(/\.[^.]+$/, "");
  return stem
    .replace(/[^\w-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .toLowerCase();
}

export interface SaveAssetParams {
  file: File;
  kind: AssetKind;
  /** Origin from the incoming request (e.g. https://app.example.com). */
  origin: string;
}

export interface SaveAssetError {
  code: "duration_invalid" | "probe_failed" | "fal_upload_failed";
  message: string;
}

export type SaveAssetResult =
  | { ok: true; asset: UploadedAsset }
  | { ok: false; error: SaveAssetError };

function durationOutOfRange(kind: AssetKind, seconds: number): boolean {
  const limit = ASSET_LIMITS[kind];
  if (limit.minDurationSeconds !== undefined && seconds < limit.minDurationSeconds) return true;
  if (limit.maxDurationSeconds !== undefined && seconds > limit.maxDurationSeconds) return true;
  return false;
}

/**
 * Persists an uploaded file to disk, probes its duration with ffprobe
 * (for video/audio), and returns metadata + URLs. Files that fail the
 * duration check are deleted before we return — no orphans.
 *
 * Caller is responsible for prior MIME/size validation.
 */
export async function saveAsset({
  file,
  kind,
  origin,
}: SaveAssetParams): Promise<SaveAssetResult> {
  const uploadDir = getUploadDir();
  await mkdir(uploadDir, { recursive: true });

  const id = nanoid(12);
  const ext = pickExtension(kind, file.type);
  const filename = `${kind}-${safeStem(file.name)}-${id}${ext}`;
  const absolutePath = path.join(uploadDir, filename);

  // Read the file bytes once — we need them for both the local copy AND
  // the FAL CDN upload. The `File` from `request.formData()` is backed by
  // a single-read stream in Node.js; calling `arrayBuffer()` twice (or
  // passing the spent File to `fal.storage.upload`) silently yields 0 bytes.
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(absolutePath, buffer);

  let durationSeconds: number | null = null;
  if (kind === "video" || kind === "audio") {
    durationSeconds = await probeDurationSeconds(absolutePath);
    if (durationSeconds === null) {
      await unlink(absolutePath).catch(() => undefined);
      return {
        ok: false,
        error: {
          code: "probe_failed",
          message: "Could not read media duration. The file may be corrupted or use an unsupported codec.",
        },
      };
    }
    if (durationOutOfRange(kind, durationSeconds)) {
      await unlink(absolutePath).catch(() => undefined);
      const limit = ASSET_LIMITS[kind];
      const min = limit.minDurationSeconds;
      const max = limit.maxDurationSeconds;
      const range = min !== undefined ? `${min}–${max}s` : `≤ ${max}s`;
      return {
        ok: false,
        error: {
          code: "duration_invalid",
          message: `${kind} duration is ${durationSeconds.toFixed(2)}s; allowed range is ${range}.`,
        },
      };
    }
  }

  // Upload to FAL storage so Seedance can fetch the asset publicly. The
  // local copy in /public/uploads/ is what we serve to the user's browser
  // for previews; the FAL CDN URL is what the FAL inference API consumes.
  // Without this, FAL servers cannot reach `http://localhost:3000/...`.
  //
  // We build a *fresh* File from the buffer we already read — the original
  // File object's body stream is consumed and cannot be re-read.
  let falUrl: string;
  try {
    ensureFalConfigured();
    const freshFile = new File([buffer], file.name, { type: file.type });
    falUrl = await fal.storage.upload(freshFile);
  } catch (err: unknown) {
    await unlink(absolutePath).catch(() => undefined);
    const msg = extractFalUploadError(err);
    return {
      ok: false,
      error: {
        code: "fal_upload_failed",
        message: `Could not upload to FAL CDN: ${msg}`,
      },
    };
  }

  const publicUrl = `${UPLOAD_PUBLIC_PATH}/${filename}`;
  return {
    ok: true,
    asset: {
      id,
      kind,
      originalName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
      publicUrl,
      // `absoluteUrl` is the URL handed to FAL inference. We point it at
      // FAL storage rather than our own origin so it works on localhost
      // (FAL servers cannot reach a developer's machine) and on Vercel
      // (no extra egress through our box).
      absoluteUrl: falUrl,
      // `localPreviewUrl` is the same-origin URL we use for the in-app
      // preview. Built from the request origin so it works from any host.
      localPreviewUrl: buildAbsoluteUrl(origin, publicUrl),
      durationSeconds,
    },
  };
}

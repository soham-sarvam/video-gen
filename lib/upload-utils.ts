/**
 * Server-side file storage helpers.
 *
 * Files land in `public/<UPLOAD_DIR_NAME>/` so Next.js serves them
 * automatically at `/<UPLOAD_PUBLIC_PATH>/<filename>` for in-app previews.
 *
 * Each upload also pushes the buffer to **both provider CDNs** (FAL and
 * KIE) so the user can switch providers at generate time without re-
 * uploading. Provider uploads run in parallel; failure of one does not
 * fail the whole upload — we just record which providers are reachable.
 */
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { nanoid } from "nanoid";
import {
  ASSET_LIMITS,
  type AssetKind,
  UPLOAD_DIR_NAME,
  UPLOAD_PUBLIC_PATH,
} from "./constants";
import { buildAbsoluteUrl } from "./format-utils";
import { probeDurationSeconds } from "./media-probe";
import { falProvider } from "./providers/fal";
import { kieProvider } from "./providers/kie";
import type { UploadedAsset } from "./types";

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
  code: "duration_invalid" | "probe_failed" | "no_provider_url";
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

/** Run a provider upload, returning null instead of throwing. */
async function tryProviderUpload(
  label: "fal" | "kie",
  uploader: () => Promise<string>,
): Promise<{ url: string | null; error: string | null }> {
  try {
    return { url: await uploader(), error: null };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : `${label} upload failed.`;
    return { url: null, error: msg };
  }
}

/**
 * Persists an uploaded file to disk, probes its duration with ffprobe
 * (for video/audio), and pushes copies to FAL + KIE CDNs in parallel.
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

  // Read the file bytes once. The `File` from `request.formData()` is
  // backed by a single-read stream — calling arrayBuffer() twice gives 0.
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
          message:
            "Could not read media duration. The file may be corrupted or use an unsupported codec.",
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

  // Push to BOTH providers in parallel so the user can pick either at
  // generate time without re-uploading. A provider that fails is recorded
  // as missing; we only fail the whole upload if both are missing.
  const [falResult, kieResult] = await Promise.all([
    tryProviderUpload("fal", () =>
      falProvider.uploadFromBuffer(buffer, file.name, file.type),
    ),
    tryProviderUpload("kie", () =>
      kieProvider.uploadFromBuffer(buffer, file.name, file.type),
    ),
  ]);

  if (!falResult.url && !kieResult.url) {
    await unlink(absolutePath).catch(() => undefined);
    return {
      ok: false,
      error: {
        code: "no_provider_url",
        message: `Both CDN uploads failed. FAL: ${falResult.error ?? "?"}; KIE: ${kieResult.error ?? "?"}.`,
      },
    };
  }

  const cdnUrls: UploadedAsset["cdnUrls"] = {};
  if (falResult.url) cdnUrls.fal = falResult.url;
  if (kieResult.url) cdnUrls.kie = kieResult.url;

  // `absoluteUrl` is the legacy default — prefer the FAL URL when present.
  const absoluteUrl = falResult.url ?? kieResult.url ?? "";

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
      absoluteUrl,
      cdnUrls,
      localPreviewUrl: buildAbsoluteUrl(origin, publicUrl),
      durationSeconds,
    },
  };
}

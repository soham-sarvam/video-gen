/**
 * Persists every successful generation to disk so the user has a stable
 * local copy after the provider's TTL expires (KIE files vanish after 3
 * days, FAL after a comparable window).
 *
 * Layout (chosen for human retrieval):
 *
 *   public/uploads/generations/
 *     fal/
 *       <taskId>/
 *         video.mp4
 *         metadata.json
 *     kie/
 *       <taskId>/
 *         video.mp4
 *         metadata.json
 *
 * Provider is the parent so you can `ls public/uploads/generations/kie/`
 * to see every KIE job. Each `<taskId>` directory is self-contained — the
 * video plus a small JSON sidecar with model/tier/timestamps/origin URL —
 * so a generation can be moved or shared as one unit.
 *
 * The archive is best-effort: if the download fails we still return the
 * original CDN URL so the UI keeps working — just without the offline
 * fallback.
 */
import { existsSync } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  GENERATIONS_SUBDIR,
  UPLOAD_DIR_NAME,
  UPLOAD_PUBLIC_PATH,
  type VideoModel,
} from "./constants";

/**
 * KIE/FAL CDN reads sometimes 403 a default Node UA. Use a real Chrome UA
 * to stay consistent with `lib/providers/kie.ts:authHeader()` semantics.
 */
const ARCHIVE_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0 Safari/537.36";

/** Max bytes we'll write to disk per generation. ~256 MB is generous. */
const ARCHIVE_MAX_BYTES = 256 * 1024 * 1024;

function getArchiveRoot(): string {
  return path.join(process.cwd(), "public", UPLOAD_DIR_NAME, GENERATIONS_SUBDIR);
}

/**
 * Resolves the per-generation directory.
 * Returns BOTH the on-disk path and the matching same-origin URL prefix.
 */
function getJobPaths(provider: string, taskId: string) {
  const safeProvider = safeStem(provider);
  const safeTaskId = safeStem(taskId);
  if (!safeProvider || !safeTaskId) {
    throw new Error(`Invalid archive path components: provider="${provider}" taskId="${taskId}"`);
  }
  const diskDir = path.join(getArchiveRoot(), safeProvider, safeTaskId);
  const urlDir = `${UPLOAD_PUBLIC_PATH}/${GENERATIONS_SUBDIR}/${safeProvider}/${safeTaskId}`;
  return { diskDir, urlDir, safeProvider, safeTaskId };
}

function safeStem(input: string, max = 64): string {
  return input
    .replace(/[^\w-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .toLowerCase();
}

/**
 * Pull a sensible extension from the URL path; default to `.mp4`. We don't
 * trust Content-Type alone because some CDNs return `application/octet-stream`.
 */
function pickExtension(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const dot = pathname.lastIndexOf(".");
    if (dot >= 0) {
      const ext = pathname.slice(dot).toLowerCase();
      if (/^\.[a-z0-9]{2,4}$/.test(ext)) return ext;
    }
  } catch {
    // fall through
  }
  return ".mp4";
}

export interface ArchiveResult {
  /** Same-origin URL like `/uploads/generations/<file>` — survives provider TTL. */
  localUrl: string;
  /** Absolute path on disk (server-side only). */
  diskPath: string;
  /** Size in bytes. */
  sizeBytes: number;
  /** True if the file already existed and we skipped the re-download. */
  reused: boolean;
}

interface ArchiveMetadata {
  provider: string;
  modelValue: string;
  modelLabel: string;
  modelTier: string;
  taskId: string;
  originalUrl: string;
  archivedAt: string;
  sizeBytes: number;
  videoFile: string;
}

export async function archiveGeneratedVideo(
  taskId: string,
  model: VideoModel,
  remoteUrl: string,
): Promise<ArchiveResult> {
  const { diskDir, urlDir } = getJobPaths(model.provider, taskId);
  await mkdir(diskDir, { recursive: true });

  const ext = pickExtension(remoteUrl);
  const videoFilename = `video${ext}`;
  const diskPath = path.join(diskDir, videoFilename);
  const metaPath = path.join(diskDir, "metadata.json");
  const localUrl = `${urlDir}/${videoFilename}`;

  // Idempotent: if we've already archived this taskId, reuse the file.
  if (existsSync(diskPath)) {
    const s = await stat(diskPath);
    return { localUrl, diskPath, sizeBytes: s.size, reused: true };
  }

  const res = await fetch(remoteUrl, {
    headers: { "User-Agent": ARCHIVE_USER_AGENT },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Archive fetch failed: HTTP ${res.status} from ${remoteUrl}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.byteLength > ARCHIVE_MAX_BYTES) {
    throw new Error(
      `Archive too large: ${buffer.byteLength} bytes exceeds ${ARCHIVE_MAX_BYTES}.`,
    );
  }
  await writeFile(diskPath, buffer);

  // Sidecar metadata so a single `<provider>/<taskId>/` directory carries
  // everything needed to identify and re-render the generation later.
  const meta: ArchiveMetadata = {
    provider: model.provider,
    modelValue: model.value,
    modelLabel: model.label,
    modelTier: model.tier,
    taskId,
    originalUrl: remoteUrl,
    archivedAt: new Date().toISOString(),
    sizeBytes: buffer.byteLength,
    videoFile: videoFilename,
  };
  await writeFile(metaPath, JSON.stringify(meta, null, 2));

  return { localUrl, diskPath, sizeBytes: buffer.byteLength, reused: false };
}

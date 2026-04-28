/**
 * Pure formatting helpers shared between server and client.
 */
import type { AspectRatio, Resolution } from "./constants";

const KB = 1024;
const MB = KB * 1024;

export function formatBytes(bytes: number): string {
  if (bytes < KB) return `${bytes} B`;
  if (bytes < MB) return `${(bytes / KB).toFixed(1)} KB`;
  return `${(bytes / MB).toFixed(1)} MB`;
}

/** Builds an absolute URL for an in-app path using the request's origin. */
export function buildAbsoluteUrl(origin: string, path: string): string {
  const trimmedOrigin = origin.replace(/\/+$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${trimmedOrigin}${normalizedPath}`;
}

/**
 * Maps a source video's pixel height to the closest Seedance
 * resolution enum value. Seedance image-to-video accepts only
 * `480p`/`720p`; we still expose `1080p` as a target dim for the
 * concat normalizer to scale UP to.
 */
export function snapResolutionForEdit(height: number): Resolution {
  if (height <= 540) return "480p";
  // image-to-video tops out at 720p; we generate 720p and scale to
  // source dims later if the source is 1080p.
  return "720p";
}

/** Numeric height in pixels for each Seedance resolution enum. */
export function resolutionHeightPx(resolution: Resolution): number {
  switch (resolution) {
    case "480p":
      return 480;
    case "720p":
      return 720;
    case "1080p":
      return 1080;
    default:
      return 720;
  }
}

interface AspectChoice {
  value: Exclude<AspectRatio, "auto">;
  ratio: number;
}

const ASPECT_CHOICES: readonly AspectChoice[] = [
  { value: "21:9", ratio: 21 / 9 },
  { value: "16:9", ratio: 16 / 9 },
  { value: "4:3", ratio: 4 / 3 },
  { value: "1:1", ratio: 1 },
  { value: "3:4", ratio: 3 / 4 },
  { value: "9:16", ratio: 9 / 16 },
];

/**
 * Snaps a width/height pair to the nearest Seedance aspect ratio enum.
 * We pass an explicit value rather than `auto` so the regenerated
 * segment's dims are deterministic and the concat doesn't end up with
 * mismatched aspect on a clip whose actual pixel dims sit between two
 * standard ratios.
 */
export function snapAspectRatioForEdit(
  width: number,
  height: number,
): Exclude<AspectRatio, "auto"> {
  if (width <= 0 || height <= 0) return "16:9";
  const target = width / height;
  let best = ASPECT_CHOICES[0];
  let bestDelta = Math.abs(target - best.ratio);
  for (const candidate of ASPECT_CHOICES) {
    const delta = Math.abs(target - candidate.ratio);
    if (delta < bestDelta) {
      best = candidate;
      bestDelta = delta;
    }
  }
  return best.value;
}

/**
 * Zod schemas + asset/prompt validators for the Seedance pipeline.
 *
 * These run on both the server (route handlers) and the client (form
 * pre-checks). Client-side checks short-circuit obvious failures so we
 * don't waste an API roundtrip; the server still re-validates as the
 * trust boundary (see security.md → "Validate at system boundaries").
 */
import { z } from "zod";
import {
  ASPECT_RATIOS,
  ASSET_LIMITS,
  type AssetKind,
  DURATIONS,
  INDIC_LANGUAGES,
  MAX_TOTAL_ASSETS,
  PROMPT_MAX_CHARS,
  PROMPT_MIN_CHARS,
  REFERENCE_ROLE_WORDS,
  RESOLUTIONS,
  VIDEO_MODELS,
} from "./constants";
import { formatBytes } from "./format-utils";

// ---------------------------------------------------------------------------
// File validation (single file, on upload)
// ---------------------------------------------------------------------------
export interface FileValidationResult {
  ok: boolean;
  error?: string;
}

export function validateFileForKind(
  file: { name: string; type: string; size: number },
  kind: AssetKind,
): FileValidationResult {
  const limit = ASSET_LIMITS[kind];
  const acceptedMimeTypes = Object.keys(limit.acceptedTypes);

  if (!acceptedMimeTypes.includes(file.type)) {
    return {
      ok: false,
      error: `Unsupported type "${file.type || "unknown"}". Allowed: ${acceptedMimeTypes.join(", ")}.`,
    };
  }

  if (file.size > limit.maxSizeBytes) {
    return {
      ok: false,
      error: `File exceeds ${formatBytes(limit.maxSizeBytes)} limit (got ${formatBytes(file.size)}).`,
    };
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Asset-bundle validation (across all uploaded references)
// ---------------------------------------------------------------------------
/**
 * Bundle validator — checks counts AND combined media durations.
 * Pass `durations: number[]` (in seconds) for videos/audios so we can
 * enforce FAL's combined-duration rules:
 *   - videos: combined 2–15s
 *   - audios: combined ≤15s
 * Images don't have durations; pass `length` only.
 */
export interface AssetBundle {
  images: { length: number };
  videos: { length: number; durations?: number[] };
  audios: { length: number; durations?: number[] };
}

const COMBINED_VIDEO_MIN_S = 2;
const COMBINED_VIDEO_MAX_S = 15;
const COMBINED_AUDIO_MAX_S = 15;

function sum(values: number[] | undefined): number {
  if (!values?.length) return 0;
  return values.reduce((acc, v) => acc + v, 0);
}

export function validateAssetBundle(bundle: AssetBundle): string[] {
  const errors: string[] = [];
  const total = bundle.images.length + bundle.videos.length + bundle.audios.length;

  if (bundle.images.length > ASSET_LIMITS.image.maxCount) {
    errors.push(`Too many images (${bundle.images.length}/${ASSET_LIMITS.image.maxCount}).`);
  }
  if (bundle.videos.length > ASSET_LIMITS.video.maxCount) {
    errors.push(`Too many videos (${bundle.videos.length}/${ASSET_LIMITS.video.maxCount}).`);
  }
  if (bundle.audios.length > ASSET_LIMITS.audio.maxCount) {
    errors.push(`Too many audio files (${bundle.audios.length}/${ASSET_LIMITS.audio.maxCount}).`);
  }
  if (total > MAX_TOTAL_ASSETS) {
    errors.push(`Too many total references (${total}/${MAX_TOTAL_ASSETS}).`);
  }
  // Per FAL schema: "If audio is provided, at least one reference image or video is required."
  if (bundle.audios.length > 0 && bundle.images.length === 0 && bundle.videos.length === 0) {
    errors.push("Reference audio requires at least one reference image or video.");
  }

  if (bundle.videos.length > 0 && bundle.videos.durations) {
    const totalVideo = sum(bundle.videos.durations);
    if (totalVideo < COMBINED_VIDEO_MIN_S || totalVideo > COMBINED_VIDEO_MAX_S) {
      errors.push(
        `Combined reference-video duration is ${totalVideo.toFixed(2)}s; FAL requires ${COMBINED_VIDEO_MIN_S}–${COMBINED_VIDEO_MAX_S}s.`,
      );
    }
  }
  if (bundle.audios.length > 0 && bundle.audios.durations) {
    const totalAudio = sum(bundle.audios.durations);
    if (totalAudio > COMBINED_AUDIO_MAX_S) {
      errors.push(
        `Combined reference-audio duration is ${totalAudio.toFixed(2)}s; FAL allows ≤ ${COMBINED_AUDIO_MAX_S}s.`,
      );
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Prompt @-reference validator (rule §3.6 from the roadmap)
// ---------------------------------------------------------------------------
export interface ReferenceCounts {
  images: number;
  videos: number;
  audios: number;
}

export function validatePromptReferences(
  prompt: string,
  counts: ReferenceCounts,
): string[] {
  const lower = prompt.toLowerCase();
  const errors: string[] = [];

  const checkAll = (kind: "image" | "video" | "audio", count: number): void => {
    for (let i = 1; i <= count; i++) {
      if (!lower.includes(`@${kind}${i}`)) {
        errors.push(`@${kind}${i} uploaded but not referenced in the prompt.`);
      }
    }
  };
  checkAll("image", counts.images);
  checkAll("video", counts.videos);
  checkAll("audio", counts.audios);

  // Each @-reference must appear within 40 chars of a role word.
  const refPattern = /@(image|video|audio)\d+/g;
  for (const match of lower.matchAll(refPattern)) {
    const start = Math.max(0, match.index - 40);
    const end = Math.min(lower.length, match.index + match[0].length + 40);
    const window = lower.slice(start, end);
    const hasRole = REFERENCE_ROLE_WORDS.some((word) => window.includes(word));
    if (!hasRole) {
      // Include the surrounding context so the user can find and fix the
      // bare reference quickly.
      const contextStart = Math.max(0, match.index - 25);
      const contextEnd = Math.min(prompt.length, match.index + match[0].length + 25);
      const snippet = prompt.slice(contextStart, contextEnd).replace(/\s+/g, " ").trim();
      errors.push(
        `${match[0]} needs a role word nearby. Found: "…${snippet}…". Add one of: references, using, from, matches, "as the", or possessive 's (e.g. "narration references ${match[0]}").`,
      );
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Zod schemas for API payloads
// ---------------------------------------------------------------------------
const videoModelIds = VIDEO_MODELS.map((m) => m.value) as [string, ...string[]];
const indicCodes = INDIC_LANGUAGES.map((l) => l.value) as [string, ...string[]];

const cdnUrlsSchema = z
  .object({
    fal: z.string().url().optional(),
    kie: z.string().url().optional(),
  })
  .refine((v) => Boolean(v.fal || v.kie), {
    message: "Each reference must carry at least one provider CDN URL.",
  });

export const generateVideoSchema = z.object({
  prompt: z
    .string()
    .min(PROMPT_MIN_CHARS, `Prompt must be at least ${PROMPT_MIN_CHARS} characters.`)
    .max(PROMPT_MAX_CHARS, `Prompt cannot exceed ${PROMPT_MAX_CHARS} characters.`),
  model: z.enum(videoModelIds),
  resolution: z.enum(RESOLUTIONS),
  aspectRatio: z.enum(ASPECT_RATIOS),
  duration: z.enum(DURATIONS),
  generateAudio: z.boolean(),
  webSearch: z.boolean().optional(),
  seed: z.number().int().nonnegative().optional(),
  referenceImages: z
    .array(z.object({ cdnUrls: cdnUrlsSchema }))
    .max(ASSET_LIMITS.image.maxCount),
  referenceVideos: z
    .array(z.object({ cdnUrls: cdnUrlsSchema }))
    .max(ASSET_LIMITS.video.maxCount),
  referenceAudios: z
    .array(z.object({ cdnUrls: cdnUrlsSchema }))
    .max(ASSET_LIMITS.audio.maxCount),
});

export const taskQuerySchema = z.object({
  taskId: z.string().min(1),
  model: z.enum(videoModelIds),
});

export const optimizePromptSchema = z.object({
  rawPrompt: z
    .string()
    .min(1, "Prompt cannot be empty.")
    .max(PROMPT_MAX_CHARS, `Prompt cannot exceed ${PROMPT_MAX_CHARS} characters.`),
  language: z.enum(indicCodes),
  duration: z.enum(DURATIONS),
  referenceImages: z.array(z.object({ originalName: z.string(), mimeType: z.string() })),
  referenceVideos: z.array(z.object({ originalName: z.string(), mimeType: z.string() })),
  referenceAudios: z.array(z.object({ originalName: z.string(), mimeType: z.string() })),
});

export const uploadKindSchema = z.enum(["image", "video", "audio"]);

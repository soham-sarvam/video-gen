/**
 * Centralized constants for the Seedance 2.0 reference-to-video pipeline.
 *
 * Two providers are supported:
 *   - FAL  (`fal.ai/models/bytedance/seedance-2.0/...`) — used `@fal-ai/client`
 *   - KIE  (`api.kie.ai/api/v1/jobs/createTask`) — REST + polling
 *
 * Each provider exposes Standard and Fast tiers; tier caps the maximum
 * resolution. The form's resolution selector filters based on the selected
 * model's `maxResolution`.
 *
 * Sources of truth:
 *   - fal-seedance-api.md (FAL OpenAPI snippet)
 *   - kie-seedream-file-upload.md (KIE OpenAPI + file upload guide)
 *   - seedance_indic_video_roadmap.md §2.3
 */

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------
export type Provider = "fal" | "kie";
export type ModelTier = "standard" | "fast";

export interface VideoModel {
  /** Stable id used in form state, API requests, Select option value. */
  readonly value: string;
  readonly label: string;
  readonly description: string;
  readonly provider: Provider;
  readonly tier: ModelTier;
  /** Provider-native model identifier (FAL endpoint or KIE model string). */
  readonly slug: string;
  /** Maximum resolution this tier supports. Resolution UI is filtered. */
  readonly maxResolution: Resolution;
  /** Whether this model accepts a `web_search` flag (KIE-only today). */
  readonly supportsWebSearch: boolean;
}

// ---------------------------------------------------------------------------
// Resolutions / aspect ratios / durations
// ---------------------------------------------------------------------------
export const RESOLUTIONS = ["480p", "720p", "1080p"] as const;
export type Resolution = (typeof RESOLUTIONS)[number];
export const DEFAULT_RESOLUTION: Resolution = "720p";

/**
 * Order matters: the form filters allowed resolutions up to `maxResolution`
 * by index. Keep ascending.
 */
const RESOLUTION_INDEX: Record<Resolution, number> = {
  "480p": 0,
  "720p": 1,
  "1080p": 2,
};

export function isResolutionAllowed(
  resolution: Resolution,
  max: Resolution,
): boolean {
  return RESOLUTION_INDEX[resolution] <= RESOLUTION_INDEX[max];
}

export const ASPECT_RATIOS = [
  "auto",
  "21:9",
  "16:9",
  "4:3",
  "1:1",
  "3:4",
  "9:16",
] as const;
export type AspectRatio = (typeof ASPECT_RATIOS)[number];
export const DEFAULT_ASPECT_RATIO: AspectRatio = "auto";

export const DURATIONS = [
  "auto",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "11",
  "12",
  "13",
  "14",
  "15",
] as const;
export type Duration = (typeof DURATIONS)[number];
export const DEFAULT_DURATION: Duration = "auto";

// ---------------------------------------------------------------------------
// Models — FAL (Standard + Fast) and KIE (Standard + Fast).
// ---------------------------------------------------------------------------
export const VIDEO_MODELS: readonly VideoModel[] = [
  {
    value: "fal:standard",
    label: "FAL · Reference to Video — Standard",
    description: "1080p, ~2–4 min wall clock. Use for the final render.",
    provider: "fal",
    tier: "standard",
    slug: "bytedance/seedance-2.0/reference-to-video",
    maxResolution: "1080p",
    supportsWebSearch: false,
  },
  {
    value: "fal:fast",
    label: "FAL · Reference to Video — Fast",
    description: "720p, ~30–60s wall clock. Use for iteration.",
    provider: "fal",
    tier: "fast",
    slug: "bytedance/seedance-2.0/fast/reference-to-video",
    maxResolution: "720p",
    supportsWebSearch: false,
  },
  {
    value: "kie:standard",
    label: "KIE · Bytedance Seedance 2.0 — Standard",
    description: "1080p, supports web search grounding.",
    provider: "kie",
    tier: "standard",
    slug: "bytedance/seedance-2",
    maxResolution: "1080p",
    supportsWebSearch: true,
  },
  {
    value: "kie:fast",
    label: "KIE · Bytedance Seedance 2.0 — Fast",
    description: "720p, supports web search grounding.",
    provider: "kie",
    tier: "fast",
    slug: "bytedance/seedance-2-fast",
    maxResolution: "720p",
    supportsWebSearch: true,
  },
] as const;

export type VideoModelId = (typeof VIDEO_MODELS)[number]["value"];

export const DEFAULT_VIDEO_MODEL: VideoModelId = "fal:fast";

/** Throws if id is unknown. Server boundary uses this. */
export function getVideoModelById(id: string): VideoModel {
  const found = VIDEO_MODELS.find((m) => m.value === id);
  if (!found) {
    throw new Error(`Unknown video model id: ${id}`);
  }
  return found;
}

// ---------------------------------------------------------------------------
// Backward-compat aliases (retain old names so unrelated imports still work)
// ---------------------------------------------------------------------------
/** @deprecated Prefer VIDEO_MODELS. Kept for legacy imports. */
export const FAL_MODELS = VIDEO_MODELS.filter((m) => m.provider === "fal");
/** @deprecated Prefer VideoModelId. */
export type FalModelId = VideoModelId;
/** @deprecated Prefer DEFAULT_VIDEO_MODEL. */
export const DEFAULT_FAL_MODEL: VideoModelId = DEFAULT_VIDEO_MODEL;

// ---------------------------------------------------------------------------
// Asset categories (mirrors Seedance reference_*_urls fields)
// ---------------------------------------------------------------------------
export type AssetKind = "image" | "video" | "audio";

interface AssetLimit {
  readonly maxCount: number;
  readonly maxSizeBytes: number;
  readonly acceptedTypes: Readonly<Record<string, readonly string[]>>;
  readonly minDurationSeconds?: number;
  readonly maxDurationSeconds?: number;
  readonly placeholderText: string;
  readonly secondaryText: string;
}

const MB = 1024 * 1024;

export const ASSET_LIMITS: Readonly<Record<AssetKind, AssetLimit>> = {
  image: {
    maxCount: 9,
    maxSizeBytes: 30 * MB,
    acceptedTypes: {
      "image/jpeg": [".jpg", ".jpeg"],
      "image/png": [".png"],
      "image/webp": [".webp"],
    },
    placeholderText: "Drop reference images here",
    secondaryText: "JPG / PNG / WebP, up to 30 MB each, max 9 files",
  },
  video: {
    maxCount: 3,
    maxSizeBytes: 50 * MB,
    minDurationSeconds: 2,
    maxDurationSeconds: 15,
    acceptedTypes: {
      "video/mp4": [".mp4"],
      "video/quicktime": [".mov"],
    },
    placeholderText: "Drop reference videos here",
    secondaryText: "MP4 / MOV, 2–15s, up to 50 MB each, max 3 files",
  },
  audio: {
    maxCount: 3,
    maxSizeBytes: 15 * MB,
    maxDurationSeconds: 15,
    acceptedTypes: {
      "audio/mpeg": [".mp3"],
      "audio/wav": [".wav"],
      "audio/x-wav": [".wav"],
    },
    placeholderText: "Drop reference audio here",
    secondaryText: "MP3 / WAV, ≤15s, up to 15 MB each, max 3 files",
  },
};

// Combined hard limit (per Seedance docs: max 12 total assets)
export const MAX_TOTAL_ASSETS = 12;

// ---------------------------------------------------------------------------
// Prompt rules
// ---------------------------------------------------------------------------
export const PROMPT_MAX_CHARS = 4000;
export const PROMPT_MIN_CHARS = 10;

/**
 * Role words/phrases that must accompany every @-reference (validator rule).
 */
export const REFERENCE_ROLE_WORDS = [
  "as the",
  "as a",
  "as ",
  "references",
  "reference",
  "referencing",
  "using the",
  "using",
  "use ",
  "uses",
  "apply",
  "applies",
  "from",
  "matches",
  "matching",
  "match",
  "based on",
  "derived from",
  "featuring",
  "mirrors",
  "mirror",
  "inherit",
  "guided by",
  "drawn from",
  "'s",
] as const;

// ---------------------------------------------------------------------------
// Indic language options (used when guiding Gemini's prompt rewrite)
// ---------------------------------------------------------------------------
export const INDIC_LANGUAGES = [
  { value: "hi-IN", label: "Hindi" },
  { value: "kn-IN", label: "Kannada" },
  { value: "ta-IN", label: "Tamil" },
  { value: "te-IN", label: "Telugu" },
  { value: "ml-IN", label: "Malayalam" },
  { value: "mr-IN", label: "Marathi" },
  { value: "gu-IN", label: "Gujarati" },
  { value: "pa-IN", label: "Punjabi" },
  { value: "bn-IN", label: "Bengali" },
  { value: "or-IN", label: "Odia" },
  { value: "en-IN", label: "English" },
] as const;
export type IndicLanguageCode = (typeof INDIC_LANGUAGES)[number]["value"];
export const DEFAULT_INDIC_LANGUAGE: IndicLanguageCode = "hi-IN";

// ---------------------------------------------------------------------------
// Local file storage
// ---------------------------------------------------------------------------
/** Folder under `public/` where uploads land. Auto-served at `/uploads/...`. */
export const UPLOAD_DIR_NAME = "uploads";
/** Public URL path that maps to UPLOAD_DIR_NAME. */
export const UPLOAD_PUBLIC_PATH = "/uploads";

/**
 * Subfolder for archived generations. Lives under `public/uploads/` so it's
 * served by Next.js at `/uploads/generations/<filename>` and gets gitignored
 * by the existing `/public/uploads/` rule.
 */
export const GENERATIONS_SUBDIR = "generations";

// ---------------------------------------------------------------------------
// Gemini
// ---------------------------------------------------------------------------
export const GEMINI_MODEL = "gemini-2.5-flash";

// ---------------------------------------------------------------------------
// KIE.ai endpoints + thresholds
// ---------------------------------------------------------------------------
export const KIE_API_BASE = "https://api.kie.ai";
export const KIE_FILE_BASE = "https://kieai.redpandaai.co";
export const KIE_FILE_BASE64_PATH = "/api/file-base64-upload";
export const KIE_FILE_STREAM_PATH = "/api/file-stream-upload";
export const KIE_CREATE_TASK_PATH = "/api/v1/jobs/createTask";
/**
 * Polled GET endpoint for task status/result. KIE's docs link calls this
 * "Get Task Details" but the actual API path is `/api/v1/jobs/recordInfo`.
 * Verified empirically — `/api/v1/common/get-task-detail` returns 404.
 */
export const KIE_GET_TASK_DETAIL_PATH = "/api/v1/jobs/recordInfo";
/** Below this threshold → base64 upload; at-or-above → stream upload. */
export const KIE_BASE64_MAX_BYTES = 8 * MB;
/** Always run KIE NSFW filter — non-negotiable per project policy. */
export const KIE_NSFW_CHECKER_DEFAULT = true;

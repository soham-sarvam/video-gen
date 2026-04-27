/**
 * Centralized constants for the Seedance 2.0 reference-to-video pipeline.
 * Source of truth: fal-seedance-api.md + seedance_indic_video_roadmap.md (§2.3)
 *
 * Keep this file pure (no runtime dependencies). Types live in `./types.ts`.
 */

// ---------------------------------------------------------------------------
// FAL endpoints — only Reference-to-Video Standard and Fast are exposed.
// ---------------------------------------------------------------------------
export const FAL_MODELS = [
  {
    value: "bytedance/seedance-2.0/reference-to-video",
    label: "Reference to Video — Standard",
    description: "1080p, ~2–4 min wall clock. Use for the final render.",
    tier: "standard",
  },
  {
    value: "bytedance/seedance-2.0/fast/reference-to-video",
    label: "Reference to Video — Fast",
    description: "720p, ~30–60s wall clock. Use for iteration.",
    tier: "fast",
  },
] as const;

export const DEFAULT_FAL_MODEL: FalModelId =
  "bytedance/seedance-2.0/fast/reference-to-video";

export type FalModelId = (typeof FAL_MODELS)[number]["value"];

// ---------------------------------------------------------------------------
// Seedance generation parameters
// ---------------------------------------------------------------------------
export const RESOLUTIONS = ["480p", "720p", "1080p"] as const;
export type Resolution = (typeof RESOLUTIONS)[number];
export const DEFAULT_RESOLUTION: Resolution = "720p";

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
 * Roadmap §3.2 lists 4 canonical phrasings, but practical Gemini output uses
 * a wider grammatical surface — possessives (`@Video1's`), prepositions
 * (`from`, `using`), action verbs (`match`, `mirror`). Permissive list
 * avoids false-positive validator warnings while still catching the real
 * failure mode (a bare `@Video1` floating with no role).
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
  "use ", // "Use @Audio1 for ..." — natural english
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
  "'s", // possessive: "@Video1's character/motion/scene"
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

// ---------------------------------------------------------------------------
// Gemini
// ---------------------------------------------------------------------------
export const GEMINI_MODEL = "gemini-2.5-flash";

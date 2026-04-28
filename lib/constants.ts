/**
 * Centralized constants for the Seedance 2.0 reference-to-video pipeline.
 * Source of truth: fal-seedance-api.md + seedance_indic_video_roadmap.md (§2.3)
 *
 * Keep this file pure (no runtime dependencies). Types live in `./types.ts`.
 */

// ---------------------------------------------------------------------------
// FAL endpoints — Reference-to-Video (generation) + Image-to-Video (edit).
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

/**
 * Image-to-Video endpoints used by the segment editor. We pass the
 * segment's first frame as `image_url` and the last frame as
 * `end_image_url` so the regenerated clip is anchored to the boundary
 * frames the unchanged pre/post segments end with — this is what makes
 * the cut invisible after FFmpeg concat.
 */
export const FAL_EDIT_MODELS = [
  {
    value: "bytedance/seedance-2.0/image-to-video",
    label: "Edit — Standard",
    description: "Higher fidelity, ~2–4 min wall clock. Use for final edits.",
    tier: "standard",
  },
  {
    value: "bytedance/seedance-2.0/fast/image-to-video",
    label: "Edit — Fast",
    description: "720p, ~30–60s wall clock. Use for iteration.",
    tier: "fast",
  },
] as const;

export const DEFAULT_FAL_EDIT_MODEL: FalEditModelId =
  "bytedance/seedance-2.0/fast/image-to-video";

export type FalEditModelId = (typeof FAL_EDIT_MODELS)[number]["value"];

/** All FAL model IDs the server is willing to talk to (generation + edit). */
export const ALL_FAL_MODEL_IDS: readonly string[] = [
  ...FAL_MODELS.map((m) => m.value),
  ...FAL_EDIT_MODELS.map((m) => m.value),
];

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
// Edit pipeline
// ---------------------------------------------------------------------------
/**
 * Subdirectory under `public/uploads/` for editor scratch files (per-job
 * pre/sel/post slices, extracted frames, sidecar JSON). Each edit gets
 * its own `{editJobId}/` folder.
 */
export const EDIT_DIR_NAME = "edits";

/**
 * Seedance image-to-video accepts integer durations in [4, 15]. The
 * editor enforces the same range on the user's selection so the
 * regenerated segment slots back in cleanly.
 */
export const EDIT_MIN_SEGMENT_S = 4;
export const EDIT_MAX_SEGMENT_S = 15;
/** Source clips longer than this won't be downloaded server-side. */
export const EDIT_MAX_SOURCE_BYTES = 200 * 1024 * 1024;
/** Floor on prompt length for an edit description. */
export const EDIT_PROMPT_MIN_CHARS = 5;

// ---------------------------------------------------------------------------
// Gemini
// ---------------------------------------------------------------------------
export const GEMINI_MODEL = "gemini-2.5-flash";

// ---------------------------------------------------------------------------
// Sarvam Bulbul (Indic TTS) — used by the editor's "Indic dialogue" mode
// ---------------------------------------------------------------------------
export const SARVAM_TTS_ENDPOINT = "https://api.sarvam.ai/text-to-speech";
/**
 * Bulbul v3 model id. Per Sarvam docs as of April 2026, v3 supports
 * 11 Indic languages and 30+ voices. v2 is the fallback if v3 ever
 * regresses on a particular voice — swap the constant.
 */
export const BULBUL_MODEL = "bulbul:v3";
export const BULBUL_DEFAULT_SPEAKER = "anushka";
/** WAV at 22.05 kHz is the cleanest input for FFmpeg's AAC re-encode. */
export const BULBUL_SAMPLE_RATE = 22050;
/** Sarvam enforces a 2500-character ceiling per request. */
export const BULBUL_TEXT_MAX_CHARS = 2500;

/**
 * Subset of Bulbul v3 voices we surface in the picker. Bulbul has
 * 30+; these are the ones documented as stable across all 11 Indic
 * languages. Users can be allowed to free-form a voice id later.
 */
export const BULBUL_VOICES = [
  { value: "anushka", label: "Anushka (warm female)" },
  { value: "manisha", label: "Manisha (clear female)" },
  { value: "vidya", label: "Vidya (mature female)" },
  { value: "arya", label: "Arya (bright female)" },
  { value: "abhilash", label: "Abhilash (warm male)" },
  { value: "karun", label: "Karun (clear male)" },
  { value: "hitesh", label: "Hitesh (deep male)" },
] as const;
export type BulbulVoice = (typeof BULBUL_VOICES)[number]["value"];
export const DEFAULT_BULBUL_VOICE: BulbulVoice = "anushka";

/**
 * Sarvam uses `od-IN` for Odia where our generation form uses `or-IN`.
 * The other 10 Indic codes are identical between the two systems.
 */
export function toSarvamLanguageCode(code: IndicLanguageCode): string {
  return code === "or-IN" ? "od-IN" : code;
}

// ---------------------------------------------------------------------------
// Edit audio modes
// ---------------------------------------------------------------------------
/**
 * The three things the editor can do with the audio of the regenerated
 * segment:
 *   - keep_original         → mux the source segment's original audio
 *                             (FFmpeg extract + mux) over the new video
 *   - regenerate_seedance   → let Seedance generate ambient/SFX audio
 *                             (sets generate_audio:true on the FAL call)
 *   - bulbul_dialogue       → run user-provided text through Sarvam
 *                             Bulbul v3 in the chosen Indic language,
 *                             mux the WAV over the new video
 */
export const EDIT_AUDIO_MODES = [
  "keep_original",
  "regenerate_seedance",
  "bulbul_dialogue",
] as const;
export type EditAudioMode = (typeof EDIT_AUDIO_MODES)[number];
export const DEFAULT_EDIT_AUDIO_MODE: EditAudioMode = "keep_original";

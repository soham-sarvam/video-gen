/**
 * Shared interfaces and type aliases for the Seedance pipeline.
 * Per project conventions (CLAUDE.md): `interface` for object shapes,
 * string literal unions over `enum`, no `any`.
 */
import type {
  AspectRatio,
  AssetKind,
  BulbulVoice,
  Duration,
  EditAudioMode,
  FalEditModelId,
  FalModelId,
  IndicLanguageCode,
  Resolution,
} from "./constants";

// ---------------------------------------------------------------------------
// API response envelope (per ApiResponse pattern in patterns.md)
// ---------------------------------------------------------------------------
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// ---------------------------------------------------------------------------
// Uploaded asset (after server stores file in public/uploads/)
// ---------------------------------------------------------------------------
export interface UploadedAsset {
  /** Stable client-side id used for keying React lists. */
  id: string;
  /** Asset role in the Seedance request. */
  kind: AssetKind;
  /** Original filename as the user uploaded it. */
  originalName: string;
  /** MIME type detected by the browser. */
  mimeType: string;
  /** Size in bytes. */
  sizeBytes: number;
  /** Public URL relative to the deployment origin (e.g. /uploads/abc.png). */
  publicUrl: string;
  /**
   * URL handed to FAL inference. Points to FAL CDN (uploaded via
   * fal.storage.upload), so FAL servers can fetch the asset even when
   * the dev box is on localhost.
   */
  absoluteUrl: string;
  /** Same-origin URL used for in-app previews (built from request host). */
  localPreviewUrl: string;
  /** Duration in seconds — populated by ffprobe for video/audio, null for images. */
  durationSeconds: number | null;
}

export interface UploadResponse {
  asset: UploadedAsset;
}

// ---------------------------------------------------------------------------
// Generation form state (client-side)
// ---------------------------------------------------------------------------
export interface GenerationFormState {
  prompt: string;
  model: FalModelId;
  resolution: Resolution;
  aspectRatio: AspectRatio;
  duration: Duration;
  generateAudio: boolean;
  seed: string; // kept as string for the input; coerced to int server-side
  language: IndicLanguageCode;
  referenceImages: UploadedAsset[];
  referenceVideos: UploadedAsset[];
  referenceAudios: UploadedAsset[];
}

// ---------------------------------------------------------------------------
// Seedance request (server → fal.ai)
// ---------------------------------------------------------------------------
export interface SeedanceRequest {
  prompt: string;
  model: FalModelId;
  resolution: Resolution;
  aspectRatio: AspectRatio;
  duration: Duration;
  generateAudio: boolean;
  seed?: number;
  referenceImageUrls: string[];
  referenceVideoUrls: string[];
  referenceAudioUrls: string[];
}

export interface SeedanceVideoOutput {
  videoUrl: string;
  seed: number | null;
}

// ---------------------------------------------------------------------------
// FAL queue (submit → status → result)
// ---------------------------------------------------------------------------
/**
 * FAL's documented queue states. We surface the raw string so future
 * states added by FAL pass through without code changes here.
 * https://fal.ai/models/bytedance/seedance-2.0/fast/reference-to-video/api#queue-status
 */
export type SeedanceQueueState =
  | "IN_QUEUE"
  | "IN_PROGRESS"
  | "COMPLETED"
  | (string & {});

export interface SeedanceQueueStatus {
  requestId: string;
  status: SeedanceQueueState;
  /** Position in the FAL queue when status === "IN_QUEUE". */
  queuePosition: number | null;
  /** Live log lines (when logs are requested). */
  logs: string[];
}

export interface SubmitGenerationResponse {
  requestId: string;
  model: FalModelId;
}

// ---------------------------------------------------------------------------
// Gemini prompt-optimizer
// ---------------------------------------------------------------------------
/**
 * Visual + textual context the editor passes to the optimizer so
 * Gemini can ground its rewrite in what the segment actually looks
 * like, instead of inventing details from the user's text alone.
 *
 * Both fields are optional — when absent (the generation flow), the
 * optimizer falls back to its original text-only behaviour.
 */
export interface PromptOptimizerEditContext {
  /**
   * Prompt used at original generation time, if known. Lets Gemini
   * preserve stylistic intent ("1990s Doordarshan PSA, oil-lamp grade")
   * across the edit even when the boundary frames don't show it overtly.
   */
  originalPrompt?: string;
  /**
   * First and last frames of the segment being edited, captured
   * client-side from the video element and JPEG-encoded (q≈0.85, max
   * dim ≈ 384px) before being base64-encoded WITHOUT the
   * `data:image/jpeg;base64,` data-URL prefix. Gemini receives these
   * as inline image parts.
   */
  boundaryFrames?: {
    firstFrameBase64: string;
    lastFrameBase64: string;
  };
}

export interface OptimizePromptRequest {
  rawPrompt: string;
  language: IndicLanguageCode;
  referenceImages: Pick<UploadedAsset, "originalName" | "mimeType">[];
  referenceVideos: Pick<UploadedAsset, "originalName" | "mimeType">[];
  referenceAudios: Pick<UploadedAsset, "originalName" | "mimeType">[];
  duration: Duration;
  /** Present only when the call is from the editor (not main generation). */
  editContext?: PromptOptimizerEditContext;
}

export interface OptimizePromptResponse {
  optimizedPrompt: string;
  /** Validator warnings (non-fatal). */
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Editor: temporal segment regeneration
// ---------------------------------------------------------------------------

/** Client → /api/edit-video/submit. */
export interface EditVideoSubmitRequest {
  /** Public URL of the video to edit (FAL CDN or our own /uploads URL). */
  sourceVideoUrl: string;
  /** Selection start in seconds. */
  segmentStartS: number;
  /** Selection end in seconds. Must be greater than start. */
  segmentEndS: number;
  /** Edit prompt — describes what should change in the selected segment. */
  prompt: string;
  /** Which Seedance image-to-video tier to use. */
  model: FalEditModelId;
  /**
   * What to do with audio for the regenerated segment.
   *   - keep_original       → reuse source segment's audio
   *   - regenerate_seedance → let Seedance own the new audio
   *   - bulbul_dialogue     → synthesise Indic dialogue via Sarvam
   */
  audioMode: EditAudioMode;
  /** Required when audioMode === "bulbul_dialogue". */
  bulbulText?: string;
  /** Required when audioMode === "bulbul_dialogue". */
  bulbulLanguage?: IndicLanguageCode;
  /** Optional voice override; otherwise uses DEFAULT_BULBUL_VOICE. */
  bulbulVoice?: BulbulVoice;
  /** Optional generation overrides; default to source-matching values. */
  resolution?: Resolution;
  aspectRatio?: AspectRatio;
}

/** Server → client immediately after slice + submit. */
export interface EditVideoSubmitResponse {
  /** Internal id keyed against the on-disk sidecar. */
  editJobId: string;
  /** FAL queue request id — feed this into /api/generation-status. */
  requestId: string;
  /** Echo of the edit model so the client can drive the status route. */
  model: FalEditModelId;
  /** Integer segment length the FAL job was actually submitted with. */
  segmentDurationS: number;
}

/** Client → /api/edit-video/finalize. */
export interface EditVideoFinalizeRequest {
  editJobId: string;
}

/** Server → client after mux + concat finishes. */
export interface EditVideoFinalizeResponse {
  /** Public URL of the assembled, edited MP4. */
  videoUrl: string;
  /** Seed Seedance reported for the regenerated segment. */
  seed: number | null;
}

/**
 * On-disk sidecar persisted at
 * `public/uploads/edits/{editJobId}/job.json` between submit and
 * finalize. We need this because the segment paths and audio handling
 * decision are computed at submit time but only used after FAL returns.
 */
export interface EditJob {
  editJobId: string;
  sourceVideoUrl: string;
  segmentStartS: number;
  segmentEndS: number;
  /** Integer seconds in [4, 15] sent to Seedance. */
  segmentDurationS: number;
  audioMode: EditAudioMode;
  /** Local on-disk paths to the FFmpeg slices + extracted/synthesised audio. */
  prePath: string | null;
  selPath: string;
  postPath: string | null;
  /** Original segment audio — set only when audioMode === keep_original. */
  selAudioPath: string | null;
  /** Bulbul synthesised WAV — set only when audioMode === bulbul_dialogue. */
  bulbulAudioPath: string | null;
  /** First/last frame public URLs (FAL CDN) handed to image-to-video. */
  firstFrameUrl: string;
  lastFrameUrl: string;
  /**
   * Source pixel dimensions, probed via ffprobe at submit time. We
   * pass them into Seedance (mapped to the closest enum) AND use them
   * to scale the regenerated segment back up if Seedance's output
   * doesn't match (Seedance image-to-video maxes at 720p).
   */
  sourceWidth: number;
  sourceHeight: number;
  /** Resolution we actually told Seedance to render. */
  seedanceResolution: Resolution;
  /** Aspect ratio we told Seedance (snapped from source dims). */
  seedanceAspectRatio: AspectRatio;
  /** FAL job tracking. */
  falRequestId: string;
  falModel: FalEditModelId;
  status: "submitted" | "finalized" | "failed";
  /** Set on finalize success. */
  finalVideoUrl?: string;
  /** ISO timestamp for housekeeping/cleanup. */
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Internal seedance image-to-video request shape (server-only)
// ---------------------------------------------------------------------------
export interface SeedanceEditRequest {
  prompt: string;
  model: FalEditModelId;
  firstFrameUrl: string;
  lastFrameUrl: string;
  /** Integer seconds, 4–15. Forwarded as a string to match FAL's enum. */
  durationSeconds: number;
  generateAudio: boolean;
  resolution: Resolution;
  aspectRatio: AspectRatio;
  seed?: number;
}

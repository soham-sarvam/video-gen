/**
 * Shared interfaces and type aliases for the Seedance pipeline.
 * Per project conventions (CLAUDE.md): `interface` for object shapes,
 * string literal unions over `enum`, no `any`.
 */
import type {
  AspectRatio,
  AssetKind,
  Duration,
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
export interface OptimizePromptRequest {
  rawPrompt: string;
  language: IndicLanguageCode;
  referenceImages: Pick<UploadedAsset, "originalName" | "mimeType">[];
  referenceVideos: Pick<UploadedAsset, "originalName" | "mimeType">[];
  referenceAudios: Pick<UploadedAsset, "originalName" | "mimeType">[];
  duration: Duration;
}

export interface OptimizePromptResponse {
  optimizedPrompt: string;
  /** Validator warnings (non-fatal). */
  warnings: string[];
}

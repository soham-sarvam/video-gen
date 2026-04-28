/**
 * Shared interfaces and type aliases for the Seedance pipeline.
 * Per project conventions (CLAUDE.md): `interface` for object shapes,
 * string literal unions over `enum`, no `any`.
 */
import type {
  AspectRatio,
  AssetKind,
  Duration,
  GenerationMode,
  IndicLanguageCode,
  Resolution,
  StoryLength,
  VideoModelId,
} from "./constants";
import type { TaskStatus } from "./providers/types";

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
   * Default CDN URL for backwards compat (currently FAL). Routes that know
   * the active provider should prefer `cdnUrls[provider]` instead.
   */
  absoluteUrl: string;
  /** Per-provider CDN URLs — server picks the right one at submit time. */
  cdnUrls: {
    fal?: string;
    kie?: string;
  };
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
  model: VideoModelId;
  resolution: Resolution;
  aspectRatio: AspectRatio;
  duration: Duration;
  generateAudio: boolean;
  webSearch: boolean;
  seed: string; // kept as string for the input; coerced to int server-side
  language: IndicLanguageCode;
  referenceImages: UploadedAsset[];
  referenceVideos: UploadedAsset[];
  referenceAudios: UploadedAsset[];
  storyLength: StoryLength;
  generationMode: GenerationMode;
  stylePack: string;
}

// ---------------------------------------------------------------------------
// Seedance request (form → server)
// ---------------------------------------------------------------------------
export interface SeedanceRequest {
  prompt: string;
  model: VideoModelId;
  resolution: Resolution;
  aspectRatio: AspectRatio;
  duration: Duration;
  generateAudio: boolean;
  webSearch?: boolean;
  seed?: number;
  /** Asset references — server picks per-provider URL from `cdnUrls`. */
  referenceImages: { cdnUrls: UploadedAsset["cdnUrls"] }[];
  referenceVideos: { cdnUrls: UploadedAsset["cdnUrls"] }[];
  referenceAudios: { cdnUrls: UploadedAsset["cdnUrls"] }[];
}

export interface SeedanceVideoOutput {
  /** Provider-hosted URL (TTL'd — FAL/KIE both expire). */
  videoUrl: string;
  /** Same-origin URL of the archived copy (survives provider TTL). */
  localUrl: string | null;
  seed: number | null;
}

// ---------------------------------------------------------------------------
// Generation queue (submit → status → result), provider-agnostic
// ---------------------------------------------------------------------------
export interface GenerationStatus {
  taskId: string;
  status: TaskStatus;
  /** Position in queue when status === "queued"; null otherwise. */
  queuePosition: number | null;
  logs: string[];
  /** Provider-native raw status string for debugging. */
  rawStatus: string;
}

export interface SubmitGenerationResponse {
  taskId: string;
  model: VideoModelId;
}

// Backward-compat aliases for code still importing the old names.
/** @deprecated use GenerationStatus */
export type SeedanceQueueStatus = GenerationStatus;

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

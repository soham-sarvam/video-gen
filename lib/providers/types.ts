/**
 * Unified provider contract — both FAL and KIE implementations conform to
 * this shape so the API routes (`/api/generate-video`, `/api/generation-*`)
 * dispatch with no provider-specific branching.
 */
import type {
  AspectRatio,
  Duration,
  Resolution,
  VideoModel,
} from "../constants";

/** Common task lifecycle — both providers map to this discriminated set. */
export type TaskStatus = "queued" | "running" | "completed" | "failed";

export interface SubmitOutput {
  /** Provider-native task id (FAL request_id, KIE taskId). */
  taskId: string;
}

export interface StatusOutput {
  taskId: string;
  status: TaskStatus;
  /** Position in queue when status === "queued"; null otherwise. */
  queuePosition: number | null;
  /** Latest log lines if the provider exposes them. */
  logs: string[];
  /** Provider-native raw status string for debugging. */
  rawStatus: string;
}

export interface ResultOutput {
  videoUrl: string;
  /** Seed used, when the provider returns it. */
  seed: number | null;
}

export interface GenerationInput {
  /** Selected model (already resolved from `model.value` to `VideoModel`). */
  model: VideoModel;
  prompt: string;
  resolution: Resolution;
  aspectRatio: AspectRatio;
  duration: Duration;
  generateAudio: boolean;
  /** Optional. KIE-only — providers that don't support it ignore this. */
  webSearch?: boolean;
  seed?: number;
  imageUrls: string[];
  videoUrls: string[];
  audioUrls: string[];
  /**
   * Optional first-frame pin (image-to-video / multimodal mode).
   * KIE accepts this alongside reference_*_urls in one request.
   * FAL splits — providers/fal.ts routes to fast/image-to-video when set.
   */
  firstFrameUrl?: string;
}

export interface VideoProvider {
  /** Upload a raw file buffer to the provider's storage and return a CDN URL. */
  uploadFromBuffer(
    buffer: Buffer,
    filename: string,
    mimeType: string,
  ): Promise<string>;
  submit(input: GenerationInput): Promise<SubmitOutput>;
  status(taskId: string, model: VideoModel): Promise<StatusOutput>;
  result(taskId: string, model: VideoModel): Promise<ResultOutput>;
}

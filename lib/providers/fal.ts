/**
 * FAL.ai provider — wraps `@fal-ai/client` to satisfy the unified
 * `VideoProvider` contract defined in `./types.ts`.
 *
 * Uses the queue API (submit / status / result) so long-running jobs don't
 * exceed serverless function timeouts. Browser polls via our routes.
 */
import { fal } from "@fal-ai/client";
import type { VideoModel } from "../constants";
import type {
  GenerationInput,
  ResultOutput,
  StatusOutput,
  SubmitOutput,
  TaskStatus,
  VideoProvider,
} from "./types";

let configured = false;

function ensureConfigured(): void {
  if (configured) return;
  const key = process.env.FAL_API_KEY;
  if (!key) throw new Error("FAL_API_KEY is not configured on the server.");
  fal.config({ credentials: key });
  configured = true;
}

// ---------------------------------------------------------------------------
// Error mapping
// ---------------------------------------------------------------------------
interface FalValidationItem {
  loc?: unknown;
  msg?: string;
  type?: string;
}

function extractFalErrorDetail(err: unknown): string {
  if (!err || typeof err !== "object") return "Unknown error from fal.ai.";
  const e = err as Record<string, unknown>;
  const status = typeof e.status === "number" ? e.status : undefined;
  const body = e.body as Record<string, unknown> | undefined;
  const baseMessage = typeof e.message === "string" ? e.message : "";

  if (body && Array.isArray(body.detail)) {
    const items = body.detail as FalValidationItem[];
    const parts = items.map((item) => {
      const loc = Array.isArray(item.loc) ? item.loc.join(".") : "input";
      return `${loc}: ${item.msg ?? "invalid"}`;
    });
    return `fal.ai ${status ?? ""} validation: ${parts.join(" | ")}`.trim();
  }
  if (body && typeof body.detail === "string") {
    return `fal.ai ${status ?? ""}: ${body.detail}`;
  }
  if (body && typeof body.message === "string") {
    return `fal.ai ${status ?? ""}: ${body.message}`;
  }
  if (baseMessage) return `fal.ai ${status ?? ""}: ${baseMessage}`.trim();
  return "Unknown error from fal.ai.";
}

// ---------------------------------------------------------------------------
// Status mapping (FAL's caps states → our common TaskStatus)
// ---------------------------------------------------------------------------
function falStateToTaskStatus(raw: string): TaskStatus {
  switch (raw) {
    case "IN_QUEUE":
      return "queued";
    case "IN_PROGRESS":
      return "running";
    case "COMPLETED":
      return "completed";
    case "FAILED":
      return "failed";
    default:
      return "queued";
  }
}

interface RawQueueStatus {
  status?: string;
  queue_position?: number;
  logs?: Array<{ message?: string }>;
}

interface RawSeedanceData {
  video?: { url?: string };
  seed?: number;
}

function isRawSeedanceData(value: unknown): value is RawSeedanceData {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return v.video === undefined || typeof v.video === "object";
}

// ---------------------------------------------------------------------------
// Build the FAL input payload from our GenerationInput
// ---------------------------------------------------------------------------
function buildInput(input: GenerationInput): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    prompt: input.prompt,
    resolution: input.resolution,
    aspect_ratio: input.aspectRatio,
    duration: input.duration,
    generate_audio: input.generateAudio,
  };
  if (input.seed !== undefined) payload.seed = input.seed;
  if (input.imageUrls.length) payload.image_urls = input.imageUrls;
  if (input.videoUrls.length) payload.video_urls = input.videoUrls;
  if (input.audioUrls.length) payload.audio_urls = input.audioUrls;
  return payload;
}

// ---------------------------------------------------------------------------
// FAL storage upload (replaces fal.storage.upload(File) since we have Buffer)
// ---------------------------------------------------------------------------
async function uploadFromBuffer(
  buffer: Buffer,
  filename: string,
  mimeType: string,
): Promise<string> {
  ensureConfigured();
  // @fal-ai/client's storage.upload accepts a Web `File`, which is Blob-like.
  const blob = new Blob([new Uint8Array(buffer)], { type: mimeType });
  const file = new File([blob], filename, { type: mimeType });
  try {
    return await fal.storage.upload(file);
  } catch (err) {
    throw new Error(extractFalErrorDetail(err));
  }
}

// ---------------------------------------------------------------------------
// Submit / Status / Result
// ---------------------------------------------------------------------------
async function submit(input: GenerationInput): Promise<SubmitOutput> {
  ensureConfigured();

  // FAL splits endpoints: reference-to-video accepts ref arrays but not
  // first_frame_url; image-to-video does the inverse. When the caller
  // provides a first frame, route to image-to-video. Note: this loses
  // the ref arrays for that request — documented "degraded mode" tradeoff
  // per the Story Mode spec.
  if (input.firstFrameUrl) {
    const endpoint =
      input.model.tier === "fast"
        ? "bytedance/seedance-2.0/fast/image-to-video"
        : "bytedance/seedance-2.0/image-to-video";
    const i2vInput: Record<string, unknown> = {
      prompt: input.prompt,
      image_url: input.firstFrameUrl,
      resolution: input.resolution,
      aspect_ratio: input.aspectRatio,
      duration: input.duration,
      generate_audio: input.generateAudio,
    };
    if (input.seed !== undefined) i2vInput.seed = input.seed;
    try {
      const result = await fal.queue.submit(endpoint, { input: i2vInput });
      return { taskId: result.request_id };
    } catch (err) {
      throw new Error(extractFalErrorDetail(err));
    }
  }

  try {
    const result = await fal.queue.submit(input.model.slug, {
      input: buildInput(input),
    });
    return { taskId: result.request_id };
  } catch (err) {
    throw new Error(extractFalErrorDetail(err));
  }
}

async function status(taskId: string, model: VideoModel): Promise<StatusOutput> {
  ensureConfigured();
  try {
    const raw = (await fal.queue.status(model.slug, {
      requestId: taskId,
      logs: true,
    })) as unknown as RawQueueStatus;
    const rawStatus = raw.status ?? "UNKNOWN";
    const logs = (raw.logs ?? [])
      .map((entry) => entry.message)
      .filter((m): m is string => typeof m === "string" && m.length > 0);
    return {
      taskId,
      status: falStateToTaskStatus(rawStatus),
      queuePosition:
        typeof raw.queue_position === "number" ? raw.queue_position : null,
      logs,
      rawStatus,
    };
  } catch (err) {
    throw new Error(extractFalErrorDetail(err));
  }
}

async function result(taskId: string, model: VideoModel): Promise<ResultOutput> {
  ensureConfigured();
  try {
    const raw = await fal.queue.result(model.slug, { requestId: taskId });
    const data: unknown = raw.data;
    if (!isRawSeedanceData(data)) {
      throw new Error("Unexpected response shape from fal.ai Seedance endpoint.");
    }
    const videoUrl = data.video?.url;
    if (!videoUrl) throw new Error("fal.ai returned no video URL.");
    return {
      videoUrl,
      seed: typeof data.seed === "number" ? data.seed : null,
    };
  } catch (err) {
    throw new Error(extractFalErrorDetail(err));
  }
}

// ---------------------------------------------------------------------------
// Public Provider implementation
// ---------------------------------------------------------------------------
export const falProvider: VideoProvider = {
  uploadFromBuffer,
  submit,
  status,
  result,
};

/**
 * Server-side fal.ai client wrapper for Seedance 2.0 Reference-to-Video
 * (Standard + Fast tiers).
 *
 * We use the **queue API** (submit / status / result) instead of the
 * convenience `fal.subscribe()` because:
 *   - `fal.subscribe()` holds the HTTP connection open until the job
 *     completes. Standard Seedance can take 2–4 minutes, which exceeds
 *     Vercel's function timeouts (60s hobby / 300s pro).
 *   - Browser polling lets us show queue position + log lines while the
 *     job runs.
 *   - A `request_id` survives a page reload — the user can come back and
 *     see the result later (we don't persist this yet, but the shape is
 *     ready for it).
 *
 * Per CLAUDE.md hard rules:
 * - `generate_audio` defaults to false (caller can override)
 * - `seed` is forwarded only if provided
 * - Hard limits already enforced upstream by validation.ts
 */
import { fal } from "@fal-ai/client";
import type { FalEditModelId, FalModelId } from "./constants";
import type {
  SeedanceEditRequest,
  SeedanceQueueStatus,
  SeedanceRequest,
  SeedanceVideoOutput,
} from "./types";

/** Union of every FAL model id we submit to (generation + edit). */
type AnyFalModelId = FalModelId | FalEditModelId;

let configured = false;

function ensureConfigured(): void {
  if (configured) return;
  const key = process.env.FAL_API_KEY;
  if (!key) {
    throw new Error("FAL_API_KEY is not configured on the server.");
  }
  fal.config({ credentials: key });
  configured = true;
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

interface FalValidationItem {
  loc?: unknown;
  msg?: string;
  type?: string;
}

/** Pull the human-meaningful detail out of @fal-ai/client's ApiError. */
function extractFalErrorDetail(err: unknown): string {
  if (!err || typeof err !== "object") return "Unknown error from fal.ai.";
  const e = err as Record<string, unknown>;

  const status = typeof e.status === "number" ? e.status : undefined;
  const body = e.body as Record<string, unknown> | undefined;
  const baseMessage = typeof e.message === "string" ? e.message : "";

  // FastAPI 422 shape — { detail: [{ loc, msg, type }, ...] }
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

function buildSeedanceInput(req: SeedanceRequest): Record<string, unknown> {
  const input: Record<string, unknown> = {
    prompt: req.prompt,
    resolution: req.resolution,
    aspect_ratio: req.aspectRatio,
    duration: req.duration,
    generate_audio: req.generateAudio,
  };
  if (req.seed !== undefined) input.seed = req.seed;
  // FAL Seedance reference-to-video uses image_urls / video_urls / audio_urls
  // (NOT reference_*_urls — that name only appears in the BytePlus raw API).
  if (req.referenceImageUrls.length) input.image_urls = req.referenceImageUrls;
  if (req.referenceVideoUrls.length) input.video_urls = req.referenceVideoUrls;
  if (req.referenceAudioUrls.length) input.audio_urls = req.referenceAudioUrls;
  return input;
}

// ---------------------------------------------------------------------------
// Queue API: submit / status / result
// ---------------------------------------------------------------------------

/**
 * Submit a Seedance job to FAL's queue.
 * Returns the request_id immediately — does NOT wait for completion.
 */
export async function submitSeedanceJob(
  req: SeedanceRequest,
): Promise<{ requestId: string }> {
  ensureConfigured();
  try {
    const result = await fal.queue.submit(req.model, {
      input: buildSeedanceInput(req),
    });
    return { requestId: result.request_id };
  } catch (err: unknown) {
    throw new Error(extractFalErrorDetail(err));
  }
}

interface RawQueueStatus {
  status?: string;
  queue_position?: number;
  logs?: Array<{ message?: string; timestamp?: string }>;
}

function isRawQueueStatus(value: unknown): value is RawQueueStatus {
  return typeof value === "object" && value !== null;
}

/**
 * Get the current status of a queued Seedance job.
 * Use this to drive client-side polling.
 *
 * Accepts both generation (`reference-to-video`) and edit
 * (`image-to-video`) model ids — the FAL queue API is uniform across
 * model families, only the model slug changes.
 */
export async function getSeedanceJobStatus(
  model: AnyFalModelId,
  requestId: string,
): Promise<SeedanceQueueStatus> {
  ensureConfigured();
  try {
    // FAL's typed union (InQueue | InProgress | Completed) hides fields per
    // variant. Treat the response as RawQueueStatus for uniform parsing —
    // the SDK serialises the same JSON shape on the wire regardless.
    const raw = (await fal.queue.status(model, {
      requestId,
      logs: true,
    })) as unknown as RawQueueStatus;
    if (!isRawQueueStatus(raw)) {
      throw new Error("Unexpected response shape from fal.ai status endpoint.");
    }

    const status = (raw.status ?? "UNKNOWN") as SeedanceQueueStatus["status"];
    const logs = (raw.logs ?? [])
      .map((entry) => entry.message)
      .filter((m): m is string => typeof m === "string" && m.length > 0);

    return {
      requestId,
      status,
      queuePosition:
        typeof raw.queue_position === "number" ? raw.queue_position : null,
      logs,
    };
  } catch (err: unknown) {
    throw new Error(extractFalErrorDetail(err));
  }
}

/**
 * Fetch the final result of a completed Seedance job.
 * Caller must verify status === "COMPLETED" before invoking — calling
 * this on an in-progress job throws. Accepts both generation and edit
 * model ids for the same reason as `getSeedanceJobStatus`.
 */
export async function getSeedanceJobResult(
  model: AnyFalModelId,
  requestId: string,
): Promise<SeedanceVideoOutput> {
  ensureConfigured();
  try {
    const raw = await fal.queue.result(model, { requestId });
    const data: unknown = raw.data;
    if (!isRawSeedanceData(data)) {
      throw new Error("Unexpected response shape from fal.ai Seedance endpoint.");
    }
    const videoUrl = data.video?.url;
    if (!videoUrl) {
      throw new Error("fal.ai returned no video URL.");
    }
    return {
      videoUrl,
      seed: typeof data.seed === "number" ? data.seed : null,
    };
  } catch (err: unknown) {
    throw new Error(extractFalErrorDetail(err));
  }
}

// ---------------------------------------------------------------------------
// Edit submission — Seedance image-to-video with first/last frame anchors
// ---------------------------------------------------------------------------

/**
 * Builds the input payload for `bytedance/seedance-2.0/[fast/]image-to-video`.
 *
 * Anchoring both `image_url` (first frame) and `end_image_url` (last
 * frame) is what lets the regenerated segment stitch back into the
 * unchanged pre/post slices invisibly — the boundary frames the
 * surrounding clips end with become the boundary frames the new
 * segment starts/ends with.
 *
 * `duration` is forwarded as a string because FAL's enum lists string
 * values ("4" .. "15"). Audio is controlled by the caller — the editor
 * UI's "Regenerate audio" toggle maps directly to this flag.
 */
function buildSeedanceEditInput(req: SeedanceEditRequest): Record<string, unknown> {
  const input: Record<string, unknown> = {
    prompt: req.prompt,
    image_url: req.firstFrameUrl,
    end_image_url: req.lastFrameUrl,
    duration: req.durationSeconds.toString(),
    generate_audio: req.generateAudio,
    resolution: req.resolution,
    aspect_ratio: req.aspectRatio,
  };
  if (req.seed !== undefined) input.seed = req.seed;
  return input;
}

/**
 * Submits a Seedance image-to-video edit job to FAL's queue. Returns
 * the request_id immediately — does NOT wait for completion. The
 * client polls via the existing /api/generation-status route, then
 * triggers /api/edit-video/finalize once status === COMPLETED.
 */
export async function submitSeedanceEditJob(
  req: SeedanceEditRequest,
): Promise<{ requestId: string }> {
  ensureConfigured();
  try {
    const result = await fal.queue.submit(req.model, {
      input: buildSeedanceEditInput(req),
    });
    return { requestId: result.request_id };
  } catch (err: unknown) {
    throw new Error(extractFalErrorDetail(err));
  }
}

/**
 * Uploads a local file (read into a Buffer) to FAL storage and returns
 * a public URL the inference servers can fetch. Wraps `fal.storage.upload`
 * with the same error-extraction logic as our other FAL calls.
 *
 * Used by the edit pipeline to publish the extracted first/last frame
 * PNGs after FFmpeg writes them to disk.
 */
export async function uploadFileToFalStorage(
  file: File,
): Promise<string> {
  ensureConfigured();
  try {
    return await fal.storage.upload(file);
  } catch (err: unknown) {
    throw new Error(extractFalErrorDetail(err));
  }
}

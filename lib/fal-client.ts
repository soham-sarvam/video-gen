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
import type { FalModelId } from "./constants";
import type {
  SeedanceQueueStatus,
  SeedanceRequest,
  SeedanceVideoOutput,
} from "./types";

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
 */
export async function getSeedanceJobStatus(
  model: FalModelId,
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
 * this on an in-progress job throws.
 */
export async function getSeedanceJobResult(
  model: FalModelId,
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

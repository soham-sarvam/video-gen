/**
 * KIE.ai provider for Bytedance Seedance 2.0.
 *
 * Pipeline:
 *   1. uploadFromBuffer → POST /api/file-base64-upload (<8MB) or
 *      /api/file-stream-upload (≥8MB), returns a CDN fileUrl that lives
 *      for 3 days.
 *   2. submit → POST /api/v1/jobs/createTask, returns taskId.
 *   3. status → GET /api/v1/common/get-task-detail?taskId=...
 *   4. result → derived from status when state === "success".
 *
 * Error handling maps the full KIE response code set per the OpenAPI spec
 * (200/401/402/404/422/429/433/455/500/501/505).
 */
import {
  ASPECT_RATIOS,
  KIE_API_BASE,
  KIE_BASE64_MAX_BYTES,
  KIE_CREATE_TASK_PATH,
  KIE_FILE_BASE,
  KIE_FILE_BASE64_PATH,
  KIE_FILE_STREAM_PATH,
  KIE_GET_TASK_DETAIL_PATH,
  KIE_NSFW_CHECKER_DEFAULT,
  type AspectRatio,
  type Duration,
} from "../constants";
import type {
  GenerationInput,
  ResultOutput,
  StatusOutput,
  SubmitOutput,
  TaskStatus,
  VideoProvider,
} from "./types";

// ---------------------------------------------------------------------------
// Auth + error mapping
// ---------------------------------------------------------------------------
function getApiKey(): string {
  const key = process.env.KIE_API_KEY;
  if (!key) throw new Error("KIE_API_KEY is not configured on the server.");
  return key;
}

/**
 * KIE's file-upload subdomain (kieai.redpandaai.co) is fronted by
 * Cloudflare and bans bot UAs (the default `node-fetch`/`undici` UA gets a
 * `403 error code: 1010`). Sending a real browser UA passes through.
 * Applied to ALL KIE requests for consistency.
 */
const KIE_HEADERS_BASE: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0 Safari/537.36",
  Accept: "application/json",
};

function authHeader(): Record<string, string> {
  return { ...KIE_HEADERS_BASE, Authorization: `Bearer ${getApiKey()}` };
}

/**
 * KIE returns either a JSON envelope `{ code, msg, data }` (where `code`
 * mirrors the HTTP status semantically) or, for some upload endpoints,
 * raw HTTP error pages. Map both into a single human message.
 */
const KIE_CODE_MEANING: Record<number, string> = {
  200: "Success",
  400: "Bad request — check parameters",
  401: "Unauthorized — KIE_API_KEY missing or invalid",
  402: "Insufficient credits on the KIE account",
  404: "Not Found — endpoint or model unavailable",
  405: "Method Not Allowed",
  422: "Validation error — request parameters failed validation",
  429: "Rate limited — too many requests",
  433: "Sub-key usage limit exceeded",
  455: "Service unavailable — KIE is in maintenance",
  500: "KIE server error",
  501: "Generation failed",
  505: "Feature disabled",
};

function describeKieCode(code: number, fallback: string): string {
  const known = KIE_CODE_MEANING[code];
  return known ? `${code} ${known}` : `${code} ${fallback}`;
}

interface KieEnvelope<T> {
  code?: number;
  msg?: string;
  data?: T;
  // Some upload endpoints surface "success" too — we don't depend on it.
  success?: boolean;
}

async function parseKieJson<T>(res: Response): Promise<KieEnvelope<T>> {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as KieEnvelope<T>;
  } catch {
    // Server returned non-JSON (HTML error page etc.). Fold into envelope.
    return { msg: text.slice(0, 500) };
  }
}

/**
 * Throws a labelled Error if the response is non-OK or KIE's envelope code
 * is not 200. Returns the parsed envelope otherwise.
 */
async function callKie<T>(
  res: Response,
  context: string,
): Promise<KieEnvelope<T>> {
  const env = await parseKieJson<T>(res);
  const httpOk = res.ok;
  const envCode = env.code;
  // KIE convention: HTTP 200 with `code: 200` is success; anything else fails.
  if (!httpOk || (envCode !== undefined && envCode !== 200)) {
    const code = envCode ?? res.status;
    const message = env.msg ?? res.statusText ?? "unknown error";
    throw new Error(`KIE ${context} failed: ${describeKieCode(code, message)}`);
  }
  return env;
}

// ---------------------------------------------------------------------------
// File uploads — base64 (<8MB) vs stream (≥8MB)
// ---------------------------------------------------------------------------
interface KieUploadData {
  /** Newer endpoint variant. */
  fileUrl?: string;
  /** What the live API actually returns today. */
  downloadUrl?: string;
  fileId?: string;
  filePath?: string;
  expiresAt?: string;
}

/** KIE's two upload endpoints both put the public URL in `downloadUrl`. */
function pickUploadUrl(data: KieUploadData | undefined): string {
  if (!data) throw new Error("KIE upload returned no data.");
  const url = data.fileUrl ?? data.downloadUrl;
  if (!url) {
    throw new Error("KIE upload response missing both fileUrl and downloadUrl.");
  }
  return url;
}

async function uploadBase64(
  buffer: Buffer,
  filename: string,
  mimeType: string,
): Promise<string> {
  const dataUri = `data:${mimeType};base64,${buffer.toString("base64")}`;
  const res = await fetch(`${KIE_FILE_BASE}${KIE_FILE_BASE64_PATH}`, {
    method: "POST",
    headers: { ...authHeader(), "Content-Type": "application/json" },
    body: JSON.stringify({
      base64Data: dataUri,
      uploadPath: "text-to-vid",
      fileName: filename,
    }),
  });
  const env = await callKie<KieUploadData>(res, "base64-upload");
  return pickUploadUrl(env.data);
}

async function uploadStream(
  buffer: Buffer,
  filename: string,
  mimeType: string,
): Promise<string> {
  const fileBlob = new Blob([new Uint8Array(buffer)], { type: mimeType });
  const form = new FormData();
  form.append("file", fileBlob, filename);
  form.append("uploadPath", "text-to-vid");
  form.append("fileName", filename);
  // Don't set Content-Type — let fetch generate the multipart boundary.
  const res = await fetch(`${KIE_FILE_BASE}${KIE_FILE_STREAM_PATH}`, {
    method: "POST",
    headers: authHeader(),
    body: form,
  });
  const env = await callKie<KieUploadData>(res, "stream-upload");
  return pickUploadUrl(env.data);
}

// ---------------------------------------------------------------------------
// Aspect-ratio + duration mapping (FAL form-state → KIE wire format)
// ---------------------------------------------------------------------------
function toKieAspectRatio(value: AspectRatio): string {
  // KIE uses `adaptive` instead of `auto`; otherwise identical.
  if (value === "auto") return "adaptive";
  // 21:9 isn't documented in KIE OpenAPI but harmless to forward as-is.
  if (!ASPECT_RATIOS.includes(value)) return "16:9";
  return value;
}

function toKieDuration(value: Duration): number {
  // KIE expects an integer 4–15. The form's "auto" doesn't exist there, so
  // default to 5 (KIE's own default).
  if (value === "auto") return 5;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 4 || parsed > 15) return 5;
  return parsed;
}

// ---------------------------------------------------------------------------
// Submit / Status / Result
// ---------------------------------------------------------------------------
interface KieCreateTaskData {
  taskId?: string;
}

interface KieTaskDetailData {
  taskId?: string;
  /** "waiting" | "queuing" | "generating" | "success" | "fail" — KIE docs vary. */
  state?: string;
  failMsg?: string;
  resultJson?: string; // historically a JSON string
  result?: { videoUrl?: string; seed?: number };
  /** Some response shapes return resultUrls inside data. */
  resultUrls?: string[];
  costTime?: number;
  completeTime?: string;
}

function rawStateToTaskStatus(raw: string | undefined): TaskStatus {
  if (!raw) return "queued";
  const s = raw.toLowerCase();
  if (s === "success" || s === "completed" || s === "complete") return "completed";
  if (s === "fail" || s === "failed" || s === "error") return "failed";
  if (s === "generating" || s === "processing" || s === "running") return "running";
  return "queued"; // "waiting" / "queuing" / unknown → queued
}

async function submitTask(input: GenerationInput): Promise<SubmitOutput> {
  const body = {
    model: input.model.slug,
    input: {
      prompt: input.prompt,
      resolution: input.resolution,
      aspect_ratio: toKieAspectRatio(input.aspectRatio),
      duration: toKieDuration(input.duration),
      generate_audio: input.generateAudio,
      nsfw_checker: KIE_NSFW_CHECKER_DEFAULT,
      ...(input.seed !== undefined ? { seed: input.seed } : {}),
      ...(input.webSearch !== undefined ? { web_search: input.webSearch } : {}),
      ...(input.firstFrameUrl ? { first_frame_url: input.firstFrameUrl } : {}),
      ...(input.imageUrls.length
        ? { reference_image_urls: input.imageUrls }
        : {}),
      ...(input.videoUrls.length
        ? { reference_video_urls: input.videoUrls }
        : {}),
      ...(input.audioUrls.length
        ? { reference_audio_urls: input.audioUrls }
        : {}),
    },
  };
  const res = await fetch(`${KIE_API_BASE}${KIE_CREATE_TASK_PATH}`, {
    method: "POST",
    headers: { ...authHeader(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const env = await callKie<KieCreateTaskData>(res, "createTask");
  const taskId = env.data?.taskId;
  if (!taskId) throw new Error("KIE createTask returned no taskId.");
  return { taskId };
}

async function getStatus(taskId: string): Promise<StatusOutput> {
  const url = `${KIE_API_BASE}${KIE_GET_TASK_DETAIL_PATH}?taskId=${encodeURIComponent(taskId)}`;
  const res = await fetch(url, {
    method: "GET",
    headers: authHeader(),
    cache: "no-store",
  });
  const env = await callKie<KieTaskDetailData>(res, "get-task-detail");
  const data = env.data ?? {};
  const status = rawStateToTaskStatus(data.state);
  // KIE doesn't expose queue position; surface null.
  const logs: string[] = [];
  if (data.failMsg) logs.push(`fail: ${data.failMsg}`);
  return {
    taskId,
    status,
    queuePosition: null,
    logs,
    rawStatus: data.state ?? "unknown",
  };
}

interface ResultJsonShape {
  videoUrl?: string;
  video_url?: string;
  seed?: number;
  resultUrls?: string[];
}

function pickResult(data: KieTaskDetailData): ResultOutput {
  // 1. New shape — result.videoUrl
  if (data.result?.videoUrl) {
    return {
      videoUrl: data.result.videoUrl,
      seed: typeof data.result.seed === "number" ? data.result.seed : null,
    };
  }
  // 2. Legacy shape — resultUrls[0] is the video
  if (Array.isArray(data.resultUrls) && data.resultUrls.length > 0) {
    return { videoUrl: data.resultUrls[0], seed: null };
  }
  // 3. Stringified JSON in resultJson
  if (typeof data.resultJson === "string" && data.resultJson.length > 0) {
    try {
      const parsed = JSON.parse(data.resultJson) as ResultJsonShape;
      const url = parsed.videoUrl ?? parsed.video_url ?? parsed.resultUrls?.[0];
      if (url) {
        return {
          videoUrl: url,
          seed: typeof parsed.seed === "number" ? parsed.seed : null,
        };
      }
    } catch {
      // fall through
    }
  }
  throw new Error("KIE task completed but no video URL was returned.");
}

async function getResult(taskId: string): Promise<ResultOutput> {
  const url = `${KIE_API_BASE}${KIE_GET_TASK_DETAIL_PATH}?taskId=${encodeURIComponent(taskId)}`;
  const res = await fetch(url, {
    method: "GET",
    headers: authHeader(),
    cache: "no-store",
  });
  const env = await callKie<KieTaskDetailData>(res, "get-task-detail (result)");
  const data = env.data ?? {};
  if (data.state && rawStateToTaskStatus(data.state) === "failed") {
    throw new Error(`KIE generation failed: ${data.failMsg ?? "no detail"}`);
  }
  if (data.state && rawStateToTaskStatus(data.state) !== "completed") {
    throw new Error(`KIE task is still ${data.state}; not ready.`);
  }
  return pickResult(data);
}

// ---------------------------------------------------------------------------
// Public Provider implementation
// ---------------------------------------------------------------------------
export const kieProvider: VideoProvider = {
  async uploadFromBuffer(buffer, filename, mimeType) {
    if (buffer.byteLength < KIE_BASE64_MAX_BYTES) {
      return uploadBase64(buffer, filename, mimeType);
    }
    return uploadStream(buffer, filename, mimeType);
  },
  submit: submitTask,
  status: getStatus,
  result: getResult,
};

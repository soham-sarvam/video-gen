/**
 * Sarvam Bulbul v3 client — synthesises Indic dialogue audio for the
 * editor's "Bulbul" mode.
 *
 * The API returns base64-encoded WAV inside a JSON envelope (no file
 * URL), so we decode and write the bytes to disk ourselves. The on-disk
 * WAV path is what we hand to the FFmpeg muxer in the finalize route.
 *
 * Endpoint shape (April 2026 docs):
 *   POST https://api.sarvam.ai/text-to-speech
 *   Header: api-subscription-key: <SARVAM_API_KEY>
 *   Body: {
 *     text, target_language_code, model, speaker,
 *     output_audio_codec, speech_sample_rate, pace, temperature,
 *   }
 *   Response: { request_id, audios: [base64 string] }
 *
 * No SDK exists for Node.js as of this writing — fetch is the simplest
 * dependency-free integration, mirroring how `lib/gemini-client.ts`
 * uses the official SDK and `lib/fal-client.ts` uses @fal-ai/client.
 */
import { writeFile } from "node:fs/promises";
import {
  BULBUL_DEFAULT_SPEAKER,
  BULBUL_MODEL,
  BULBUL_SAMPLE_RATE,
  BULBUL_TEXT_MAX_CHARS,
  type BulbulVoice,
  type IndicLanguageCode,
  SARVAM_TTS_ENDPOINT,
  toSarvamLanguageCode,
} from "./constants";

interface SarvamTtsRequestBody {
  text: string;
  target_language_code: string;
  model: string;
  speaker: string;
  output_audio_codec: "wav" | "mp3" | "pcm" | "aac";
  speech_sample_rate: number;
  /** 0.5–2.0; 1.0 = natural pace. */
  pace: number;
  /** 0.01–2.0; lower = more deterministic. */
  temperature: number;
}

interface SarvamTtsResponseBody {
  request_id?: string;
  audios?: string[];
  /** Sarvam's error envelope shape varies; surface anything we get. */
  error?: { message?: string; code?: string } | string;
  message?: string;
}

export interface SynthesizeBulbulParams {
  text: string;
  language: IndicLanguageCode;
  /** Defaults to BULBUL_DEFAULT_SPEAKER. */
  speaker?: BulbulVoice;
  /** Local on-disk path to write the resulting WAV file to. */
  outPath: string;
}

export interface SynthesizeBulbulResult {
  /** Echoed for caller logging. */
  outPath: string;
  /** Bytes written to disk — useful for "audio too long" warnings. */
  byteCount: number;
  /** Sarvam's request id, surfaced for support / debugging. */
  requestId: string | null;
}

/** Pull a useful message out of either of Sarvam's two error shapes. */
function extractSarvamError(
  body: SarvamTtsResponseBody | null,
  status: number,
  statusText: string,
): string {
  if (body) {
    if (typeof body.error === "string") return body.error;
    if (body.error && typeof body.error === "object") {
      return body.error.message ?? body.error.code ?? `${status} ${statusText}`;
    }
    if (typeof body.message === "string") return body.message;
  }
  return `${status} ${statusText}`;
}

/**
 * Synthesises an Indic dialogue clip via Bulbul v3 and writes the
 * resulting WAV to `outPath`. Throws with a useful message on auth /
 * quota / validation failures so the editor can surface them to the
 * user instead of hanging indefinitely.
 */
export async function synthesizeBulbul(
  params: SynthesizeBulbulParams,
): Promise<SynthesizeBulbulResult> {
  const apiKey = process.env.SARVAM_API_KEY;
  if (!apiKey) {
    throw new Error(
      "SARVAM_API_KEY is not configured on the server. Add it to .env to enable Indic dialogue regeneration.",
    );
  }

  const text = params.text.trim();
  if (!text) {
    throw new Error("Bulbul text cannot be empty.");
  }
  if (text.length > BULBUL_TEXT_MAX_CHARS) {
    throw new Error(
      `Bulbul text is ${text.length} characters; max allowed is ${BULBUL_TEXT_MAX_CHARS}.`,
    );
  }

  const body: SarvamTtsRequestBody = {
    text,
    target_language_code: toSarvamLanguageCode(params.language),
    model: BULBUL_MODEL,
    speaker: params.speaker ?? BULBUL_DEFAULT_SPEAKER,
    output_audio_codec: "wav",
    speech_sample_rate: BULBUL_SAMPLE_RATE,
    pace: 1.0,
    temperature: 0.6,
  };

  const res = await fetch(SARVAM_TTS_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-subscription-key": apiKey,
    },
    body: JSON.stringify(body),
  });

  // Some Sarvam errors come back as plain text; guard the parse.
  let parsed: SarvamTtsResponseBody | null = null;
  try {
    parsed = (await res.json()) as SarvamTtsResponseBody;
  } catch {
    parsed = null;
  }

  if (!res.ok) {
    throw new Error(
      `Sarvam TTS failed: ${extractSarvamError(parsed, res.status, res.statusText)}`,
    );
  }
  if (!parsed?.audios || parsed.audios.length === 0) {
    throw new Error("Sarvam TTS returned no audio.");
  }

  // Bulbul returns one base64 chunk per text input; we send a single
  // text so we just take audios[0]. If we ever start chunking long
  // dialogue, concat all chunks here in order before writing.
  const buf = Buffer.from(parsed.audios[0], "base64");
  await writeFile(params.outPath, buf);

  return {
    outPath: params.outPath,
    byteCount: buf.byteLength,
    requestId: parsed.request_id ?? null,
  };
}

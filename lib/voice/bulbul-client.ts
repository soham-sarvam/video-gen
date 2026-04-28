/**
 * Sarvam Bulbul v3 Text-to-Speech wrapper.
 * Endpoint: POST https://api.sarvam.ai/text-to-speech
 * Auth: api-subscription-key header (NOT Bearer).
 * Returns { request_id, audios: [base64WavString, ...] }; multiple chunks concatenate.
 */
import type { IndicLanguageCode } from "@/lib/constants";

const SARVAM_TTS_URL = "https://api.sarvam.ai/text-to-speech";

export type BulbulSpeaker =
  | "shubh" | "ishita" | "aditya" | "ritu" | "priya" | "neha"
  | "rahul" | "pooja" | "rohan" | "simran" | "kavya" | "amit"
  | "dev" | "shreya";

export interface BulbulSynthesizeInput {
  text: string;
  languageCode: IndicLanguageCode;
  speaker: BulbulSpeaker;
  sampleRate?: number;
}

export interface BulbulSynthesizeOutput {
  wavBuffer: Buffer;
  requestId: string;
}

function getApiKey(): string {
  const key = process.env.BULBUL_TTS_API_KEY;
  if (!key) throw new Error("BULBUL_TTS_API_KEY is not configured on the server.");
  return key;
}

interface RawResponse { request_id?: string; audios?: string[]; }

export async function synthesize(input: BulbulSynthesizeInput): Promise<BulbulSynthesizeOutput> {
  const res = await fetch(SARVAM_TTS_URL, {
    method: "POST",
    headers: {
      "api-subscription-key": getApiKey(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text: input.text,
      target_language_code: input.languageCode,
      model: "bulbul:v3",
      speaker: input.speaker,
      speech_sample_rate: input.sampleRate ?? 24000,
    }),
  });
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Bulbul ${res.status}: ${errBody.slice(0, 300)}`);
  }
  const json = (await res.json()) as RawResponse;
  if (!json.audios || json.audios.length === 0) {
    throw new Error("Bulbul returned no audio chunks.");
  }
  const buffers = json.audios.map((b64) => Buffer.from(b64, "base64"));
  return { wavBuffer: Buffer.concat(buffers), requestId: json.request_id ?? "" };
}

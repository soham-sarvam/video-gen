/**
 * Caches one canonical Bulbul-derived MP3 per (languageCode, speaker) pair.
 *
 * Layout under public/uploads/voice-cache/:
 *   <lang-lc>-<speaker>.mp3      audio bytes (≤14s, libmp3lame 96k mono 24kHz)
 *   <lang-lc>-<speaker>.json     { fal, kie, archivedAt } provider URLs
 *
 * Hardened (B8.1) over the original WAV cache:
 *   - Shorter calibration texts (~3s target speech) reduce overrun risk.
 *   - Hard 14s clamp at encode time (ffmpeg -t 14) guarantees ≤15s for
 *     Seedance audio_urls regardless of Bulbul's actual pace.
 *   - MP3 (CBR 96 kbps mono) keeps file under ~170 KB even at 14s, well
 *     under Seedance's 15 MB cap.
 *
 * Per (lang, speaker) pair: one Bulbul call ever, one ffmpeg encode ever,
 * one upload to FAL + KIE ever. All subsequent calls are file-system reads.
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { type IndicLanguageCode, UPLOAD_DIR_NAME } from "@/lib/constants";
import { falProvider } from "@/lib/providers/fal";
import { kieProvider } from "@/lib/providers/kie";
import { type BulbulSpeaker, synthesize } from "./bulbul-client";
import { encodeWavToMp3 } from "./audio-encode";

/**
 * Short calibration texts (~30-40 chars, ~3s of speech). Bulbul's pace
 * varies by language and speaker; the 14s clamp at encode time is the
 * real safety net. These short prompts just give it less to overrun.
 */
const CALIBRATION_TEXTS: Partial<Record<IndicLanguageCode, string>> = {
  "hi-IN": "नमस्कार। मेरी आवाज़ साफ़ है।",
  "ta-IN": "வணக்கம். என் குரல் தெளிவாக உள்ளது.",
  "te-IN": "నమస్కారం. నా గొంతు స్పష్టంగా ఉంది.",
  "bn-IN": "নমস্কার। আমার কণ্ঠস্বর স্পষ্ট।",
  "mr-IN": "नमस्कार. माझा आवाज स्पष्ट आहे.",
  "gu-IN": "નમસ્તે. મારો અવાજ સ્પષ્ટ છે.",
  "kn-IN": "ನಮಸ್ಕಾರ. ನನ್ನ ಧ್ವನಿ ಸ್ಪಷ್ಟವಾಗಿದೆ.",
  "ml-IN": "നമസ്കാരം. എന്റെ ശബ്ദം വ്യക്തമാണ്.",
  "pa-IN": "ਨਮਸਤੇ। ਮੇਰੀ ਆਵਾਜ਼ ਸਪਸ਼ਟ ਹੈ।",
  "or-IN": "ନମସ୍କାର। ମୋର ସ୍ୱର ସ୍ପଷ୍ଟ।",
  "en-IN": "Hello. My voice is clear and steady.",
};

export interface CachedVoice {
  /** Same-origin local path to the MP3 (debug + inspection). */
  localPath: string;
  /** Provider CDN URLs for use as @audio1 in beat requests. */
  cdnUrls: { fal?: string; kie?: string };
  /** True if this hit the cache, false if freshly synthesized. */
  reused: boolean;
}

interface CacheManifest {
  fal?: string;
  kie?: string;
  archivedAt: string;
}

export function cacheKey(language: IndicLanguageCode, speaker: BulbulSpeaker): string {
  return `${language.toLowerCase()}-${speaker}`;
}

function cacheDir(): string {
  return path.join(process.cwd(), "public", UPLOAD_DIR_NAME, "voice-cache");
}

function calibrationFor(language: IndicLanguageCode): string {
  return CALIBRATION_TEXTS[language] ?? "Hello. My voice is clear and steady.";
}

export interface GetCachedVoiceInput {
  languageCode: IndicLanguageCode;
  speaker: BulbulSpeaker;
}

export async function getCachedVoice(
  input: GetCachedVoiceInput,
): Promise<CachedVoice> {
  await mkdir(cacheDir(), { recursive: true });
  const key = cacheKey(input.languageCode, input.speaker);
  const mp3Path = path.join(cacheDir(), `${key}.mp3`);
  const manifestPath = path.join(cacheDir(), `${key}.json`);

  if (existsSync(mp3Path) && existsSync(manifestPath)) {
    const manifest = JSON.parse(await readFile(manifestPath, "utf-8")) as CacheManifest;
    return {
      localPath: mp3Path,
      cdnUrls: { fal: manifest.fal, kie: manifest.kie },
      reused: true,
    };
  }

  // Cold path: Bulbul WAV → ffmpeg MP3 (≤14s clamp) → upload to FAL+KIE → cache.
  const { wavBuffer } = await synthesize({
    text: calibrationFor(input.languageCode),
    languageCode: input.languageCode,
    speaker: input.speaker,
  });
  const mp3Buffer = await encodeWavToMp3(wavBuffer);
  await writeFile(mp3Path, mp3Buffer);

  const filename = `${key}.mp3`;
  const [falUrl, kieUrl] = await Promise.all([
    falProvider.uploadFromBuffer(mp3Buffer, filename, "audio/mpeg").catch(() => undefined),
    kieProvider.uploadFromBuffer(mp3Buffer, filename, "audio/mpeg").catch(() => undefined),
  ]);

  const manifest: CacheManifest = {
    fal: falUrl,
    kie: kieUrl,
    archivedAt: new Date().toISOString(),
  };
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));

  return {
    localPath: mp3Path,
    cdnUrls: { fal: falUrl, kie: kieUrl },
    reused: false,
  };
}

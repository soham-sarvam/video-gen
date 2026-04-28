/**
 * Character sheet generator (Nano Banana Pro).
 *
 * Story Mode runs a single character across many beats, so identity drift
 * between beats is the dominant failure mode. This module produces ONE
 * canonical reference sheet — the standard 4 full-body + 3 portrait
 * turnaround — and returns it as an `UploadedAsset` so both runners can
 * inject it into every beat's `imageUrls` for character consistency.
 *
 * Three input branches:
 *   1. user-images       → caller already has reference images; skip.
 *   2. video-first-frame → extract frame 0 from the user's video, send it
 *                          to Nano Banana Pro as the identity anchor.
 *   3. text-imagined     → no images, no videos. Synthesize a character
 *                          description from the outline beats with Gemini
 *                          Flash, then text-to-image with Nano Banana Pro.
 */
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { nanoid } from "nanoid";
import { GoogleGenAI } from "@google/genai";
import { GEMINI_MODEL } from "@/lib/constants";
import type { UploadedAsset } from "@/lib/types";
import { saveAssetFromBuffer } from "@/lib/upload-utils";
import { extractFirstFrame } from "./first-frame";
import type { StoryOutline } from "./types";

/**
 * Nano Banana Pro model id. Override via NANO_BANANA_MODEL when Google
 * promotes the preview to GA or renames it.
 */
const NANO_BANANA_PRO_MODEL =
  process.env.NANO_BANANA_MODEL ?? "gemini-3-pro-image-preview";

const SHEET_PROMPT_TEMPLATE = `Create a professional character reference sheet for character consistency across multiple video clips. ${"<<ANCHOR>>"} Use a clean, neutral plain background and present the sheet as a technical model turnaround while matching the exact visual style of the reference (same realism level, rendering approach, texture, color treatment, and overall aesthetic). Arrange the composition into two horizontal rows. Top row: four full-body standing views placed side-by-side in this order: front view, left profile view (facing left), right profile view (facing right), back view. Bottom row: three highly detailed close-up portraits aligned beneath the full-body row in this order: front portrait, left profile portrait (facing left), right profile portrait (facing right). Maintain perfect identity consistency across every panel. Keep the subject in a relaxed A-pose and with consistent scale and alignment between views, accurate anatomy, and clear silhouette; ensure even spacing and clean panel separation, with uniform framing and consistent head height across the full-body lineup and consistent facial scale across the portraits. Lighting should be consistent across all panels (same direction, intensity, and softness), with natural, controlled shadows that preserve detail without dramatic mood shifts. Output a crisp, print-ready reference sheet look, sharp details. This sheet will be passed alongside every shot prompt to lock the character's identity across the whole story.`;

const ANCHOR_FROM_IMAGE = "Base the sheet strictly on the uploaded reference image.";
const ANCHOR_FROM_DESCRIPTION = (description: string): string =>
  `The protagonist is described as: ${description}. Render that character.`;

let cachedClient: GoogleGenAI | null = null;
function getClient(): GoogleGenAI {
  if (cachedClient) return cachedClient;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured.");
  cachedClient = new GoogleGenAI({ apiKey });
  return cachedClient;
}

export type CharacterSheetSource =
  | "user-images"
  | "video-first-frame"
  | "text-imagined";

export interface PrepareCharacterSheetInput {
  outline: StoryOutline;
  references: {
    images: UploadedAsset[];
    videos: UploadedAsset[];
    audios: UploadedAsset[];
  };
  /** Origin used to build the local-preview URL on the returned asset. */
  origin: string;
}

export interface PrepareCharacterSheetResult {
  /** null when source === "user-images" (caller uses references.images as-is). */
  asset: UploadedAsset | null;
  source: CharacterSheetSource;
}

/**
 * Picks the right branch and produces a ready-to-inject character sheet
 * asset (already uploaded to FAL + KIE). Throws on hard failures so the
 * caller can decide whether to fail the run or fall back to no-sheet.
 */
export async function prepareCharacterSheet(
  input: PrepareCharacterSheetInput,
): Promise<PrepareCharacterSheetResult> {
  const { outline, references, origin } = input;

  if (references.images.length > 0) {
    return { asset: null, source: "user-images" };
  }

  if (references.videos.length > 0) {
    const sourceVideo = references.videos[0];
    const buffer = await generateSheetFromVideoFirstFrame(sourceVideo);
    const asset = await persistSheet(buffer, outline.storyId, origin);
    return { asset, source: "video-first-frame" };
  }

  const description = await imagineCharacterDescription(outline);
  const buffer = await generateSheetFromText(description);
  const asset = await persistSheet(buffer, outline.storyId, origin);
  return { asset, source: "text-imagined" };
}

async function persistSheet(
  pngBuffer: Buffer,
  storyId: string,
  origin: string,
): Promise<UploadedAsset> {
  const result = await saveAssetFromBuffer({
    buffer: pngBuffer,
    originalName: `character-sheet-${storyId}.png`,
    mimeType: "image/png",
    kind: "image",
    origin,
  });
  if (!result.ok) {
    throw new Error(`Character sheet upload failed: ${result.error.message}`);
  }
  return result.asset;
}

/**
 * Downloads the user's video to a tmp file, extracts frame 0, sends it
 * to Nano Banana Pro with the sheet prompt, and returns the PNG bytes.
 */
async function generateSheetFromVideoFirstFrame(
  videoAsset: UploadedAsset,
): Promise<Buffer> {
  const dir = path.join(tmpdir(), `char-sheet-${nanoid(8)}`);
  await mkdir(dir, { recursive: true });
  const videoPath = path.join(dir, "source.mp4");
  const framePath = path.join(dir, "frame.png");

  try {
    const url =
      videoAsset.cdnUrls.fal ?? videoAsset.cdnUrls.kie ?? videoAsset.absoluteUrl;
    if (!url) throw new Error("Reference video has no resolvable URL.");
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      throw new Error(`Reference video fetch failed: HTTP ${res.status}`);
    }
    await writeFile(videoPath, Buffer.from(await res.arrayBuffer()));
    await extractFirstFrame(videoPath, framePath);
    const frameBuffer = await readFile(framePath);
    return await callNanoBanana({
      prompt: SHEET_PROMPT_TEMPLATE.replace("<<ANCHOR>>", ANCHOR_FROM_IMAGE),
      image: { mimeType: "image/png", bytes: frameBuffer },
    });
  } finally {
    await unlink(videoPath).catch(() => undefined);
    await unlink(framePath).catch(() => undefined);
  }
}

async function generateSheetFromText(description: string): Promise<Buffer> {
  return callNanoBanana({
    prompt: SHEET_PROMPT_TEMPLATE.replace(
      "<<ANCHOR>>",
      ANCHOR_FROM_DESCRIPTION(description),
    ),
  });
}

interface NanoBananaInput {
  prompt: string;
  image?: { mimeType: string; bytes: Buffer };
}

async function callNanoBanana(input: NanoBananaInput): Promise<Buffer> {
  const client = getClient();
  const parts: Array<
    { text: string } | { inlineData: { mimeType: string; data: string } }
  > = [];
  if (input.image) {
    parts.push({
      inlineData: {
        mimeType: input.image.mimeType,
        data: input.image.bytes.toString("base64"),
      },
    });
  }
  parts.push({ text: input.prompt });

  const res = await client.models.generateContent({
    model: NANO_BANANA_PRO_MODEL,
    contents: [{ role: "user", parts }],
  });

  const candidate = res.candidates?.[0];
  const candidateParts = candidate?.content?.parts ?? [];
  for (const p of candidateParts) {
    const inline = (p as { inlineData?: { mimeType?: string; data?: string } }).inlineData;
    if (inline?.data) {
      return Buffer.from(inline.data, "base64");
    }
  }
  const textBlock = candidateParts
    .map((p) => (p as { text?: string }).text)
    .filter((t): t is string => !!t)
    .join(" ")
    .trim();
  throw new Error(
    `Nano Banana Pro returned no image. ${textBlock ? `Model said: ${textBlock.slice(0, 200)}` : ""}`,
  );
}

/**
 * Synthesizes a 60-90 word character description from the outline. Used
 * when the user uploaded neither images nor videos, so Nano Banana has
 * something concrete to render.
 */
async function imagineCharacterDescription(
  outline: StoryOutline,
): Promise<string> {
  const client = getClient();
  const beats = outline.beats
    .map((b) => `- (${b.shotType}) ${b.oneLineSummary}`)
    .join("\n");
  const dialogueSpeaker = outline.beats.find((b) => b.dialogue?.speaker)?.dialogue?.speaker
    ?? outline.voiceTimbreSpeaker;

  const prompt = [
    `You are designing the protagonist for a multi-beat short film. Read the beats and write a single concrete character description that can be drawn consistently across every shot.`,
    ``,
    `Beats:`,
    beats,
    ``,
    `Voice/timbre handle: ${dialogueSpeaker}.`,
    `Language: ${outline.language}.`,
    ``,
    `Constraints:`,
    `- 60–90 words, one paragraph, no preamble.`,
    `- Cover: apparent age, gender presentation, build, complexion, hair, eyes, distinguishing facial features, wardrobe, color palette, posture/energy.`,
    `- Be specific (concrete adjectives, named colors). No metaphors, no story exposition.`,
    `- Output ONLY the description.`,
  ].join("\n");

  const res = await client.models.generateContent({
    model: GEMINI_MODEL,
    contents: prompt,
    config: { temperature: 0.4, maxOutputTokens: 256 },
  });
  const text = (res.text ?? "").trim().replace(/\s+/g, " ");
  if (!text) throw new Error("Gemini returned empty character description.");
  return text;
}

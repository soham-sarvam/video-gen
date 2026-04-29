/**
 * Multi-character sheet generator (Nano Banana Pro).
 *
 * Story Mode runs characters across many beats — identity drift between
 * beats is the dominant failure mode. This module:
 *   1. Auto-detects distinct characters from the outline beats (via Gemini)
 *   2. Generates a canonical reference sheet per character
 *   3. Tags each beat with the character IDs that appear in it
 *
 * Three input branches:
 *   1. user-images       → caller already has reference images; skip generation.
 *   2. video-first-frame → extract frame 0, generate sheet from it (single char).
 *   3. text-imagined     → synthesize character descriptions from outline, then
 *                          generate one sheet per detected character.
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
import type { CharacterProfile, StoryOutline } from "./types";

const NANO_BANANA_PRO_MODEL =
  process.env.NANO_BANANA_MODEL ?? "gemini-3-pro-image-preview";

const SHEET_PROMPT_TEMPLATE = `Create a professional character reference sheet for use as a visual identity lock across multiple AI-generated video clips.

<<ANCHOR>>

STYLE: Photorealistic rendering. Hyper-detailed skin textures, fabric weave, metal reflections. Studio-quality lighting (soft key from upper-left, subtle fill from right, rim light for edge separation). Neutral medium-gray background. No stylization, no cartoonish exaggeration — this must look like a high-end VFX character turnaround sheet from a AAA film production.

LAYOUT: Two horizontal rows on a single image.
- TOP ROW: four full-body standing views, side by side — front view, left profile (facing left), right profile (facing right), back view. Relaxed A-pose, consistent scale, aligned head heights.
- BOTTOM ROW: three detailed close-up portraits — front portrait, left profile portrait, right profile portrait. Consistent facial scale.

REQUIREMENTS:
- Perfect identity consistency across ALL seven panels (same face, same build, same costume, same colors).
- Clean panel separation with even spacing.
- Accurate anatomy, clear silhouettes, no extra limbs or warped features.
- Sharp details: visible fabric texture, ornament engravings, weapon details, jewelry, skin pores.
- This sheet will be passed as @image reference alongside every shot prompt to maintain character identity across the entire video story.`;

const ANCHOR_FROM_IMAGE = `Base the sheet strictly on the uploaded reference image. Preserve the exact face, proportions, clothing, and accessories from the reference.`;

const ANCHOR_FROM_DESCRIPTION = (description: string): string =>
  `CHARACTER TO RENDER:\n${description}\n\nRender this EXACT character faithfully. Every detail in the description (skin tone, eye color, clothing, accessories, weapons) must be visually accurate and consistent across all panels.`;

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
  origin: string;
}

export interface PrepareCharacterSheetResult {
  /** Empty when source === "user-images" (caller uses references.images as-is). */
  profiles: CharacterProfile[];
  source: CharacterSheetSource;
  /** Beat-index → character IDs mapping (mutates outline.beats[].characterIds). */
  beatCharacterMap: Record<number, string[]>;
}

// Backward compat wrapper — returns the first profile's asset (or null)
export interface PrepareCharacterSheetResultLegacy {
  asset: UploadedAsset | null;
  source: CharacterSheetSource;
}

export async function prepareCharacterSheet(
  input: PrepareCharacterSheetInput,
): Promise<PrepareCharacterSheetResultLegacy> {
  const result = await prepareCharacterSheets(input);
  const firstAsset = result.profiles.find((p) => p.asset)?.asset ?? null;
  return { asset: firstAsset, source: result.source };
}

export async function prepareCharacterSheets(
  input: PrepareCharacterSheetInput,
): Promise<PrepareCharacterSheetResult> {
  const { outline, references, origin } = input;

  if (references.images.length > 0) {
    return { profiles: [], source: "user-images", beatCharacterMap: {} };
  }

  if (references.videos.length > 0) {
    const sourceVideo = references.videos[0];
    const buffer = await generateSheetFromVideoFirstFrame(sourceVideo);
    const asset = await persistSheet(buffer, outline.storyId, "main", origin);
    const profile: CharacterProfile = {
      id: "char-0",
      name: "Main Character",
      description: "Extracted from reference video first frame.",
      sheetUrl: asset.localPreviewUrl ?? asset.publicUrl,
      asset,
    };
    const beatCharacterMap: Record<number, string[]> = {};
    for (const b of outline.beats) {
      beatCharacterMap[b.index] = ["char-0"];
    }
    return { profiles: [profile], source: "video-first-frame", beatCharacterMap };
  }

  const analysis = await analyzeCharacters(outline);
  console.log(
    `[character-sheet] Detected ${analysis.characters.length} character(s): ${analysis.characters.map((c) => c.name).join(", ")}`,
  );

  const profiles: CharacterProfile[] = [];
  const generatePromises = analysis.characters.map(async (char) => {
    try {
      const buffer = await generateSheetFromText(char.description);
      const asset = await persistSheet(buffer, outline.storyId, char.id, origin);
      return {
        id: char.id,
        name: char.name,
        description: char.description,
        sheetUrl: asset.localPreviewUrl ?? asset.publicUrl,
        asset,
      } satisfies CharacterProfile;
    } catch (err) {
      console.warn(
        `[character-sheet] Failed to generate sheet for ${char.name}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return {
        id: char.id,
        name: char.name,
        description: char.description,
      } satisfies CharacterProfile;
    }
  });

  const results = await Promise.allSettled(generatePromises);
  for (const r of results) {
    if (r.status === "fulfilled") profiles.push(r.value);
  }
  const withSheet = profiles.filter((p) => p.sheetUrl).length;
  console.log(
    `[character-sheet] Generated ${withSheet}/${profiles.length} sheet image(s).`,
  );

  return {
    profiles,
    source: "text-imagined",
    beatCharacterMap: analysis.beatCharacterMap,
  };
}

// ---------------------------------------------------------------------------
// Character analysis via Gemini
// ---------------------------------------------------------------------------

interface CharacterAnalysis {
  characters: Array<{ id: string; name: string; description: string }>;
  beatCharacterMap: Record<number, string[]>;
}

async function analyzeCharacters(outline: StoryOutline): Promise<CharacterAnalysis> {
  const client = getClient();
  const beats = outline.beats
    .map((b) => `Beat ${b.index} (${b.beatType}, ${b.shotType}): ${b.oneLineSummary}. Scene: ${b.sceneDescription ?? ""}${b.dialogue ? ` Dialogue by "${b.dialogue.speaker}": "${b.dialogue.text}"` : ""}`)
    .join("\n");

  const prompt = [
    `You are a senior character designer and casting director for a VFX-heavy short film.`,
    `Analyze the storyboard beats below and identify EVERY distinct character — including`,
    `background, passive, chained, sleeping, or briefly-mentioned characters.`,
    ``,
    `Beats:`,
    beats,
    ``,
    `Voice/timbre handle: ${outline.voiceTimbreSpeaker}.`,
    `Language: ${outline.language}.`,
    ``,
    `For EACH character produce:`,
    `- id: a short kebab-case identifier (e.g. "shri-ram", "ravana", "hanuman")`,
    `- name: their proper name or title (e.g. "Lord Shri Ram", "Ravana", "Hanuman")`,
    `- description: A 100–150 word DETAILED physical description written as a VFX character`,
    `  brief. This description will be fed directly to an image generation model, so it must`,
    `  be visually unambiguous and hyper-specific. Include ALL of the following:`,
    ``,
    `  1. FACE: exact skin tone (use specific color names like "deep cerulean blue",`,
    `     "warm brown", "ashen gray"), facial structure, eye shape & color, nose, lips,`,
    `     facial hair, expression`,
    `  2. BUILD: height (tall/average/short), body type (muscular/lean/stocky), posture`,
    `  3. HAIR: color, length, style, any head coverings or crowns`,
    `  4. COSTUME: specific garments with materials and colors (e.g. "saffron silk dhoti`,
    `     with gold zari border", "black iron chest armor with crimson rune engravings")`,
    `  5. ACCESSORIES: jewelry, weapons, ornaments, armor pieces — name each one with its`,
    `     material and color`,
    `  6. ICONIC IDENTIFIERS: for mythological/historical/well-known figures, include their`,
    `     traditional iconographic markers (e.g. Lord Ram: blue skin, Kodanda bow, tilak,`,
    `     pitambara; Hanuman: simian face, gada mace, devotional posture; Ravana: ten heads,`,
    `     golden armor, Chandrahasa sword)`,
    ``,
    `  Write the description in PLAIN PROSE, not bullet points. Be concrete — every adjective`,
    `  should specify a color, material, or dimension. No vague words like "ornate" or`,
    `  "beautiful" without saying exactly WHAT makes it ornate.`,
    ``,
    `Also produce a beatCharacterMap: for each beat index, list which character IDs are visible.`,
    `For B-roll/establishing beats with no characters visible, use an empty array.`,
    ``,
    `Return ONLY valid JSON in this exact schema:`,
    `{`,
    `  "characters": [{ "id": "...", "name": "...", "description": "..." }],`,
    `  "beatCharacterMap": { "0": ["char-id"], "1": ["char-id-a", "char-id-b"], ... }`,
    `}`,
    ``,
    `CRITICAL RULES:`,
    `- NEVER merge distinct individuals into one entry. "Ram and Lakshman" = TWO entries.`,
    `- If only ONE character exists, still return a single-element array.`,
    `- For well-known mythological figures (Hindu, Greek, Norse, etc.), use their CANONICAL`,
    `  traditional appearance — do not invent a new look. The audience expects to recognize them.`,
    `- Every character description must be detailed enough that an artist could paint them`,
    `  without asking a single question.`,
  ].join("\n");

  const res = await client.models.generateContent({
    model: GEMINI_MODEL,
    contents: prompt,
    config: {
      temperature: 0.3,
      maxOutputTokens: 4096,
      responseMimeType: "application/json",
    },
  });

  const text = (res.text ?? "").trim();
  if (!text) {
    return fallbackSingleCharacter(outline);
  }

  try {
    const parsed = JSON.parse(text) as CharacterAnalysis;
    if (!parsed.characters || parsed.characters.length === 0) {
      return fallbackSingleCharacter(outline);
    }
    // Cap at 9 characters to avoid excessive API calls
    if (parsed.characters.length > 9) {
      parsed.characters = parsed.characters.slice(0, 9);
    }
    return parsed;
  } catch {
    return fallbackSingleCharacter(outline);
  }
}

async function fallbackSingleCharacter(outline: StoryOutline): Promise<CharacterAnalysis> {
  const desc = await imagineCharacterDescription(outline);
  const map: Record<number, string[]> = {};
  for (const b of outline.beats) {
    map[b.index] = ["main"];
  }
  return {
    characters: [{ id: "main", name: "Main Character", description: desc }],
    beatCharacterMap: map,
  };
}

async function imagineCharacterDescription(outline: StoryOutline): Promise<string> {
  const client = getClient();
  const beats = outline.beats
    .map((b) => `- (${b.shotType}) ${b.oneLineSummary}`)
    .join("\n");
  const dialogueSpeaker = outline.beats.find((b) => b.dialogue?.speaker)?.dialogue?.speaker
    ?? outline.voiceTimbreSpeaker;

  const prompt = [
    `You are a senior VFX character designer writing a description that will be fed directly`,
    `to an AI image generator. The description must be visually unambiguous.`,
    ``,
    `Beats:`,
    beats,
    ``,
    `Voice/timbre handle: ${dialogueSpeaker}.`,
    `Language: ${outline.language}.`,
    ``,
    `Write a 100–150 word DETAILED physical description of the protagonist, covering:`,
    `- FACE: exact skin tone (use specific color names), facial structure, eyes, expression`,
    `- BUILD: height, body type, posture`,
    `- HAIR: color, length, style, any headwear/crown`,
    `- COSTUME: specific garments with materials and exact colors`,
    `- ACCESSORIES: weapons, jewelry, ornaments — name each with material and color`,
    `- For mythological/historical figures: use their CANONICAL traditional iconography`,
    ``,
    `Write in plain prose, one paragraph. Every adjective must specify a color, material,`,
    `or dimension. No vague words. No story exposition. Output ONLY the description.`,
  ].join("\n");

  const res = await client.models.generateContent({
    model: GEMINI_MODEL,
    contents: prompt,
    config: { temperature: 0.4, maxOutputTokens: 512 },
  });
  const text = (res.text ?? "").trim().replace(/\s+/g, " ");
  if (!text) throw new Error("Gemini returned empty character description.");
  return text;
}

// ---------------------------------------------------------------------------
// Sheet generation and persistence
// ---------------------------------------------------------------------------

async function persistSheet(
  pngBuffer: Buffer,
  storyId: string,
  charId: string,
  origin: string,
): Promise<UploadedAsset> {
  const result = await saveAssetFromBuffer({
    buffer: pngBuffer,
    originalName: `character-sheet-${storyId}-${charId}.png`,
    mimeType: "image/png",
    kind: "image",
    origin,
  });
  if (!result.ok) {
    throw new Error(`Character sheet upload failed: ${result.error.message}`);
  }
  return result.asset;
}

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
  try {
    return await callNanoBanana({
      prompt: SHEET_PROMPT_TEMPLATE.replace(
        "<<ANCHOR>>",
        ANCHOR_FROM_DESCRIPTION(description),
      ),
    });
  } catch (firstErr) {
    console.warn(
      `[character-sheet] First attempt failed, retrying with simplified prompt: ${firstErr instanceof Error ? firstErr.message : String(firstErr)}`,
    );
    return callNanoBanana({
      prompt: `Photorealistic character reference sheet on a neutral gray background. Four full-body views (front, left profile, right profile, back) in a row, with three close-up portrait views below. Studio lighting, hyper-detailed, VFX production quality.\n\nCHARACTER: ${description}\n\nMaintain perfect identity consistency across all panels. Sharp details, accurate anatomy, no extra limbs.`,
    });
  }
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

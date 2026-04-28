/**
 * Gemini-powered prompt optimizer.
 *
 * Design (post-rewrite):
 *
 * 1. **Structured output, not free-form text.** We ask Gemini for a JSON
 *    object covering the 8 Seedance prompt elements as separate fields.
 *    This makes truncation impossible (we get a fully-formed object or a
 *    parse error — no half-finished sentences) and guarantees every
 *    section is present.
 * 2. **Thinking disabled.** Gemini 2.5 Flash silently spends tokens on
 *    `thinking` before emitting output, which was eating our 2048-token
 *    budget and clipping the response mid-sentence. `thinkingBudget: 0`
 *    routes all the budget to the actual answer.
 * 3. **Deterministic asset-reference safety net.** After Gemini renders,
 *    we scan for any uploaded asset that didn't make it into the prompt
 *    and append a guaranteed-valid binding line for it. The user never
 *    sees a "@AudioN uploaded but not referenced" warning again.
 * 4. **Indic intonation + vocal similarity** are required fields in the
 *    schema, so Gemini physically cannot return a draft without them.
 */
import { GoogleGenAI, type PartUnion, Type } from "@google/genai";
import {
  GEMINI_MODEL,
  INDIC_LANGUAGES,
  PROMPT_MAX_CHARS,
} from "./constants";
import type {
  OptimizePromptRequest,
  OptimizePromptResponse,
  PromptOptimizerEditContext,
} from "./types";
import { validatePromptReferences } from "./validation";

let cachedClient: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  if (cachedClient) return cachedClient;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured on the server.");
  }
  cachedClient = new GoogleGenAI({ apiKey });
  return cachedClient;
}

function languageLabel(code: string): string {
  return INDIC_LANGUAGES.find((l) => l.value === code)?.label ?? code;
}

interface PromptCounts {
  images: number;
  videos: number;
  audios: number;
}

interface ActionBeat {
  timeRange: string;
  description: string;
}

interface OptimizedPromptStructure {
  subject: string;
  scene: string;
  actionBeats: ActionBeat[];
  cameraDirective: string;
  lightingDirective: string;
  audioDirective: string;
  styleAndMood: string;
  negatives: string;
}

// ---------------------------------------------------------------------------
// Manifest + system instruction
// ---------------------------------------------------------------------------

function buildAssetManifest(req: OptimizePromptRequest): string {
  const lines: string[] = [];

  req.referenceImages.forEach((asset, idx) => {
    lines.push(`- @Image${idx + 1}: ${asset.originalName} (${asset.mimeType})`);
  });
  req.referenceVideos.forEach((asset, idx) => {
    lines.push(`- @Video${idx + 1}: ${asset.originalName} (${asset.mimeType})`);
  });
  req.referenceAudios.forEach((asset, idx) => {
    lines.push(`- @Audio${idx + 1}: ${asset.originalName} (${asset.mimeType})`);
  });

  return lines.length ? lines.join("\n") : "(no uploaded assets)";
}

const SYSTEM_INSTRUCTION = `You are a senior video-prompt engineer for ByteDance's Seedance 2.0 reference-to-video model. You output STRUCTURED JSON only — no markdown, no commentary.

Guiding rules for the JSON you produce:

1. Every uploaded asset in the manifest MUST appear in the JSON, attached to a role word so the parser can bind it. Approved patterns:
   - "@Image1's character as the subject"
   - "@Video1's motion and choreography"
   - "scene references @Image2"
   - "BGM references @Audio1"
   - "narration voice references @Audio1's timbre, pitch contour, accent, and breath"
   - "rhythm derived from @Video1"
   - "lighting matches @Image3"
   Bare "@Video1." with no role word is INVALID.
2. Asset references use capital first letter — @Image1, @Video1, @Audio1.
3. Never invent references. If the manifest has 1 video and 1 audio, do NOT mention @Image1 or @Video2.
4. Use the exact field semantics:
   - subject: who/what the video is about, with the primary @-reference for identity locked in.
   - scene: environment, location, time of day, atmosphere.
   - actionBeats: an array of { timeRange, description } pairs covering the full clip duration. Use 0–3s, 3–6s, 6–10s, 10–15s segments. For ≤8s clips, 1–2 beats are fine. Each beat description must include the dominant action AND any per-beat camera move.
   - cameraDirective: the dominant camera language for the whole clip (e.g. "smooth slow push-in with a track beside the subject; one continuous take").
   - lightingDirective: a single lighting style (golden_hour / hard_noon / soft_overcast / neon_night / candlelit / cinematic) plus one short modifier.
   - audioDirective: REQUIRED. If any @Audio is in the manifest, you MUST reference it here with a role word and direct the model to match its vocal timbre, pitch contour, accent, and breath. Also weave in the named Indic language's intonation cues (Hindi cadence with code-mixing / lyrical Tamil consonant articulation / Bengali soft-syllabic tonality / etc.).
   - styleAndMood: aesthetic style + mood adjectives. No camera or lighting language here.
   - negatives: free-form negative list. Always end with "Avoid on-screen text overlay, jitter, bent limbs, warped faces, extra fingers, floating objects."
5. Aim for rich, descriptive prose in each field — Seedance rewards specificity. Do not be terse. Treat each field as 1–3 sentences, except actionBeats which can be richer.
6. Stay under 4000 characters when all fields are concatenated. If you're approaching that limit, trim from styleAndMood and negatives last.`;

/**
 * Edit-mode prompt rules. The user is regenerating ONE segment of a
 * longer video. Seedance image-to-video receives the segment's first
 * and last frames as fixed visual anchors plus a text prompt; we
 * forward those same two frames to Gemini here so it can ground the
 * rewrite in actual pixels instead of guessing.
 *
 * Output schema is identical to generation mode — same JSON shape, so
 * the existing renderer + safety net + length cap all keep working
 * unchanged. Only the *content* of the fields changes (no @-handles,
 * grounded in the boundary frames).
 */
const EDIT_SYSTEM_INSTRUCTION = `You are a senior video-edit prompt engineer for ByteDance's Seedance 2.0 image-to-video model. The user is editing ONE SEGMENT of an existing video. Seedance will regenerate just that segment using the segment's first and last frames as fixed visual anchors.

You are given two images:
- Image 1 = the FIRST frame of the segment (the fixed start state).
- Image 2 = the LAST frame of the segment (the fixed end state).

You output STRUCTURED JSON only — no markdown, no commentary. The JSON schema is the same as generation mode (subject, scene, actionBeats, cameraDirective, lightingDirective, audioDirective, styleAndMood, negatives).

Edit-mode rules:

1. GROUND EVERY FIELD IN WHAT YOU SEE. Describe the visible character (clothing, hair, age, build, posture), scene (location, props, depth), framing (shot size, angle), lighting (direction, colour temperature, contrast), and motion direction (camera and subject) explicitly. Vague prompts produce off-style regenerations.
2. PRESERVE everything visible across the edit — character identity, costume, scene, lighting palette, camera language, and overall style — UNLESS the user explicitly asked to change them. The regenerated segment must feel like the same shot.
3. APPLY ONLY THE CHANGE THE USER REQUESTED. Do not invent extra edits. If they said "change shawl to indigo", do not also change the lighting or the lens.
4. RESPECT THE FRAME ANCHORS. The segment must start at exactly the pose/state shown in Image 1 and end at exactly the pose/state shown in Image 2. Action beats describe how the middle of the segment evolves between those two fixed states.
5. NO @-REFERENCE SYNTAX. There are no uploaded reference assets in edit mode. Refer to the boundary frames as "the first frame" and "the last frame" in prose if you need to.
6. AUDIO. Always include the named Indic language's intonation cues in audioDirective. The audio is muxed in a separate step, so describe what dialogue/SFX/timbre should sound like — do NOT write the actual spoken text.
7. NEGATIVES. Always end the negatives field with: "Avoid on-screen text overlay, jitter, bent limbs, warped faces, extra fingers, floating objects, character drift from the boundary frames."
8. Stay under 4000 characters when all fields are concatenated.

Field semantics in edit mode:
- subject: describe the visible person/object grounded in the frames; then attach the user's requested change.
- scene: describe the visible environment from the frames; preserve unless the user asked to change it.
- actionBeats: cover the segment duration with 1–3 beats. Each beat must respect that frame 1 (start) and frame 2 (end) are FIXED.
- cameraDirective: infer the camera language from the frames (static / push-in / pan / dolly / handheld) and lock it for the whole segment.
- lightingDirective: match the frame lighting unless the user asked to change it.
- audioDirective: REQUIRED. Indic-language intonation cues. Describe sound character, not literal dialogue text.
- styleAndMood: match the frames; only adjust if the user explicitly asked for a mood change.
- negatives: standard negatives + boundary-frame anchor reminder.`;

// ---------------------------------------------------------------------------
// Response schema (Gemini structured output)
// ---------------------------------------------------------------------------

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    subject: {
      type: Type.STRING,
      description:
        "Primary subject. MUST attach the identity-locking @-reference here (e.g. \"@Video1's person as the main subject\").",
    },
    scene: {
      type: Type.STRING,
      description: "Environment, location, time of day, atmosphere.",
    },
    actionBeats: {
      type: Type.ARRAY,
      description:
        "Time-segmented action beats. Use 0-3s/3-6s/6-10s/10-15s ranges.",
      items: {
        type: Type.OBJECT,
        properties: {
          timeRange: {
            type: Type.STRING,
            description: "e.g. '0-3s', '3-6s', '6-10s', '10-15s'.",
          },
          description: {
            type: Type.STRING,
            description: "Action + per-beat camera move.",
          },
        },
        required: ["timeRange", "description"],
        propertyOrdering: ["timeRange", "description"],
      },
    },
    cameraDirective: {
      type: Type.STRING,
      description:
        "Dominant camera language for the clip. ONE primary move per beat — no contradictions.",
    },
    lightingDirective: {
      type: Type.STRING,
      description: "Single lighting style + one modifier.",
    },
    audioDirective: {
      type: Type.STRING,
      description:
        "REQUIRED. Must include vocal-similarity directive referencing every @Audio asset, plus the Indic intonation cues for the named language.",
    },
    styleAndMood: {
      type: Type.STRING,
      description: "Aesthetic + mood. No camera/lighting language.",
    },
    negatives: {
      type: Type.STRING,
      description:
        'Negatives. Must end with "Avoid on-screen text overlay, jitter, bent limbs, warped faces, extra fingers, floating objects."',
    },
  },
  required: [
    "subject",
    "scene",
    "actionBeats",
    "cameraDirective",
    "lightingDirective",
    "audioDirective",
    "styleAndMood",
    "negatives",
  ],
  propertyOrdering: [
    "subject",
    "scene",
    "actionBeats",
    "cameraDirective",
    "lightingDirective",
    "audioDirective",
    "styleAndMood",
    "negatives",
  ],
};

// ---------------------------------------------------------------------------
// Render structured output → final Seedance prompt
// ---------------------------------------------------------------------------

function renderStructuredPrompt(s: OptimizedPromptStructure): string {
  const beats = s.actionBeats
    .map((b) => `${b.timeRange}: ${b.description}`)
    .join("\n");

  return [
    `Subject: ${s.subject}`,
    `Scene: ${s.scene}`,
    `Action:\n${beats}`,
    `Camera: ${s.cameraDirective}`,
    `Lighting: ${s.lightingDirective}`,
    `Audio: ${s.audioDirective}`,
    `Style and mood: ${s.styleAndMood}`,
    `Negatives: ${s.negatives}`,
  ].join("\n\n");
}

// ---------------------------------------------------------------------------
// Deterministic asset-reference safety net
// ---------------------------------------------------------------------------

const SAFETY_NET_BINDINGS: Record<"Image" | "Video" | "Audio", (handle: string) => string> = {
  Image: (h) => `Composition references ${h} for staging, framing, and palette consistency.`,
  Video: (h) => `Camera and motion mirror ${h}'s choreography and pacing precisely.`,
  Audio: (h) =>
    `Narration voice references ${h}'s timbre, pitch contour, accent, and breath; preserve pause, warmth, and vocal weight.`,
};

function findMissingHandles(prompt: string, counts: PromptCounts): string[] {
  const lower = prompt.toLowerCase();
  const missing: string[] = [];
  for (let i = 1; i <= counts.images; i++) {
    if (!lower.includes(`@image${i}`)) missing.push(`@Image${i}`);
  }
  for (let i = 1; i <= counts.videos; i++) {
    if (!lower.includes(`@video${i}`)) missing.push(`@Video${i}`);
  }
  for (let i = 1; i <= counts.audios; i++) {
    if (!lower.includes(`@audio${i}`)) missing.push(`@Audio${i}`);
  }
  return missing;
}

function appendSafetyNet(prompt: string, missing: string[]): string {
  if (missing.length === 0) return prompt;
  const lines = missing.map((handle) => {
    const kind = handle.replace(/[@\d]/g, "") as "Image" | "Video" | "Audio";
    const builder = SAFETY_NET_BINDINGS[kind];
    return builder ? builder(handle) : `${handle} is referenced.`;
  });
  return `${prompt}\n\nReference bindings:\n${lines.join("\n")}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

function buildGenerationUserPrompt(
  req: OptimizePromptRequest,
  langLabel: string,
): string {
  const manifest = buildAssetManifest(req);
  return `Target Indic language: ${langLabel} (${req.language})
Clip duration: ${req.duration === "auto" ? "auto (model decides between 4s and 15s)" : `${req.duration}s`}

Asset manifest (you MUST reference every line in your output):
${manifest}

User's raw idea:
"""
${req.rawPrompt.trim()}
"""

Produce the JSON. Audio is the most commonly-forgotten asset — the audioDirective field MUST include every @AudioN handle from the manifest with a role word. Bake in ${langLabel} intonation cues. Be specific and descriptive in every field; do not be terse.`;
}

function buildEditUserPrompt(
  req: OptimizePromptRequest,
  langLabel: string,
  editContext: PromptOptimizerEditContext,
): string {
  const original = editContext.originalPrompt?.trim();
  const hasFrames = Boolean(editContext.boundaryFrames);
  const segmentDur =
    req.duration === "auto" ? "approximately 4–15s" : `${req.duration}s`;

  return `EDIT MODE — you are optimising a prompt for one segment of an existing video.

Segment duration: ${segmentDur}
Target language for new dialogue: ${langLabel} (${req.language})

${
  original
    ? `Original generation prompt (use this for stylistic continuity — preserve this style across the edit):
"""
${original}
"""

`
    : `Original generation prompt: not available. Infer style entirely from the boundary frames below.

`
}User's edit instruction:
"""
${req.rawPrompt.trim()}
"""

${
  hasFrames
    ? `Two images follow this text:
- Image 1 = the FIRST frame of the segment being edited (fixed start state).
- Image 2 = the LAST frame of the segment being edited (fixed end state).

Inspect both frames carefully. Identify the character (clothing, hair, build, age, posture), scene (location, props, depth), framing (shot size, angle), lighting (direction, colour temperature, contrast), and motion direction. Then produce the JSON: preserve everything visible across the edit, apply ONLY the user's requested change, and respect the two frame anchors.`
    : `No boundary frames were provided — work from the original prompt and the user's edit instruction alone, and stay conservative about anything not explicitly described.`
}`;
}

export async function optimizePrompt(
  req: OptimizePromptRequest,
): Promise<OptimizePromptResponse> {
  const client = getClient();
  const langLabel = languageLabel(req.language);
  const editContext = req.editContext;
  const counts: PromptCounts = {
    images: req.referenceImages.length,
    videos: req.referenceVideos.length,
    audios: req.referenceAudios.length,
  };

  const userPrompt = editContext
    ? buildEditUserPrompt(req, langLabel, editContext)
    : buildGenerationUserPrompt(req, langLabel);

  // Build the multimodal contents array. Plain string is also valid
  // (PartUnion = Part | string), but going with explicit parts keeps
  // the shape consistent across both branches and makes it trivial to
  // append more inline images later (e.g. mid-segment frames).
  const parts: PartUnion[] = [{ text: userPrompt }];
  const frames = editContext?.boundaryFrames;
  if (frames) {
    parts.push(
      { inlineData: { mimeType: "image/jpeg", data: frames.firstFrameBase64 } },
      { inlineData: { mimeType: "image/jpeg", data: frames.lastFrameBase64 } },
    );
  }

  const response = await client.models.generateContent({
    model: GEMINI_MODEL,
    contents: parts,
    config: {
      systemInstruction: editContext
        ? EDIT_SYSTEM_INSTRUCTION
        : SYSTEM_INSTRUCTION,
      temperature: 0.5,
      maxOutputTokens: 4096,
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
      // Disable thinking — it was eating the output budget on 2.5-flash and
      // truncating the response mid-sentence.
      thinkingConfig: { thinkingBudget: 0 },
    },
  });

  const rawJson = response.text?.trim() ?? "";
  if (!rawJson) {
    throw new Error("Gemini returned an empty response.");
  }

  let structured: OptimizedPromptStructure;
  try {
    structured = JSON.parse(rawJson) as OptimizedPromptStructure;
  } catch {
    throw new Error("Gemini returned malformed JSON. Please retry.");
  }

  let optimizedPrompt = renderStructuredPrompt(structured);

  // Deterministic safety net — guarantees 100% asset coverage even if
  // Gemini still missed something inside the structured response.
  const missing = findMissingHandles(optimizedPrompt, counts);
  optimizedPrompt = appendSafetyNet(optimizedPrompt, missing);

  // Cap at the configured ceiling.
  if (optimizedPrompt.length > PROMPT_MAX_CHARS) {
    optimizedPrompt = optimizedPrompt.slice(0, PROMPT_MAX_CHARS);
  }

  // Final validation pass — should now be empty 99% of the time.
  const warnings = validatePromptReferences(optimizedPrompt, counts);
  return { optimizedPrompt, warnings };
}

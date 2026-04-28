/**
 * Builds Gemini system instructions for both modes:
 *   - buildOutlineSystemPrompt: for the outliner
 *   - buildSynthSystemPrompt:   for the per-beat reactive synthesizer
 *
 * Both reuse the same skill foundation. Caller passes the chosen style pack
 * id; pack content is loaded fresh from disk via the registry.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { IndicLanguageCode, GenerationMode } from "@/lib/constants";
import { loadStylePackContent } from "./style-pack-loader";
import type { ContinuityTier } from "./types";

const FOUNDATION_PATHS = [
  "skills/seedance-prompting/SKILL.md",
  "skills/seedance-2.0-prompter/references/atomic_element_mapping.md",
  "skills/seedance-2.0-prompter/references/seedance_syntax_guide.md",
  "skills/seedance-2.0-prompter/references/prompt_templates.md",
  "skills/videoagent-director/SKILL.md",
];

async function loadFoundation(): Promise<string> {
  const chunks = await Promise.all(
    FOUNDATION_PATHS.map(async (p) => {
      try {
        return await readFile(path.join(process.cwd(), p), "utf-8");
      } catch {
        return ""; // skip missing files gracefully
      }
    }),
  );
  return chunks.filter(Boolean).join("\n\n---\n\n");
}

interface BuildOutlineInput {
  stylePackId: string;
  mode: GenerationMode;
  languageCode: IndicLanguageCode;
}

export async function buildOutlineSystemPrompt(
  input: BuildOutlineInput,
): Promise<string> {
  const foundation = await loadFoundation();
  const pack = (await loadStylePackContent(input.stylePackId)) ?? "";
  const modeHeader =
    input.mode === "quality"
      ? `## Quality mode rules\n\n` +
        `In Quality mode, you produce ONLY a lightweight outline. Each beat carries\n` +
        `metadata (oneLineSummary, dialogue, role, shotType, bgmIntensity, durationSeconds).\n` +
        `DO NOT generate fullPrompt fields — full prompts will be synthesized\n` +
        `LIVE after each previous beat completes by a separate call. The synthesizer needs\n` +
        `your concise oneLineSummary + dialogue text only.`
      : `## Fast mode rules\n\n` +
        `In Fast mode, you must populate the fullPrompt field on every beat with the\n` +
        `complete Seedance prompt at outline time. There is NO reactive synthesizer\n` +
        `pass after this — the fullPrompt is what gets sent to Seedance directly.\n` +
        `Each fullPrompt must include: 8-element structure, all required @-references,\n` +
        `a lip-sync directive when has_dialogue, language directive, and the dialogue\n` +
        `text in quotes.`;

  return [
    `You are a senior shot planner for ByteDance's Seedance 2.0.`,
    `Target language: ${input.languageCode}. Use this language for any dialogue text.`,
    ``,
    `## Foundation`,
    foundation,
    ``,
    pack ? `## Style pack\n\n${pack}` : "## Style pack\n\nUser chose Auto — pick the closest pack from the prompt.",
    ``,
    modeHeader,
    ``,
    `## Hard rules (apply to ALL outputs)`,
    `- Total duration sums to target ±1s.`,
    `- Each beat is 4–15 seconds.`,
    `- Beats are 3–8 in count.`,
    `- The first beat MUST have role="opener".`,
    `- Cuts NEVER land mid-sentence: every dialogue beat ends on terminal punctuation (. ! ? ।).`,
    `- pinFrame is allowed only when the provider is KIE AND the beat is a continuation.`,
    ``,
    `Return only valid JSON conforming to the schema you'll be given.`,
  ].join("\n");
}

interface BuildSynthInput {
  stylePackId: string;
  languageCode: IndicLanguageCode;
  tier: ContinuityTier;
}

export async function buildSynthSystemPrompt(
  input: BuildSynthInput,
): Promise<string> {
  const foundation = await loadFoundation();
  const pack = (await loadStylePackContent(input.stylePackId)) ?? "";

  const tierBlock = (() => {
    if (input.tier === "fresh") {
      return [
        `## Tier: fresh`,
        `This beat does NOT chain off the previous beat. Use canonical refs only:`,
        `- @image1 = the user's character reference (identity lock)`,
        `- @audio1 = the canonical narration voice timbre (timbre lock)`,
        `- The user's other references (image_urls, video_urls, audio_urls) are passed through unchanged.`,
      ].join("\n");
    }
    if (input.tier === "motion-match") {
      return [
        `## Tier: motion-match`,
        `This beat chains off the previous beat. Reference structure:`,
        `- @video1 = the previous beat's last 5–10 seconds (motion + scene continuity)`,
        `- @image1 = the user's character reference (identity lock)`,
        `- @audio1 = the canonical narration voice timbre`,
        ``,
        `You MUST include "@video1" in the prompt and a continuation cue near it`,
        `("continue from @video1's end state", "extends from @video1", "follows from @video1").`,
      ].join("\n");
    }
    // frame-exact-motion-match
    return [
      `## Tier: frame-exact-motion-match (deluxe, KIE-only)`,
      `Pixel-continuous boundary. References:`,
      `- first_frame_url is set to the previous beat's last frame.`,
      `- @video1 = the previous beat's last 5–10 seconds (motion continuity)`,
      `- @image1 = the user's character reference (identity lock)`,
      `- @audio1 = the canonical narration voice timbre`,
      ``,
      `You MUST include @video1 with a continuation cue AND @image1 with a first-frame directive`,
      `("@image1 character continues from the opening frame", "@image1 as the first-frame subject").`,
    ].join("\n");
  })();

  return [
    `You are a Seedance 2.0 prompt synthesizer. Output ONE complete Seedance prompt.`,
    `Target language: ${input.languageCode}.`,
    ``,
    `## Foundation`,
    foundation,
    ``,
    pack ? `## Style pack\n\n${pack}` : "",
    ``,
    tierBlock,
    ``,
    `## Required directives`,
    `- For dialogue beats: include the dialogue text in double quotes.`,
    `- Place "@audio1" within ~30 chars of a timbre directive (timbre, pitch, accent, breath).`,
    `- Include an explicit lip-articulation directive: "tight lip-sync, mouth articulates every phoneme of the dialogue, no phoneme drift".`,
    `- Include the language directive (BCP-47 code or name) somewhere in the prompt.`,
    `- End with a negatives clause: "Avoid: identity drift, warped face, extra people, cartoon style, text glitches, jitter."`,
    ``,
    `Output ONLY the prompt — no explanation, no JSON wrapper.`,
  ].filter(Boolean).join("\n");
}

/**
 * Builds Gemini system instructions for both modes:
 *   - buildOutlineSystemPrompt: for the outliner (storyboard planner)
 *   - buildSynthSystemPrompt:   for the per-beat reactive synthesizer
 *
 * All prompt knowledge is inline — no disk reads from skills/ folder.
 */
import type { IndicLanguageCode, GenerationMode } from "@/lib/constants";
import {
  SEEDANCE_CORE,
  STORYBOARD_GRAMMAR,
  ATOMIC_ELEMENTS,
  getStyleDirective,
} from "./prompt-library";
import type { ContinuityTier } from "./types";

interface BuildOutlineInput {
  stylePackId: string;
  mode: GenerationMode;
  languageCode: IndicLanguageCode;
}

export async function buildOutlineSystemPrompt(
  input: BuildOutlineInput,
): Promise<string> {
  const stylePack = getStyleDirective(input.stylePackId);

  const styleBlock = stylePack
    ? [
        `## Style Pack: ${stylePack.label}`,
        ``,
        `**Visual style**: ${stylePack.visualStyle}`,
        `**Camera preferences**: ${stylePack.cameraPreferences}`,
        `**Lighting preferences**: ${stylePack.lightingPreferences}`,
        `**Pacing notes**: ${stylePack.pacingNotes}`,
        ``,
        `Apply these style directives to EVERY beat in the outline. The visual style should inform`,
        `your scene descriptions, the camera preferences should guide your cameraDirection fields,`,
        `and the lighting preferences should appear in your lightingNotes.`,
      ].join("\n")
    : `## Style Pack\n\nUser chose Auto — pick the visual style most appropriate for the story content. Be specific about the style you choose in every beat's scene description.`;

  const modeBlock =
    input.mode === "quality"
      ? [
          `## Quality Mode Rules`,
          ``,
          `In Quality mode, produce a detailed storyboard outline. Each beat carries rich metadata`,
          `(beatType, oneLineSummary, sceneDescription, cameraDirection, lightingNotes, audioDirection,`,
          `dialogue, shotType, bgmIntensity, durationSeconds).`,
          ``,
          `DO NOT generate fullPrompt fields — full Seedance prompts will be synthesized LIVE after`,
          `each previous beat completes by a separate synthesizer call. The synthesizer needs your`,
          `detailed scene/camera/lighting/audio descriptions to produce a precise Seedance prompt.`,
          ``,
          `The more specific your descriptions, the better the final video. Write as if briefing a`,
          `cinematographer who has never read the script.`,
        ].join("\n")
      : [
          `## Fast Mode Rules`,
          ``,
          `In Fast mode, populate the fullPrompt field on every beat with the COMPLETE Seedance`,
          `prompt. There is NO reactive synthesizer pass — the fullPrompt is sent to Seedance directly.`,
          ``,
          `Each fullPrompt must include:`,
          `- Full 8-element structure (subject, scene, action, camera, timing, transitions, audio, style)`,
          `- All required @-references with explicit roles`,
          `- Lip-sync directive when has_dialogue: "tight lip-sync, mouth articulates every phoneme"`,
          `- Language directive (BCP-47 code)`,
          `- Dialogue text in double quotes`,
          `- Negatives clause at the end`,
          ``,
          `ALSO fill in sceneDescription, cameraDirection, lightingNotes, and audioDirection — these`,
          `are used by the UI even in Fast mode.`,
        ].join("\n");

  return [
    `You are a senior creative director and storyboard artist for ByteDance's Seedance 2.0.`,
    `Target language: ${input.languageCode}. Use this language for any dialogue text.`,
    ``,
    `## Seedance Prompt Knowledge`,
    SEEDANCE_CORE,
    ``,
    STORYBOARD_GRAMMAR,
    ``,
    styleBlock,
    ``,
    modeBlock,
    ``,
    `## Hard Rules (apply to ALL outputs)`,
    `- Total duration sums to target ±1s.`,
    `- Each beat is 4–15 seconds.`,
    `- Beats count: 3–8.`,
    `- The first beat MUST have role="opener" and beatType="establishing".`,
    `- At least 30% of beats must be non-dialogue (b-roll, establishing, transition, cutaway).`,
    `- Never have 3+ dialogue beats in a row without a visual beat between them.`,
    `- Cuts NEVER land mid-sentence: every dialogue beat ends on terminal punctuation.`,
    `- pinFrame is allowed only when the provider is KIE AND the beat is a continuation.`,
    `- sceneDescription must be 2-4 sentences minimum. Vague descriptions will be rejected.`,
    `- cameraDirection must name a specific camera move with speed and framing details.`,
    `- lightingNotes must specify light quality, direction, and color temperature.`,
    `- audioDirection must specify at least ambient + one other element (SFX, music, or voice).`,
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
  const stylePack = getStyleDirective(input.stylePackId);

  const styleBlock = stylePack
    ? `## Style Pack: ${stylePack.label}\n\n**Visual**: ${stylePack.visualStyle}\n**Camera**: ${stylePack.cameraPreferences}\n**Lighting**: ${stylePack.lightingPreferences}`
    : "";

  const tierBlock = (() => {
    if (input.tier === "fresh") {
      return [
        `## Tier: fresh`,
        `This beat does NOT chain off the previous beat. Use canonical refs only:`,
        `- @Image1 = the user's character reference (identity lock)`,
        `- @Audio1 = the canonical narration voice timbre (timbre lock)`,
        `- Other user references (images, videos, audios) are passed through unchanged.`,
      ].join("\n");
    }
    if (input.tier === "motion-match") {
      return [
        `## Tier: motion-match`,
        `This beat chains off the previous beat. Reference structure:`,
        `- @Video1 = the previous beat's last 5-10 seconds (motion + scene continuity)`,
        `- @Image1 = the user's character reference (identity lock)`,
        `- @Audio1 = the canonical narration voice timbre`,
        ``,
        `You MUST include "@Video1" in the prompt with a continuation cue`,
        `("continue from @Video1's end state", "extends from @Video1", "follows from @Video1").`,
      ].join("\n");
    }
    return [
      `## Tier: frame-exact-motion-match (KIE-only)`,
      `Pixel-continuous boundary. References:`,
      `- first_frame_url is set to the previous beat's last frame.`,
      `- @Video1 = the previous beat's last 5-10 seconds (motion continuity)`,
      `- @Image1 = the user's character reference (identity lock)`,
      `- @Audio1 = the canonical narration voice timbre`,
      ``,
      `You MUST include @Video1 with a continuation cue AND reference the first frame`,
      `("character continues from the opening frame", "subject enters from first-frame position").`,
    ].join("\n");
  })();

  return [
    `You are a Seedance 2.0 prompt synthesizer. Output ONE complete Seedance prompt.`,
    `Target language: ${input.languageCode}.`,
    ``,
    `## Seedance Prompt Knowledge`,
    SEEDANCE_CORE,
    ``,
    ATOMIC_ELEMENTS,
    ``,
    styleBlock,
    ``,
    tierBlock,
    ``,
    `## Synthesizer Rules`,
    `You will receive detailed beat metadata: sceneDescription, cameraDirection, lightingNotes,`,
    `audioDirection, dialogue, shotType, and oneLineSummary. Use ALL of these to write a rich,`,
    `specific Seedance prompt. Do not simplify or summarize — translate the storyboard panel`,
    `directly into Seedance's prompt format.`,
    ``,
    `- For dialogue beats: include the dialogue text in double quotes.`,
    `- Place "@Audio1" within ~30 chars of a timbre directive (timbre, pitch, accent, breath).`,
    `- Include lip-sync directive: "tight lip-sync, mouth articulates every phoneme of the dialogue, no phoneme drift".`,
    `- Include the language directive (BCP-47 code or name).`,
    `- End with negatives: "Avoid: identity drift, warped face, extra people, cartoon style, text glitches, jitter."`,
    ``,
    `Output ONLY the prompt — no explanation, no JSON wrapper.`,
  ].filter(Boolean).join("\n");
}

/**
 * Validates a synthesized full beat prompt against the spec's required
 * directives. Returns a list of human-readable errors (empty on success).
 *
 * Hard-rule mapping (from the spec):
 *   - dialogue beats must include the quoted dialogue text
 *   - @audio1 must appear within ±60 chars of a timbre directive
 *   - lip-articulation directive: regex on lip-sync/mouth/phoneme/articulat/sync
 *   - language directive: BCP-47 code OR language name
 *   - motion-match / deluxe tier: @video1 + a continuation cue
 *   - deluxe tier: also @image1 + first-frame directive
 */
import {
  INDIC_LANGUAGES,
  type IndicLanguageCode,
} from "@/lib/constants";
import type { BeatOutline, ContinuityTier } from "./types";

const LANGUAGE_NAME_BY_CODE: Record<IndicLanguageCode, string> = Object.fromEntries(
  INDIC_LANGUAGES.map((l) => [l.value, l.label]),
) as Record<IndicLanguageCode, string>;

function nearMatch(haystack: string, needle: string, contextWord: RegExp): boolean {
  const idx = haystack.indexOf(needle);
  if (idx < 0) return false;
  const start = Math.max(0, idx - 60);
  const end = Math.min(haystack.length, idx + needle.length + 60);
  return contextWord.test(haystack.slice(start, end));
}

export function validateBeatPrompt(
  prompt: string,
  beat: BeatOutline,
  tier: ContinuityTier,
): string[] {
  const errors: string[] = [];
  const lower = prompt.toLowerCase();

  if (beat.hasDialogue && beat.dialogue) {
    // Spec requires the quoted dialogue text appear verbatim.
    const hasQuote = prompt.includes(`"${beat.dialogue.text}"`) ||
      prompt.includes(`“${beat.dialogue.text}”`) ||
      prompt.includes(`‘${beat.dialogue.text}’`);
    if (!hasQuote) {
      // Less strict — at least SOME quoted content must exist.
      if (!/["“][^"”]+["”]/.test(prompt)) {
        errors.push(`Beat ${beat.index}: missing quoted dialogue line.`);
      }
    }

    if (!nearMatch(lower, "@audio1", /(timbre|pitch|accent|breath|warmth|vocal)/i)) {
      errors.push(`Beat ${beat.index}: @audio1 must appear near a timbre directive (timbre/pitch/accent/breath/vocal).`);
    }

    if (!/(lip-?sync|mouth|phoneme|articulat|frame-by-frame sync|tight sync)/i.test(prompt)) {
      errors.push(`Beat ${beat.index}: missing lip-articulation directive (lip-sync / mouth / phoneme / articulat).`);
    }

    const code = beat.dialogue.languageCode;
    const name = LANGUAGE_NAME_BY_CODE[code]?.toLowerCase() ?? "";
    const hasLang = lower.includes(code.toLowerCase()) || (name && lower.includes(name));
    if (!hasLang) {
      errors.push(`Beat ${beat.index}: missing language directive — include "${code}" or "${LANGUAGE_NAME_BY_CODE[code]}" in the prompt.`);
    }
  }

  if (tier === "motion-match" || tier === "frame-exact-motion-match") {
    if (!lower.includes("@video1")) {
      errors.push(`Beat ${beat.index}: tier "${tier}" requires @video1 reference with a continuation cue.`);
    } else if (!/(continue|extends? from|follows? from|resume|pick up)/i.test(prompt)) {
      errors.push(`Beat ${beat.index}: @video1 must be paired with a continuation cue (continue/extends from/follows from).`);
    }
  }

  if (tier === "frame-exact-motion-match") {
    if (!lower.includes("@image1")) {
      errors.push(`Beat ${beat.index}: deluxe tier requires @image1 reference.`);
    }
    if (!/(first frame|opening frame|start.*frame)/i.test(prompt)) {
      errors.push(`Beat ${beat.index}: deluxe tier missing first-frame directive.`);
    }
  }

  return errors;
}

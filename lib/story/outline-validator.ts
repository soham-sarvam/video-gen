/**
 * Validates a Gemini-produced StoryOutline against the spec's hard rules.
 * Returns a list of human-readable error strings (empty on success).
 */
import { getVideoModelById, type VideoModelId } from "@/lib/constants";
import type { StoryOutline } from "./types";

const TERMINAL_PUNCT = /[.!?।]\s*$/;

export function validateOutline(
  outline: StoryOutline,
  modelId: VideoModelId,
): string[] {
  const errors: string[] = [];
  const { beats, totalDurationSeconds } = outline;

  if (beats.length < 2 || beats.length > 8) {
    errors.push(`Expected 3–8 beats; got ${beats.length}.`);
  }

  const sum = beats.reduce((acc, b) => acc + b.durationSeconds, 0);
  if (Math.abs(sum - totalDurationSeconds) > 1) {
    errors.push(`Beat durations sum to ${sum}s; total target is ${totalDurationSeconds}s (±1s).`);
  }

  if (beats.length > 0 && beats[0].role !== "opener") {
    errors.push(`The first beat must have role "opener".`);
  }

  for (const beat of beats) {
    if (beat.durationSeconds < 4 || beat.durationSeconds > 15) {
      errors.push(`Beat ${beat.index}: durationSeconds=${beat.durationSeconds} outside 4–15s.`);
    }
    if (beat.hasDialogue) {
      if (!beat.dialogue || !beat.dialogue.text.trim()) {
        errors.push(`Beat ${beat.index}: hasDialogue=true but dialogue text is empty.`);
        continue;
      }
      if (!TERMINAL_PUNCT.test(beat.dialogue.text)) {
        errors.push(
          `Beat ${beat.index}: dialogue must end on terminal punctuation (.!?।) so cuts land at sentence boundaries.`,
        );
      }
    }
    if (beat.pinFrame) {
      const model = (() => {
        try {
          return getVideoModelById(modelId);
        } catch {
          return null;
        }
      })();
      if (!model || model.provider !== "kie") {
        errors.push(`Beat ${beat.index}: pinFrame requires a KIE provider; current model is "${modelId}".`);
      }
      if (beat.role !== "continuation") {
        errors.push(`Beat ${beat.index}: pinFrame is only valid for continuation beats.`);
      }
    }
  }

  // Mode-specific checks.
  if (outline.mode === "fast") {
    for (const beat of beats) {
      if (!beat.fullPrompt || beat.fullPrompt.trim().length < 20) {
        errors.push(`Beat ${beat.index}: Fast mode requires a fullPrompt at outline time.`);
      }
    }
  }

  return errors;
}

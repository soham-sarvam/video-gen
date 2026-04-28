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

  if (beats.length > 0 && beats[0].beatType !== "establishing") {
    errors.push(`The first beat must have beatType "establishing"; got "${beats[0].beatType}".`);
  }

  const dialogueRunStart: number[] = [];
  let consecutiveDialogue = 0;
  for (const beat of beats) {
    if (beat.beatType === "dialogue" || beat.hasDialogue) {
      consecutiveDialogue++;
      if (consecutiveDialogue === 3) {
        dialogueRunStart.push(beat.index);
      }
    } else {
      consecutiveDialogue = 0;
    }
  }
  for (const idx of dialogueRunStart) {
    errors.push(`3+ consecutive dialogue beats ending at beat ${idx} — intercut with B-roll, reaction, or cutaway.`);
  }

  const nonDialogueCount = beats.filter(
    (b) => b.beatType !== "dialogue" && !b.hasDialogue,
  ).length;
  if (beats.length >= 3 && nonDialogueCount / beats.length < 0.25) {
    errors.push(`At least ~30% of beats should be non-dialogue (B-roll, establishing, transition, cutaway). Currently ${nonDialogueCount}/${beats.length}.`);
  }

  for (const beat of beats) {
    if (beat.durationSeconds < 4 || beat.durationSeconds > 15) {
      errors.push(`Beat ${beat.index}: durationSeconds=${beat.durationSeconds} outside 4–15s.`);
    }
    if (!beat.sceneDescription || beat.sceneDescription.trim().length < 30) {
      errors.push(`Beat ${beat.index}: sceneDescription is too short (min ~30 chars of specific detail).`);
    }
    if (!beat.cameraDirection || beat.cameraDirection.trim().length < 15) {
      errors.push(`Beat ${beat.index}: cameraDirection is too short — name a specific camera move.`);
    }
    if (!beat.lightingNotes || beat.lightingNotes.trim().length < 10) {
      errors.push(`Beat ${beat.index}: lightingNotes is too short — specify light quality and direction.`);
    }
    if (!beat.audioDirection || beat.audioDirection.trim().length < 10) {
      errors.push(`Beat ${beat.index}: audioDirection is too short — specify at least ambient + one other element.`);
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

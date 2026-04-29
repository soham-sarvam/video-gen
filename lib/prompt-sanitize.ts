/**
 * Normalizes user-authored prompts before API validation / LLM calls.
 * Keeps Zod from failing on whitespace-only padding or slightly-over-limit pastes.
 */

const ELLIPSIS = "…";

/**
 * Trims, normalizes newlines, collapses runaway blank lines, and clamps to `maxChars`.
 * Prefer breaking at the last newline or space before the limit.
 */
export function sanitizeUserPrompt(input: string, maxChars: number): string {
  let s = input.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  s = s.replace(/\t/g, " ");
  s = s.replace(/[ \u00a0]+/g, " ");
  s = s.replace(/\n{4,}/g, "\n\n\n");
  if (s.length <= maxChars) return s;

  const budget = maxChars - ELLIPSIS.length;
  let cut = s.slice(0, Math.max(0, budget));
  const lastNl = cut.lastIndexOf("\n");
  const lastSp = cut.lastIndexOf(" ");
  const preferBreak = Math.max(lastNl, lastSp);
  if (preferBreak > budget * 0.75) {
    cut = cut.slice(0, preferBreak);
  }
  return `${cut.trimEnd()}${ELLIPSIS}`;
}

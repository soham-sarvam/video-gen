/**
 * @deprecated Style pack prompt knowledge is now inline in prompt-library.ts.
 * This file is kept for backward compatibility with tests but does nothing useful.
 */
import { getStyleDirective } from "./prompt-library";

export async function loadStylePackContent(id: string): Promise<string | null> {
  const directive = getStyleDirective(id);
  if (!directive) return null;
  return [
    `# ${directive.label}`,
    ``,
    `**Visual style**: ${directive.visualStyle}`,
    `**Camera**: ${directive.cameraPreferences}`,
    `**Lighting**: ${directive.lightingPreferences}`,
    `**Pacing**: ${directive.pacingNotes}`,
  ].join("\n");
}

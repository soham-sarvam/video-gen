/**
 * Server-only loader for style-pack SKILL.md content. Reads from disk.
 * Lives in a separate module from `style-pack-registry.ts` so the registry
 * data + heuristic stays bundleable into client components without dragging
 * `node:fs/promises` into the client bundle.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { STYLE_PACKS } from "./style-pack-registry";

export async function loadStylePackContent(id: string): Promise<string | null> {
  const pack = STYLE_PACKS.find((p) => p.id === id);
  if (!pack || !pack.skillPath) return null;
  const absPath = path.join(process.cwd(), pack.skillPath);
  return await readFile(absPath, "utf-8");
}

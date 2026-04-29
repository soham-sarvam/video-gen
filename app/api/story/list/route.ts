/**
 * GET /api/story/list
 *
 * Scans the archive directory for all story-* folders across providers,
 * reads each state.json, and returns a sorted list of story summaries.
 */
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { existsSync } from "node:fs";
import {
  GENERATIONS_SUBDIR,
  UPLOAD_DIR_NAME,
  UPLOAD_PUBLIC_PATH,
  type Provider,
} from "@/lib/constants";
import type { StoryRun } from "@/lib/story/types";
import { jsonOk } from "@/lib/server-utils";

export const runtime = "nodejs";

export interface CharacterSummary {
  id: string;
  name: string;
  sheetUrl?: string;
}

export interface StorySummary {
  storyId: string;
  provider: Provider;
  mode: string;
  beatCount: number;
  completedBeats: number;
  totalDurationSeconds: number;
  stitchStatus: string;
  finalLocalUrl?: string;
  characterSheetUrl?: string;
  characterProfiles?: CharacterSummary[];
  createdAt: string;
  stylePackId: string;
}

function archiveRoot(): string {
  return path.join(process.cwd(), "public", UPLOAD_DIR_NAME, GENERATIONS_SUBDIR);
}

export async function GET(): Promise<Response> {
  const root = archiveRoot();
  const summaries: StorySummary[] = [];

  for (const provider of ["fal", "kie"] as Provider[]) {
    const providerDir = path.join(root, provider);
    if (!existsSync(providerDir)) continue;

    const entries = await readdir(providerDir);
    for (const entry of entries) {
      if (!entry.startsWith("story-")) continue;
      const stateFile = path.join(providerDir, entry, "state.json");
      if (!existsSync(stateFile)) continue;

      try {
        const raw = await readFile(stateFile, "utf-8");
        const run = JSON.parse(raw) as StoryRun;
        const fileStat = await stat(stateFile);

        summaries.push({
          storyId: run.storyId,
          provider,
          mode: run.mode,
          beatCount: run.beats.length,
          completedBeats: run.beats.filter((b) => b.status === "completed").length,
          totalDurationSeconds: run.totalDurationSeconds,
          stitchStatus: run.stitchStatus,
          finalLocalUrl: run.finalLocalUrl,
          characterSheetUrl: run.characterSheetUrl,
          characterProfiles: run.characterProfiles?.map((p) => ({
            id: p.id,
            name: p.name,
            sheetUrl: p.sheetUrl,
          })),
          createdAt: fileStat.mtime.toISOString(),
          stylePackId: run.stylePackId,
        });
      } catch {
        // skip corrupted state files
      }
    }
  }

  summaries.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return jsonOk(summaries);
}

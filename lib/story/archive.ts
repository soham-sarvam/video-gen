/**
 * Story-level archive layout under public/uploads/generations/<provider>/story-<storyId>/.
 * Mirrors lib/generation-archive.ts patterns but adds per-beat subdirs and
 * a state.json file so a long-running job can resume after a restart.
 */
import { existsSync } from "node:fs";
import { mkdir, rename, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import {
  GENERATIONS_SUBDIR,
  type Provider,
  UPLOAD_DIR_NAME,
  UPLOAD_PUBLIC_PATH,
} from "@/lib/constants";
import type { ContinuityTier } from "./types";

const ARCHIVE_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0 Safari/537.36";

function archiveRoot(): string {
  return path.join(process.cwd(), "public", UPLOAD_DIR_NAME, GENERATIONS_SUBDIR);
}

function safeId(input: string): string {
  return input.replace(/[^\w-]+/g, "-").slice(0, 64).toLowerCase();
}

export async function ensureStoryDir(provider: Provider, storyId: string): Promise<string> {
  const dir = path.join(archiveRoot(), safeId(provider), `story-${safeId(storyId)}`);
  await mkdir(dir, { recursive: true });
  return dir;
}

export async function writeState<T>(provider: Provider, storyId: string, state: T): Promise<void> {
  const dir = await ensureStoryDir(provider, storyId);
  const finalPath = path.join(dir, "state.json");
  const tmpPath = `${finalPath}.tmp`;
  await writeFile(tmpPath, JSON.stringify(state, null, 2));
  await rename(tmpPath, finalPath);
}

export async function readState<T>(provider: Provider, storyId: string): Promise<T | null> {
  const dir = path.join(archiveRoot(), safeId(provider), `story-${safeId(storyId)}`);
  const p = path.join(dir, "state.json");
  if (!existsSync(p)) return null;
  return JSON.parse(await readFile(p, "utf-8")) as T;
}

export interface ArchiveBeatVideoInput {
  provider: Provider;
  storyId: string;
  beatIndex: number;
  remoteUrl: string;
  taskId: string;
  tier: ContinuityTier;
  fullPrompt: string;
}

export interface ArchiveBeatVideoOutput {
  diskPath: string;
  localUrl: string;
  sizeBytes: number;
}

export async function archiveBeatVideo(
  input: ArchiveBeatVideoInput,
): Promise<ArchiveBeatVideoOutput> {
  const storyDir = await ensureStoryDir(input.provider, input.storyId);
  const beatDir = path.join(storyDir, `beat-${input.beatIndex}`);
  await mkdir(beatDir, { recursive: true });

  const videoPath = path.join(beatDir, "video.mp4");
  const promptPath = path.join(beatDir, "prompt.txt");
  const metaPath = path.join(beatDir, "metadata.json");

  if (!existsSync(videoPath)) {
    const res = await fetch(input.remoteUrl, {
      headers: { "User-Agent": ARCHIVE_USER_AGENT },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Beat archive fetch failed: HTTP ${res.status}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    await writeFile(videoPath, buffer);
  }

  await writeFile(promptPath, input.fullPrompt);

  const meta = {
    storyId: input.storyId,
    beatIndex: input.beatIndex,
    taskId: input.taskId,
    tier: input.tier,
    remoteUrl: input.remoteUrl,
    archivedAt: new Date().toISOString(),
  };
  await writeFile(metaPath, JSON.stringify(meta, null, 2));

  const localUrl = `${UPLOAD_PUBLIC_PATH}/${GENERATIONS_SUBDIR}/${safeId(input.provider)}/story-${safeId(input.storyId)}/beat-${input.beatIndex}/video.mp4`;
  const buf = await readFile(videoPath);
  return { diskPath: videoPath, localUrl, sizeBytes: buf.length };
}

export async function writeFinalVideo(
  provider: Provider,
  storyId: string,
  bytes: Buffer,
): Promise<string> {
  const dir = await ensureStoryDir(provider, storyId);
  const finalPath = path.join(dir, "final.mp4");
  await writeFile(finalPath, bytes);
  return `${UPLOAD_PUBLIC_PATH}/${GENERATIONS_SUBDIR}/${safeId(provider)}/story-${safeId(storyId)}/final.mp4`;
}

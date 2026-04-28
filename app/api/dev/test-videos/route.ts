/**
 * Dev-only endpoint that lists video files under `public/test-videos/`
 * so the editor sandbox at /test-editor can populate its picker
 * without the developer typing URLs by hand.
 *
 * Files placed in `public/test-videos/foo.mp4` are served by Next.js
 * at `/test-videos/foo.mp4`, so we just return relative URLs and let
 * the client prefix the origin when the editor needs an absolute one.
 */
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import {
  getErrorMessage,
  jsonError,
  jsonOk,
} from "@/lib/server-utils";

export const runtime = "nodejs";

const VIDEO_EXT_RE = /\.(mp4|webm|mov|m4v)$/i;
const TEST_DIR = "test-videos";

export interface TestVideoEntry {
  /** Filename only — used as a label in the picker. */
  name: string;
  /** Public-facing path under the Next.js public folder. */
  url: string;
  /** File size in bytes — surfaced so the picker can flag huge files. */
  bytes: number;
}

export async function GET(): Promise<Response> {
  try {
    const dir = path.join(process.cwd(), "public", TEST_DIR);
    const names = await readdir(dir).catch(() => [] as string[]);
    const entries: TestVideoEntry[] = [];
    for (const name of names) {
      if (!VIDEO_EXT_RE.test(name)) continue;
      const stats = await stat(path.join(dir, name)).catch(() => null);
      if (!stats || !stats.isFile()) continue;
      entries.push({
        name,
        url: `/${TEST_DIR}/${name}`,
        bytes: stats.size,
      });
    }
    // Newest-first: easier to find the file you just dropped in.
    entries.sort((a, b) => a.name.localeCompare(b.name));
    return jsonOk({ videos: entries });
  } catch (error: unknown) {
    return jsonError(getErrorMessage(error), 500);
  }
}

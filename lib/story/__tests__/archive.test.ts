import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  archiveBeatVideo,
  ensureStoryDir,
  readState,
  writeState,
} from "../archive";

let workDir = "";
beforeEach(() => {
  workDir = mkdtempSync(path.join(tmpdir(), "story-archive-"));
  vi.spyOn(process, "cwd").mockReturnValue(workDir);
});
afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("story archive", () => {
  it("ensureStoryDir creates the per-story tree", async () => {
    const dir = await ensureStoryDir("kie", "abc123");
    expect(existsSync(dir)).toBe(true);
    expect(dir.endsWith(path.join("public", "uploads", "generations", "kie", "story-abc123"))).toBe(true);
  });

  it("writeState then readState round-trips", async () => {
    await writeState("kie", "abc123", { hello: "world", n: 5 });
    const out = await readState<{ hello: string; n: number }>("kie", "abc123");
    expect(out).toEqual({ hello: "world", n: 5 });
  });

  it("archiveBeatVideo writes video.mp4 + metadata.json under beat-<index>/", async () => {
    const remote = "data:video/mp4;base64,AAEC";
    // Stub the global fetch — archiver downloads from remoteUrl.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => new Uint8Array([0x00, 0x00, 0x01, 0x02]).buffer,
      }),
    );

    const out = await archiveBeatVideo({
      provider: "kie",
      storyId: "abc123",
      beatIndex: 1,
      remoteUrl: "https://x/video.mp4",
      taskId: "t1",
      tier: "fresh",
      fullPrompt: "p",
    });

    expect(existsSync(out.diskPath)).toBe(true);
    const metaPath = path.join(path.dirname(out.diskPath), "metadata.json");
    const meta = JSON.parse(readFileSync(metaPath, "utf-8"));
    expect(meta.beatIndex).toBe(1);
    expect(meta.tier).toBe("fresh");
  });
});

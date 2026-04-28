/**
 * Quality mode runner — reactive linear chain.
 *
 * For each beat:
 *   1. Synthesize the full Seedance prompt (Gemini, given outline + previous beat result).
 *   2. Build per-tier reference shape (fresh / motion-match / frame-exact-motion-match).
 *   3. Submit to provider, poll until completed.
 *   4. Archive the beat's video.
 *   5. If not last beat: trim trail (last 10s), upload, extract last frame for deluxe.
 *   6. Write state.json after every transition.
 */
import path from "node:path";
import { tmpdir } from "node:os";
import { nanoid } from "nanoid";
import { getProvider } from "@/lib/providers";
import type { GenerationInput } from "@/lib/providers/types";
import { archiveBeatVideo, writeState } from "../archive";
import { synthesizeBeatPrompt } from "../beat-prompt-synth";
import { describeEndState } from "../end-state-describer";
import { extractLastFrame } from "../frame-extract";
import { trimAndUpload } from "../video-trim";
import type { BeatRun, ContinuityTier, StoryRun } from "../types";
import type { ChainRunner, ChainRunnerInput } from "./types";

function pickTier(
  beat: { role: "opener" | "continuation"; pinFrame?: boolean },
  modelProvider: "fal" | "kie",
  hasPrev: boolean,
): ContinuityTier {
  if (!hasPrev || beat.role === "opener") return "fresh";
  if (beat.pinFrame && modelProvider === "kie") return "frame-exact-motion-match";
  return "motion-match";
}

async function pollUntilCompleted(
  provider: ReturnType<typeof getProvider>,
  taskId: string,
  model: ChainRunnerInput["model"],
): Promise<{ videoUrl: string; seed: number | null }> {
  const intervalMs = 3000;
  const maxAttempts = 240; // ~12 min ceiling
  for (let i = 0; i < maxAttempts; i++) {
    const status = await provider.status(taskId, model);
    if (status.status === "completed") return await provider.result(taskId, model);
    if (status.status === "failed") {
      throw new Error(`Beat generation failed: ${status.logs.join(" | ") || status.rawStatus}`);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error("Beat generation timed out (12 min ceiling).");
}

export const sequentialRunner: ChainRunner = {
  async run(input: ChainRunnerInput): Promise<StoryRun> {
    const { outline, model, references, voiceTimbreCdnUrl, onProgress } = input;
    const provider = getProvider(model);
    const beatRuns: BeatRun[] = [];
    const run: StoryRun = {
      ...outline,
      beats: [],
      stitchStatus: "pending",
    };

    let previousBeat: BeatRun | null = null;
    for (const outlineBeat of outline.beats) {
      const tier = pickTier(outlineBeat, model.provider, !!previousBeat);

      // 1. Synthesize full prompt with knowledge of previous beat's actual state.
      const fullPrompt = await synthesizeBeatPrompt({
        beatOutline: outlineBeat,
        story: outline,
        previousBeat,
        tier,
      });

      // 2. Build refs.
      const imageUrlsBase = references.images
        .map((a) => a.cdnUrls[model.provider])
        .filter((u): u is string => !!u);
      const videoUrlsBase = references.videos
        .map((a) => a.cdnUrls[model.provider])
        .filter((u): u is string => !!u);
      const audioUrlsBase = [
        voiceTimbreCdnUrl,
        ...references.audios
          .map((a) => a.cdnUrls[model.provider])
          .filter((u): u is string => !!u),
      ];

      const genInput: GenerationInput = {
        model,
        prompt: fullPrompt,
        resolution: "720p",
        aspectRatio: "16:9",
        duration: String(outlineBeat.durationSeconds) as GenerationInput["duration"],
        generateAudio: true,
        seed: 20260427 * outlineBeat.index,
        imageUrls: imageUrlsBase.slice(0, 9),
        // KIE caps combined ref_video_urls duration at 15s. The 10s trail
        // alone leaves only 5s of headroom — adding the user's 13s clip blows
        // the cap. On continuation beats the trail carries the consistency we
        // need; the user's reference video already shaped the opener.
        videoUrls:
          tier !== "fresh" && previousBeat?.trailVideoUrl
            ? [previousBeat.trailVideoUrl]
            : videoUrlsBase.slice(0, 3),
        audioUrls: audioUrlsBase.slice(0, 3),
        firstFrameUrl:
          tier === "frame-exact-motion-match" ? previousBeat?.lastFrameUrl : undefined,
      };

      // 3. Submit & poll.
      const submitted = await provider.submit(genInput);
      const queued: BeatRun = {
        ...outlineBeat,
        status: "queued",
        taskId: submitted.taskId,
        fullPrompt,
        tier,
      };
      beatRuns.push(queued);
      run.beats = beatRuns;
      await writeState(model.provider, outline.storyId, run);
      await onProgress?.(run);

      const result = await pollUntilCompleted(provider, submitted.taskId, model);

      // 4. Archive.
      const archived = await archiveBeatVideo({
        provider: model.provider,
        storyId: outline.storyId,
        beatIndex: outlineBeat.index,
        remoteUrl: result.videoUrl,
        taskId: submitted.taskId,
        tier,
        fullPrompt,
      });

      const completed: BeatRun = {
        ...queued,
        status: "completed",
        videoUrl: result.videoUrl,
        localUrl: archived.localUrl,
        diskPath: archived.diskPath,
      };

      // 5. If not last: prep trail + frame for next beat.
      const isLast =
        outlineBeat.index === outline.beats[outline.beats.length - 1].index;
      if (!isLast) {
        completed.trailVideoUrl = await trimAndUpload(archived.diskPath, 10, model.provider);
        const lastFramePath = path.join(tmpdir(), `last-${nanoid(8)}.png`);
        await extractLastFrame(archived.diskPath, lastFramePath);
        // The describer fires off in parallel — we don't strictly need its
        // result for trail-only chains, but we pass it to the next beat.
        try {
          const fs = await import("node:fs/promises");
          const buf = await fs.readFile(lastFramePath);
          completed.endStateDescription = await describeEndState({
            framePngBuffer: buf,
            contextSummary: outlineBeat.oneLineSummary,
          });
        } catch {
          // best-effort
        }
      }

      beatRuns[beatRuns.length - 1] = completed;
      run.beats = beatRuns;
      await writeState(model.provider, outline.storyId, run);
      await onProgress?.(run);
      previousBeat = completed;
    }

    return run;
  },
};

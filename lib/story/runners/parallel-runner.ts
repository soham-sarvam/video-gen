/**
 * Fast mode runner — parallel all-fresh chain. Every beat uses canonical refs
 * only (no @video1 trail), so all submissions can fly in parallel.
 *
 * The outline carries `fullPrompt` for every beat (Fast mode invariant), so
 * there's no Gemini per-beat synthesis pass.
 */
import { getProvider } from "@/lib/providers";
import type { GenerationInput } from "@/lib/providers/types";
import { archiveBeatVideo, writeState } from "../archive";
import type { BeatRun, StoryRun } from "../types";
import type { ChainRunner, ChainRunnerInput } from "./types";

async function pollUntilCompleted(
  provider: ReturnType<typeof getProvider>,
  taskId: string,
  model: ChainRunnerInput["model"],
): Promise<{ videoUrl: string; seed: number | null }> {
  const intervalMs = 3000;
  const maxAttempts = 240;
  for (let i = 0; i < maxAttempts; i++) {
    const s = await provider.status(taskId, model);
    if (s.status === "completed") return await provider.result(taskId, model);
    if (s.status === "failed") {
      throw new Error(`Beat generation failed: ${s.logs.join(" | ") || s.rawStatus}`);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error("Beat generation timed out (12 min ceiling).");
}

export const parallelRunner: ChainRunner = {
  async run(input: ChainRunnerInput): Promise<StoryRun> {
    const { outline, model, references, voiceTimbreCdnUrl, onProgress } = input;
    const provider = getProvider(model);

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

    // Initial run state — all queued.
    const beatRuns: BeatRun[] = outline.beats.map((b) => ({
      ...b,
      status: "queued",
      taskId: "",
      fullPrompt: b.fullPrompt ?? "",
      tier: "fresh",
    }));
    const run: StoryRun = { ...outline, beats: beatRuns, stitchStatus: "pending" };
    await writeState(model.provider, outline.storyId, run);
    await onProgress?.(run);

    const beatPromises = outline.beats.map(async (outlineBeat, i) => {
      const fullPrompt = outlineBeat.fullPrompt ?? "";

      const genInput: GenerationInput = {
        model,
        prompt: fullPrompt,
        resolution: "720p",
        aspectRatio: "16:9",
        duration: String(outlineBeat.durationSeconds) as GenerationInput["duration"],
        generateAudio: true,
        seed: 20260427 * outlineBeat.index,
        imageUrls: imageUrlsBase.slice(0, 9),
        videoUrls: videoUrlsBase.slice(0, 3),
        audioUrls: audioUrlsBase.slice(0, 3),
      };

      const submitted = await provider.submit(genInput);
      beatRuns[i] = { ...beatRuns[i], taskId: submitted.taskId };
      await writeState(model.provider, outline.storyId, run);
      await onProgress?.(run);

      const result = await pollUntilCompleted(provider, submitted.taskId, model);
      const archived = await archiveBeatVideo({
        provider: model.provider,
        storyId: outline.storyId,
        beatIndex: outlineBeat.index,
        remoteUrl: result.videoUrl,
        taskId: submitted.taskId,
        tier: "fresh",
        fullPrompt,
      });

      beatRuns[i] = {
        ...beatRuns[i],
        status: "completed",
        videoUrl: result.videoUrl,
        localUrl: archived.localUrl,
        diskPath: archived.diskPath,
      };
      await writeState(model.provider, outline.storyId, run);
      await onProgress?.(run);
    });

    await Promise.all(beatPromises);
    return run;
  },
};

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

/** Drop empty strings, undefined, and non-HTTP(S) URLs before sending to KIE. */
function validUrls(urls: (string | undefined | null)[]): string[] {
  return urls.filter(
    (u): u is string => typeof u === "string" && u.length > 0 && /^https?:\/\//i.test(u),
  );
}

/**
 * Build a "[Reference Assets]" block mapping @image1…@imageN, @video1…, @audio1…
 * to human-readable labels so the video model knows what each slot contains.
 */
function buildReferenceLegend(opts: {
  imageLabels?: string[];
  imageCount: number;
  videoCount: number;
  audioCount: number;
  hasVoiceTimbre: boolean;
}): string {
  const lines: string[] = [];
  if (opts.imageLabels) {
    for (let i = 0; i < Math.min(opts.imageLabels.length, opts.imageCount); i++) {
      lines.push(`@image${i + 1} = ${opts.imageLabels[i]}`);
    }
  }
  if (opts.videoCount > 0) {
    lines.push(`@video1 = Reference video for motion/choreography continuity`);
  }
  if (opts.audioCount > 0 && opts.hasVoiceTimbre) {
    lines.push(`@audio1 = Voice timbre reference — match this speaker's pitch, accent and cadence`);
  }
  if (lines.length === 0) return "";
  return `[Reference Assets]\n${lines.join("\n")}\nUse these @-references in the visual prompt to anchor character identity, motion continuity, and voice timbre.`;
}

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
      const msg = s.logs.join(" | ") || s.rawStatus;
      throw new Error(`Beat generation failed: ${msg}`);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error("Beat generation timed out (12 min ceiling).");
}

const FILE_PROCESSING_RE = /file processing failed/i;
const MAX_RETRIES = 2;

async function submitWithRetry(
  provider: ReturnType<typeof getProvider>,
  genInput: GenerationInput,
  model: ChainRunnerInput["model"],
): Promise<{ taskId: string; videoUrl: string; seed: number | null }> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const submitted = await provider.submit(genInput);
    try {
      const result = await pollUntilCompleted(provider, submitted.taskId, model);
      return { taskId: submitted.taskId, ...result };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < MAX_RETRIES && FILE_PROCESSING_RE.test(lastError.message)) {
        console.warn(
          `[par-runner] "File processing failed" — retrying (attempt ${attempt + 1})`,
        );
        await new Promise((r) => setTimeout(r, 8000 * (attempt + 1)));
        continue;
      }
      throw lastError;
    }
  }
  throw lastError ?? new Error("submitWithRetry exhausted");
}

export const parallelRunner: ChainRunner = {
  async run(input: ChainRunnerInput): Promise<StoryRun> {
    const { outline, model, references, voiceTimbreCdnUrl, imageLabels, onProgress } = input;
    const provider = getProvider(model);

    const imageUrlsBase = validUrls(
      references.images.map((a) => a.cdnUrls[model.provider]),
    );
    const videoUrlsBase = validUrls(
      references.videos.map((a) => a.cdnUrls[model.provider]),
    );
    const audioUrlsBase = validUrls([
      voiceTimbreCdnUrl,
      ...references.audios.map((a) => a.cdnUrls[model.provider]),
    ]);

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

    const imageUrls = imageUrlsBase.slice(0, 9);
    const videoUrls = videoUrlsBase.slice(0, 3);
    const audioUrls = audioUrlsBase.slice(0, 3);
    console.log(
      `[par-runner] refs: img=${imageUrls.length} vid=${videoUrls.length} aud=${audioUrls.length}`,
    );

    // Build @imageN/@videoN/@audioN legend so the model knows what each ref slot is.
    const refLegend = buildReferenceLegend({
      imageLabels,
      imageCount: imageUrls.length,
      videoCount: videoUrls.length,
      audioCount: audioUrls.length,
      hasVoiceTimbre: !!voiceTimbreCdnUrl,
    });

    const beatPromises = outline.beats.map(async (outlineBeat, i) => {
      const basePrompt = outlineBeat.fullPrompt ?? "";
      const fullPrompt = refLegend ? `${basePrompt}\n\n${refLegend}` : basePrompt;

      const genInput: GenerationInput = {
        model,
        prompt: fullPrompt,
        resolution: outline.resolution ?? "720p",
        aspectRatio: outline.aspectRatio ?? "16:9",
        duration: String(outlineBeat.durationSeconds) as GenerationInput["duration"],
        generateAudio: outline.generateAudio ?? true,
        seed: 20260427 * outlineBeat.index,
        imageUrls,
        videoUrls,
        audioUrls,
      };

      try {
        const result = await submitWithRetry(provider, genInput, model);
        beatRuns[i] = { ...beatRuns[i], taskId: result.taskId };
        await writeState(model.provider, outline.storyId, run);
        await onProgress?.(run);

        const archived = await archiveBeatVideo({
          provider: model.provider,
          storyId: outline.storyId,
          beatIndex: outlineBeat.index,
          remoteUrl: result.videoUrl,
          taskId: result.taskId,
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
      } catch (err) {
        console.error(
          `[par-runner] beat=${outlineBeat.index} failed: ${err instanceof Error ? err.message : String(err)}`,
        );
        beatRuns[i] = {
          ...beatRuns[i],
          status: "failed",
          failureMessage: err instanceof Error ? err.message : String(err),
        };
      }
      await writeState(model.provider, outline.storyId, run);
      await onProgress?.(run);
    });

    await Promise.all(beatPromises);

    const anyFailed = beatRuns.some((b) => b.status === "failed");
    if (anyFailed && beatRuns.every((b) => b.status === "failed")) {
      throw new Error("All beats failed. Check server logs for details.");
    }

    return run;
  },
};

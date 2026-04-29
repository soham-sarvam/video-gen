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
 *
 * If a beat fails after retries it is marked "failed" and the chain continues
 * (next beat falls back to "fresh" tier since there is no trail to hand off).
 * Only if ALL beats fail does the runner throw.
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
  tier: ContinuityTier;
}): string {
  const lines: string[] = [];
  if (opts.imageLabels) {
    for (let i = 0; i < Math.min(opts.imageLabels.length, opts.imageCount); i++) {
      lines.push(`@image${i + 1} = ${opts.imageLabels[i]}`);
    }
  }
  if (opts.videoCount > 0) {
    const videoRole = opts.tier !== "fresh"
      ? "Previous beat's trail clip — continue seamlessly from its end state"
      : "Reference video for motion/choreography continuity";
    lines.push(`@video1 = ${videoRole}`);
  }
  if (opts.audioCount > 0 && opts.hasVoiceTimbre) {
    lines.push(`@audio1 = Voice timbre reference — match this speaker's pitch, accent and cadence`);
  }
  if (lines.length === 0) return "";
  return `[Reference Assets]\n${lines.join("\n")}\nUse these @-references in the visual prompt to anchor character identity, motion continuity, and voice timbre.`;
}

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
      const msg = status.logs.join(" | ") || status.rawStatus;
      throw new Error(`Beat generation failed: ${msg}`);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error("Beat generation timed out (12 min ceiling).");
}

const FILE_PROCESSING_RE = /file processing failed/i;
const MAX_RETRIES = 2;

/**
 * Submit + poll with automatic retries when KIE returns the transient
 * "File processing failed" error (often caused by CDN propagation delay).
 */
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
          `[seq-runner] "File processing failed" — retrying (attempt ${attempt + 1})`,
        );
        await new Promise((r) => setTimeout(r, 8000 * (attempt + 1)));
        continue;
      }
      throw lastError;
    }
  }
  throw lastError ?? new Error("submitWithRetry exhausted");
}

export const sequentialRunner: ChainRunner = {
  async run(input: ChainRunnerInput): Promise<StoryRun> {
    const { outline, model, references, voiceTimbreCdnUrl, imageLabels, onProgress } = input;
    const provider = getProvider(model);
    const beatRuns: BeatRun[] = [];
    const run: StoryRun = {
      ...outline,
      beats: [],
      stitchStatus: "pending",
    };

    let previousBeat: BeatRun | null = null;
    for (const outlineBeat of outline.beats) {
      // After a failed beat there's no trail, so reset to fresh tier.
      const prevOk = previousBeat?.status === "completed";
      const tier = pickTier(outlineBeat, model.provider, !!previousBeat && prevOk);

      // 1. Synthesize full prompt with knowledge of previous beat's actual state.
      const synthPrompt = await synthesizeBeatPrompt({
        beatOutline: outlineBeat,
        story: outline,
        previousBeat: prevOk ? previousBeat : null,
        tier,
      });

      // 2. Build refs — validUrls() strips empty strings and non-HTTP(S) URLs
      //    so KIE never receives an unresolvable reference.
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

      const imageUrls = imageUrlsBase.slice(0, 9);
      const videoUrls =
        tier !== "fresh" && previousBeat?.trailVideoUrl
          ? validUrls([previousBeat.trailVideoUrl])
          : videoUrlsBase.slice(0, 3);
      const audioUrls = audioUrlsBase.slice(0, 3);

      // Append @imageN/@videoN/@audioN legend so the model knows what each ref slot is.
      const refLegend = buildReferenceLegend({
        imageLabels,
        imageCount: imageUrls.length,
        videoCount: videoUrls.length,
        audioCount: audioUrls.length,
        hasVoiceTimbre: !!voiceTimbreCdnUrl,
        tier,
      });
      const fullPrompt = refLegend ? `${synthPrompt}\n\n${refLegend}` : synthPrompt;

      console.log(
        `[seq-runner] beat=${outlineBeat.index} tier=${tier} refs: img=${imageUrls.length} vid=${videoUrls.length} aud=${audioUrls.length}`,
      );

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
        firstFrameUrl:
          tier === "frame-exact-motion-match"
            ? validUrls([previousBeat?.lastFrameUrl])[0]
            : undefined,
      };

      // 3. Submit & poll (with automatic retry on "File processing failed").
      const queued: BeatRun = {
        ...outlineBeat,
        status: "queued",
        taskId: "",
        fullPrompt,
        tier,
      };
      beatRuns.push(queued);
      run.beats = beatRuns;
      await writeState(model.provider, outline.storyId, run);
      await onProgress?.(run);

      try {
        const result = await submitWithRetry(provider, genInput, model);
        queued.taskId = result.taskId;

        // 4. Archive.
        const archived = await archiveBeatVideo({
          provider: model.provider,
          storyId: outline.storyId,
          beatIndex: outlineBeat.index,
          remoteUrl: result.videoUrl,
          taskId: result.taskId,
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
          try {
            completed.trailVideoUrl = await trimAndUpload(archived.diskPath, 10, model.provider);
            const lastFramePath = path.join(tmpdir(), `last-${nanoid(8)}.png`);
            await extractLastFrame(archived.diskPath, lastFramePath);
            const fs = await import("node:fs/promises");
            const buf = await fs.readFile(lastFramePath);
            completed.endStateDescription = await describeEndState({
              framePngBuffer: buf,
              contextSummary: outlineBeat.oneLineSummary,
            });
          } catch {
            // best-effort — next beat falls back to fresh tier
          }
        }

        beatRuns[beatRuns.length - 1] = completed;
        run.beats = beatRuns;
        await writeState(model.provider, outline.storyId, run);
        await onProgress?.(run);
        previousBeat = completed;
      } catch (err) {
        console.error(
          `[seq-runner] beat=${outlineBeat.index} failed: ${err instanceof Error ? err.message : String(err)}`,
        );
        beatRuns[beatRuns.length - 1] = {
          ...queued,
          status: "failed",
          failureMessage: err instanceof Error ? err.message : String(err),
        };
        run.beats = beatRuns;
        await writeState(model.provider, outline.storyId, run);
        await onProgress?.(run);
        previousBeat = beatRuns[beatRuns.length - 1];
      }
    }

    if (beatRuns.every((b) => b.status === "failed")) {
      throw new Error("All beats failed. Check server logs for details.");
    }

    return run;
  },
};

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Button,
  ButtonGroup,
  Input,
  Select,
  Text,
  Textarea,
  toast,
} from "@sarvam/tatva";
import { range } from "lodash";
import {
  DEFAULT_ASPECT_RATIO,
  DEFAULT_DURATION,
  DEFAULT_VIDEO_MODEL,
  DEFAULT_INDIC_LANGUAGE,
  DEFAULT_RESOLUTION,
  PROMPT_MAX_CHARS,
  PROMPT_MIN_CHARS,
  RESOLUTIONS,
  VIDEO_MODELS,
  getVideoModelById,
  isResolutionAllowed,
  isStoryMode,
  DEFAULT_GENERATION_MODE,
  DEFAULT_STORY_LENGTH,
  type AspectRatio,
  type Duration,
  type IndicLanguageCode,
  type Resolution,
  type VideoModelId,
} from "@/lib/constants";
import type {
  GenerationFormState,
  GenerationStatus,
  OptimizePromptResponse,
  SeedanceVideoOutput,
  SubmitGenerationResponse,
  UploadedAsset,
} from "@/lib/types";
import type { StoryOutline, StoryRun } from "@/lib/story/types";
import type { StorySummary } from "@/app/api/story/list/route";
import {
  validateAssetBundle,
  validatePromptReferences,
} from "@/lib/validation";
import { fetchJson } from "@/app/hooks/useApi";
import {
  ASPECT_RATIO_OPTIONS,
  DURATION_OPTIONS,
  LANGUAGE_OPTIONS,
  MODEL_OPTIONS,
  RESOLUTION_OPTIONS,
} from "@/app/constants";
import { AssetUploadField } from "./AssetUploadField";
import { VideoResultPanel } from "./VideoResultPanel";
import { StoryLengthField } from "./story/StoryLengthField";
import { ModeField } from "./story/ModeField";
import { ThemeField } from "./story/ThemeField";
import { OutlineReviewer, type CharacterSheetStatus } from "./story/OutlineReviewer";
import { StoryTimeline } from "./story/StoryTimeline";

const GENERATE_AUDIO_OPTIONS = [
  { value: "no", label: "No" },
  { value: "yes", label: "Yes" },
];

const INITIAL_FORM: GenerationFormState = {
  prompt: "",
  model: DEFAULT_VIDEO_MODEL,
  resolution: DEFAULT_RESOLUTION,
  aspectRatio: DEFAULT_ASPECT_RATIO,
  duration: DEFAULT_DURATION,
  generateAudio: false,
  webSearch: false,
  seed: "",
  language: DEFAULT_INDIC_LANGUAGE,
  referenceImages: [],
  referenceVideos: [],
  referenceAudios: [],
  storyLength: DEFAULT_STORY_LENGTH,
  generationMode: DEFAULT_GENERATION_MODE,
  stylePack: "auto",
};

type ResultStatus = "idle" | "generating" | "ready" | "error";

interface ResultState {
  status: ResultStatus;
  videoUrl?: string;
  seed?: number | null;
  errorMessage?: string;
  /** Live provider task status while polling. */
  queueStatus?: GenerationStatus["status"];
  queuePosition?: number | null;
  logs?: string[];
}

const INITIAL_RESULT: ResultState = { status: "idle" };

const POLL_INTERVAL_MS = 2500;
/** Hard ceiling on polling — Standard tier rarely exceeds 4 min. */
const POLL_MAX_ATTEMPTS = 240; // 240 × 2.5s = 10 min

/** Sleep helper that respects an AbortSignal. */
function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    });
  });
}

/** Builds a "Use @Image1, @Image2 …" hint for the prompt helper text. */
function buildReferenceHint(form: GenerationFormState): string {
  const tokens: string[] = [
    ...range(1, form.referenceImages.length + 1).map((n) => `@Image${n}`),
    ...range(1, form.referenceVideos.length + 1).map((n) => `@Video${n}`),
    ...range(1, form.referenceAudios.length + 1).map((n) => `@Audio${n}`),
  ];
  if (tokens.length === 0) return "Add references above to unlock @-syntax.";
  return `Reference your assets in the prompt: ${tokens.join(", ")}`;
}

interface GenerationFormProps {
  preloadStory?: StorySummary | null;
  onStoryLoaded?: () => void;
}

export function GenerationForm({ preloadStory, onStoryLoaded }: GenerationFormProps = {}) {
  const [form, setForm] = useState<GenerationFormState>(INITIAL_FORM);
  const [result, setResult] = useState<ResultState>(INITIAL_RESULT);
  const [optimizing, setOptimizing] = useState(false);
  const [storyOutline, setStoryOutline] = useState<StoryOutline | null>(null);
  const [storyRun, setStoryRun] = useState<StoryRun | null>(null);
  const [isPlanningStory, setIsPlanningStory] = useState(false);
  const [isGeneratingStory, setIsGeneratingStory] = useState(false);
  const [characterSheet, setCharacterSheet] = useState<CharacterSheetStatus>({
    state: "idle",
  });

  useEffect(() => {
    if (!preloadStory) return;
    const loadStory = async () => {
      try {
        const run = await fetchJson<StoryRun>(
          `/api/story/status?storyId=${encodeURIComponent(preloadStory.storyId)}&provider=${preloadStory.provider}`,
        );
        setStoryRun(run);
        setForm((prev) => ({
          ...prev,
          storyLength: "half" as const,
          generationMode: run.mode as GenerationFormState["generationMode"],
          stylePack: run.stylePackId,
        }));
      } catch {
        toast.error("Failed to load story.");
      }
      onStoryLoaded?.();
    };
    void loadStory();
  }, [preloadStory, onStoryLoaded]);

  const setField = useCallback(
    <K extends keyof GenerationFormState>(
      key: K,
      value: GenerationFormState[K],
    ) => setForm((prev) => ({ ...prev, [key]: value })),
    [],
  );

  const makeAssetSetter = useCallback(
    (key: "referenceImages" | "referenceVideos" | "referenceAudios") =>
      (updater: (prev: UploadedAsset[]) => UploadedAsset[]) =>
        setForm((prev) => ({ ...prev, [key]: updater(prev[key]) })),
    [],
  );

  const referenceHint = useMemo(() => buildReferenceHint(form), [form]);

  /** Active model object (provider, tier, maxResolution, supportsWebSearch). */
  const activeModel = useMemo(
    () => getVideoModelById(form.model),
    [form.model],
  );

  /** Resolution options narrowed to whatever the selected tier supports. */
  const resolutionOptionsForModel = useMemo(
    () =>
      RESOLUTIONS.filter((r) =>
        isResolutionAllowed(r, activeModel.maxResolution),
      ).map((value) => ({ value, label: value })),
    [activeModel.maxResolution],
  );

  const handleOptimize = useCallback(async () => {
    if (!form.prompt.trim()) {
      toast.error("Write your raw idea before optimising.");
      return;
    }
    setOptimizing(true);
    try {
      const data = await fetchJson<OptimizePromptResponse>(
        "/api/optimize-prompt",
        {
          method: "POST",
          body: JSON.stringify({
            rawPrompt: form.prompt,
            language: form.language,
            duration: form.duration,
            referenceImages: form.referenceImages.map((a) => ({
              originalName: a.originalName,
              mimeType: a.mimeType,
            })),
            referenceVideos: form.referenceVideos.map((a) => ({
              originalName: a.originalName,
              mimeType: a.mimeType,
            })),
            referenceAudios: form.referenceAudios.map((a) => ({
              originalName: a.originalName,
              mimeType: a.mimeType,
            })),
          }),
        },
      );
      setField("prompt", data.optimizedPrompt);
      if (data.warnings.length > 0) {
        toast.warning({
          title: "Optimised, but with warnings",
          description: data.warnings.join(" · "),
        });
      } else {
        toast.success("Prompt optimised with Indic intonation cues.");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Optimisation failed.";
      toast.error(msg);
    } finally {
      setOptimizing(false);
    }
  }, [form, setField]);

  const handleGenerate = useCallback(async () => {
    if (form.prompt.trim().length < PROMPT_MIN_CHARS) {
      toast.error(`Prompt must be at least ${PROMPT_MIN_CHARS} characters.`);
      return;
    }

    const bundleErrors = validateAssetBundle({
      images: { length: form.referenceImages.length },
      videos: {
        length: form.referenceVideos.length,
        durations: form.referenceVideos.map((a) => a.durationSeconds ?? 0),
      },
      audios: {
        length: form.referenceAudios.length,
        durations: form.referenceAudios.map((a) => a.durationSeconds ?? 0),
      },
    });
    if (bundleErrors.length) {
      toast.error(bundleErrors.join(" · "));
      return;
    }

    const promptErrors = validatePromptReferences(form.prompt, {
      images: form.referenceImages.length,
      videos: form.referenceVideos.length,
      audios: form.referenceAudios.length,
    });
    if (promptErrors.length) {
      toast.error(promptErrors[0]);
      return;
    }

    const parsedSeed = form.seed.trim()
      ? Number.parseInt(form.seed, 10)
      : undefined;
    if (
      parsedSeed !== undefined &&
      (!Number.isFinite(parsedSeed) || parsedSeed < 0)
    ) {
      toast.error("Seed must be a non-negative integer.");
      return;
    }

    setResult({ status: "generating", queueStatus: "queued" });

    const abort = new AbortController();
    try {
      const activeModel = getVideoModelById(form.model);
      // 1) Submit — returns task_id immediately. Holds the connection
      //    only for the few seconds it takes the provider to acknowledge.
      const { taskId, model } = await fetchJson<SubmitGenerationResponse>(
        "/api/generate-video",
        {
          method: "POST",
          body: JSON.stringify({
            prompt: form.prompt,
            model: form.model,
            resolution: form.resolution,
            aspectRatio: form.aspectRatio,
            duration: form.duration,
            generateAudio: form.generateAudio,
            webSearch: activeModel.supportsWebSearch ? form.webSearch : undefined,
            seed: parsedSeed,
            referenceImages: form.referenceImages.map((a) => ({ cdnUrls: a.cdnUrls })),
            referenceVideos: form.referenceVideos.map((a) => ({ cdnUrls: a.cdnUrls })),
            referenceAudios: form.referenceAudios.map((a) => ({ cdnUrls: a.cdnUrls })),
          }),
        },
      );

      // 2) Poll status — short HTTP round-trips that survive Vercel's
      //    function timeout, give us live queue position + logs, and let
      //    the user navigate away and (eventually) resume.
      const qs = `taskId=${encodeURIComponent(taskId)}&model=${encodeURIComponent(model)}`;
      const statusUrl = `/api/generation-status?${qs}`;
      const resultUrl = `/api/generation-result?${qs}`;

      let attempts = 0;
      while (attempts < POLL_MAX_ATTEMPTS) {
        attempts += 1;
        const status = await fetchJson<GenerationStatus>(statusUrl);
        setResult((prev) => ({
          ...prev,
          status: "generating",
          queueStatus: status.status,
          queuePosition: status.queuePosition,
          logs: status.logs.slice(-3),
        }));

        if (status.status === "failed") {
          throw new Error(
            status.logs[status.logs.length - 1] ??
              `Generation failed (provider state: ${status.rawStatus}).`,
          );
        }
        if (status.status === "completed") {
          // 3) Fetch the final result. Server has already archived the
          //    video to local disk and returns `localUrl` — prefer that
          //    over the upstream URL so playback survives CDN expiry.
          const data = await fetchJson<SeedanceVideoOutput>(resultUrl);
          setResult({
            status: "ready",
            videoUrl: data.localUrl ?? data.videoUrl,
            seed: data.seed,
          });
          toast.success(
            data.localUrl
              ? "Video generated and archived locally."
              : "Video generated (local archive unavailable).",
          );
          return;
        }
        await delay(POLL_INTERVAL_MS, abort.signal);
      }
      throw new Error("Generation timed out after 10 minutes.");
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      const msg = err instanceof Error ? err.message : "Generation failed.";
      setResult({ status: "error", errorMessage: msg });
      toast.error(msg);
    }
  }, [form]);

  const fetchCharacterSheet = useCallback(
    async (outline: StoryOutline) => {
      setCharacterSheet({ state: "loading" });
      try {
        const data = await fetchJson<{
          asset: UploadedAsset | null;
          source: "user-images" | "video-first-frame" | "text-imagined";
        }>("/api/story/character-sheet", {
          method: "POST",
          body: JSON.stringify({
            outline,
            references: {
              images: form.referenceImages,
              videos: form.referenceVideos,
              audios: form.referenceAudios,
            },
          }),
        });
        setCharacterSheet({
          state: "ready",
          source: data.source,
          asset: data.asset,
        });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Character sheet generation failed.";
        setCharacterSheet({ state: "error", message });
      }
    },
    [form.referenceImages, form.referenceVideos, form.referenceAudios],
  );

  const handlePlanStory = useCallback(async () => {
    setIsPlanningStory(true);
    setCharacterSheet({ state: "idle" });
    try {
      const data = await fetchJson<{ outline: StoryOutline; warnings: string[] }>(
        "/api/story/outline",
        {
          method: "POST",
          body: JSON.stringify({
            prompt: form.prompt,
            language: form.language,
            storyLength: form.storyLength,
            mode: form.generationMode,
            stylePack: form.stylePack,
            model: form.model,
            resolution: form.resolution,
            aspectRatio: form.aspectRatio,
            references: {
              images: form.referenceImages,
              videos: form.referenceVideos,
              audios: form.referenceAudios,
            },
          }),
        },
      );
      setStoryOutline(data.outline);
      if (data.warnings.length) {
        toast.warning({ title: "Outline warnings", description: data.warnings.join(" · ") });
      }
      // Multi-clip runs only — kick off the sheet in parallel so the user
      // can preview the canonical character before approving.
      if (isStoryMode(form.storyLength)) {
        void fetchCharacterSheet(data.outline);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Plan failed.");
    } finally {
      setIsPlanningStory(false);
    }
  }, [form, fetchCharacterSheet]);

  const handleRegenerateCharacterSheet = useCallback(() => {
    if (!storyOutline) return;
    void fetchCharacterSheet(storyOutline);
  }, [fetchCharacterSheet, storyOutline]);

  const handleSubmitStory = useCallback(async () => {
    if (!storyOutline) return;
    setIsGeneratingStory(true);
    try {
      const characterSheetAsset =
        characterSheet.state === "ready" ? characterSheet.asset : null;
      await fetchJson<{ storyId: string; model: string }>(
        "/api/story/submit",
        {
          method: "POST",
          body: JSON.stringify({
            outline: storyOutline,
            model: form.model,
            references: {
              images: form.referenceImages,
              videos: form.referenceVideos,
              audios: form.referenceAudios,
            },
            characterSheetAsset,
          }),
        },
      );
      const provider = form.model.startsWith("kie") ? "kie" : "fal";
      const statusUrl = `/api/story/status?storyId=${encodeURIComponent(storyOutline.storyId)}&provider=${provider}`;
      const resultUrl = `/api/story/result?storyId=${encodeURIComponent(storyOutline.storyId)}&provider=${provider}`;

      let pollErrors = 0;
      const MAX_POLL_ERRORS = 5;
      const MAX_POLL_ROUNDS = 400; // ~20 min ceiling at 3s interval
      let round = 0;

      const poll = async () => {
        round += 1;
        if (round > MAX_POLL_ROUNDS) {
          toast.error("Story generation timed out.");
          setIsGeneratingStory(false);
          return;
        }
        try {
          const run = await fetchJson<StoryRun>(statusUrl);
          setStoryRun(run);
          pollErrors = 0;

          if (run.stitchStatus === "failed") {
            toast.error(run.failure?.message ?? "Story generation failed.");
            setIsGeneratingStory(false);
            return;
          }

          const done = run.beats.every((b) => b.status === "completed");
          if (done && run.stitchStatus === "completed" && run.finalLocalUrl) {
            toast.success("Story ready.");
            setIsGeneratingStory(false);
            return;
          }
          if (done && run.stitchStatus !== "completed") {
            try {
              const stitched = await fetchJson<StoryRun>(resultUrl);
              setStoryRun(stitched);
              toast.success("Story stitched.");
              setIsGeneratingStory(false);
              return;
            } catch {
              setTimeout(poll, 5000);
              return;
            }
          }
          setTimeout(poll, 3000);
        } catch (err) {
          pollErrors += 1;
          if (pollErrors >= MAX_POLL_ERRORS) {
            toast.error(err instanceof Error ? err.message : "Polling failed repeatedly.");
            setIsGeneratingStory(false);
            return;
          }
          setTimeout(poll, 5000);
        }
      };
      setTimeout(poll, 1500);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Submit failed.");
      setIsGeneratingStory(false);
    }
  }, [form, storyOutline, characterSheet]);

  const handleReset = useCallback(() => setResult(INITIAL_RESULT), []);

  const promptCount = `${form.prompt.length} / ${PROMPT_MAX_CHARS}`;

  return (
    <div className="flex flex-col gap-tatva-12">
      <Section
        title="Pipeline settings"
        description="Pick the Seedance tier and the high-level shape of the output."
      >
        <div className="grid grid-cols-1 gap-tatva-12 md:grid-cols-2">
          <Select
            label="Model"
            options={MODEL_OPTIONS}
            value={form.model}
            onValueChange={(v) => {
              setField("model", v as VideoModelId);
              // If new model can't support current resolution, downgrade.
              const next = getVideoModelById(v);
              setForm((prev) =>
                isResolutionAllowed(prev.resolution, next.maxResolution)
                  ? prev
                  : { ...prev, resolution: next.maxResolution },
              );
            }}
          />
          <Select
            label="Indic language (for prompt optimisation)"
            options={LANGUAGE_OPTIONS}
            value={form.language}
            onValueChange={(v) => setField("language", v as IndicLanguageCode)}
            searchable
          />
          <Select
            label={`Resolution (max ${activeModel.maxResolution} for ${activeModel.tier})`}
            options={resolutionOptionsForModel}
            value={form.resolution}
            onValueChange={(v) => setField("resolution", v as Resolution)}
          />
          <Select
            label="Aspect ratio"
            options={ASPECT_RATIO_OPTIONS}
            value={form.aspectRatio}
            onValueChange={(v) => setField("aspectRatio", v as AspectRatio)}
          />
          {!isStoryMode(form.storyLength) && (
            <Select
              label="Duration"
              options={DURATION_OPTIONS}
              value={form.duration}
              onValueChange={(v) => setField("duration", v as Duration)}
            />
          )}
          <Input
            label="Seed (optional)"
            placeholder="e.g. 20260424"
            value={form.seed}
            onChange={(e) => setField("seed", e.target.value)}
          />
        </div>
        <div className="flex items-center justify-between gap-tatva-8 pt-tatva-2">
          <Text as="label" variant="label-md">
            Generate audio
          </Text>
          <ButtonGroup
            items={GENERATE_AUDIO_OPTIONS}
            value={form.generateAudio ? "yes" : "no"}
            onValueChange={(v) => setField("generateAudio", v === "yes")}
          />
        </div>
        {activeModel.supportsWebSearch && (
          <div className="flex items-center justify-between gap-tatva-8 pt-tatva-2">
            <div className="flex flex-col gap-tatva-1">
              <Text as="label" variant="label-md">
                Web search grounding
              </Text>
              <Text variant="body-sm" tone="secondary">
                KIE-only. Lets Seedance ground references against live web
                results — increases factuality for branded scenes.
              </Text>
            </div>
            <ButtonGroup
              items={GENERATE_AUDIO_OPTIONS}
              value={form.webSearch ? "yes" : "no"}
              onValueChange={(v) => setField("webSearch", v === "yes")}
            />
          </div>
        )}
      </Section>

      <Section title="Story" description="Pick story length, mode, and theme.">
        <div className="grid grid-cols-1 gap-tatva-12 md:grid-cols-3">
          <StoryLengthField
            value={form.storyLength}
            onChange={(v) => setField("storyLength", v)}
          />
          <ThemeField
            value={form.stylePack}
            onChange={(v) => setField("stylePack", v)}
          />
          {isStoryMode(form.storyLength) && (
            <ModeField
              value={form.generationMode}
              onChange={(v) => setField("generationMode", v)}
            />
          )}
        </div>
      </Section>

      <Section
        title="Reference assets"
        description="Up to 9 images, 3 videos and 3 audio clips. Each gets an @image/@video/@audio handle you must reference in the prompt."
      >
        <div className="flex flex-col gap-tatva-16">
          <AssetUploadField
            kind="image"
            label="Reference images (character, scene, style)"
            assets={form.referenceImages}
            setAssets={makeAssetSetter("referenceImages")}
          />
          <AssetUploadField
            kind="video"
            label="Reference videos (camera, motion, choreography)"
            assets={form.referenceVideos}
            setAssets={makeAssetSetter("referenceVideos")}
          />
          <AssetUploadField
            kind="audio"
            label="Reference audio (vocal timbre, BGM, SFX)"
            assets={form.referenceAudios}
            setAssets={makeAssetSetter("referenceAudios")}
          />
        </div>
      </Section>

      <Section
        title="Prompt"
        description="Describe the scene; tap Optimise to rewrite it with Seedance's 8-element structure, Indic intonation, and vocal-similarity cues."
      >
        <Textarea
          label="Your idea"
          placeholder="A warm village storyteller introduces a folktale at dusk, oil-lamp glow, gentle dolly-in…"
          value={form.prompt}
          onChange={(e) => setField("prompt", e.target.value)}
          rows={8}
          helperText={`${referenceHint} · ${promptCount}`}
          maxLength={PROMPT_MAX_CHARS}
        />
        <div className="flex justify-end">
          <Button
            variant="secondary"
            icon="ai-magic"
            isLoading={optimizing}
            onClick={handleOptimize}
            disabled={optimizing}
          >
            {optimizing ? "Optimising…" : "Optimise with Gemini"}
          </Button>
        </div>
      </Section>

      {isStoryMode(form.storyLength) ? (
        <>
          {!storyOutline && (
            <div className="flex justify-end">
              <Button
                variant="primary"
                size="lg"
                onClick={handlePlanStory}
                isLoading={isPlanningStory}
                disabled={isPlanningStory}
              >
                Plan story
              </Button>
            </div>
          )}
          {storyOutline && (
            <OutlineReviewer
              outline={storyOutline}
              onOutlineChange={setStoryOutline}
              onRegenerate={handlePlanStory}
              onApprove={handleSubmitStory}
              isGenerating={isGeneratingStory}
              characterSheet={characterSheet}
              onRegenerateCharacterSheet={handleRegenerateCharacterSheet}
            />
          )}
          <StoryTimeline
            run={storyRun}
            onRerollBeat={(_index: number) => toast.info("Re-roll: implement in Phase 2.")}
            onReset={() => {
              setStoryOutline(null);
              setStoryRun(null);
              setCharacterSheet({ state: "idle" });
            }}
          />
        </>
      ) : (
        <>
          <div className="flex justify-end gap-tatva-8 border-t border-tatva-border-secondary pt-tatva-8">
            <Button
              variant="primary"
              size="lg"
              icon="play"
              width="full"
              isLoading={result.status === "generating"}
              disabled={result.status === "generating"}
              onClick={handleGenerate}
            >
              {result.status === "generating" ? "Generating…" : "Generate video"}
            </Button>
          </div>

          <Section title="Result">
            <div className="rounded-tatva-md border border-tatva-border-secondary bg-tatva-surface-primary">
              <VideoResultPanel
                status={result.status}
                videoUrl={result.videoUrl}
                seed={result.seed}
                errorMessage={result.errorMessage}
                queueStatus={result.queueStatus}
                queuePosition={result.queuePosition}
                logs={result.logs}
                onReset={handleReset}
              />
            </div>
          </Section>
        </>
      )}
    </div>
  );
}

interface SectionProps {
  title: string;
  description?: string;
  children: React.ReactNode;
}

function Section({ title, description, children }: SectionProps) {
  return (
    <section className="flex flex-col gap-tatva-12">
      <div className="flex flex-col gap-tatva-2">
        <Text variant="heading-sm">{title}</Text>
        {description && (
          <Text variant="body-sm" tone="secondary">
            {description}
          </Text>
        )}
      </div>
      {children}
    </section>
  );
}

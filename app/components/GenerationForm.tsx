"use client";

import { useCallback, useMemo, useState } from "react";
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
  DEFAULT_FAL_MODEL,
  DEFAULT_INDIC_LANGUAGE,
  DEFAULT_RESOLUTION,
  PROMPT_MAX_CHARS,
  PROMPT_MIN_CHARS,
  type AspectRatio,
  type Duration,
  type FalModelId,
  type IndicLanguageCode,
  type Resolution,
} from "@/lib/constants";
import type {
  GenerationFormState,
  OptimizePromptResponse,
  SeedanceQueueStatus,
  SeedanceVideoOutput,
  SubmitGenerationResponse,
  UploadedAsset,
} from "@/lib/types";
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

const GENERATE_AUDIO_OPTIONS = [
  { value: "no", label: "No" },
  { value: "yes", label: "Yes" },
];

const INITIAL_FORM: GenerationFormState = {
  prompt: "",
  model: DEFAULT_FAL_MODEL,
  resolution: DEFAULT_RESOLUTION,
  aspectRatio: DEFAULT_ASPECT_RATIO,
  duration: DEFAULT_DURATION,
  generateAudio: false,
  seed: "",
  language: DEFAULT_INDIC_LANGUAGE,
  referenceImages: [],
  referenceVideos: [],
  referenceAudios: [],
};

type ResultStatus = "idle" | "generating" | "ready" | "error";

interface ResultState {
  status: ResultStatus;
  videoUrl?: string;
  seed?: number | null;
  errorMessage?: string;
  /** Live FAL queue status while polling. */
  queueStatus?: SeedanceQueueStatus["status"];
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

export function GenerationForm() {
  const [form, setForm] = useState<GenerationFormState>(INITIAL_FORM);
  const [result, setResult] = useState<ResultState>(INITIAL_RESULT);
  const [optimizing, setOptimizing] = useState(false);

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

    setResult({ status: "generating", queueStatus: "IN_QUEUE" });

    const abort = new AbortController();
    try {
      // 1) Submit — returns request_id immediately. Holds the connection
      //    only for the few seconds it takes FAL to acknowledge.
      const { requestId, model } = await fetchJson<SubmitGenerationResponse>(
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
            seed: parsedSeed,
            referenceImageUrls: form.referenceImages.map((a) => a.absoluteUrl),
            referenceVideoUrls: form.referenceVideos.map((a) => a.absoluteUrl),
            referenceAudioUrls: form.referenceAudios.map((a) => a.absoluteUrl),
          }),
        },
      );

      // 2) Poll status — short HTTP round-trips that survive Vercel's
      //    function timeout, give us live queue position + logs, and let
      //    the user navigate away and (eventually) resume.
      const statusUrl = `/api/generation-status?requestId=${encodeURIComponent(requestId)}&model=${encodeURIComponent(model)}`;
      const resultUrl = `/api/generation-result?requestId=${encodeURIComponent(requestId)}&model=${encodeURIComponent(model)}`;

      let attempts = 0;
      while (attempts < POLL_MAX_ATTEMPTS) {
        attempts += 1;
        const status = await fetchJson<SeedanceQueueStatus>(statusUrl);
        setResult((prev) => ({
          ...prev,
          status: "generating",
          queueStatus: status.status,
          queuePosition: status.queuePosition,
          logs: status.logs.slice(-3),
        }));

        if (status.status === "COMPLETED") {
          // 3) Fetch the final result.
          const data = await fetchJson<SeedanceVideoOutput>(resultUrl);
          setResult({
            status: "ready",
            videoUrl: data.videoUrl,
            seed: data.seed,
          });
          toast.success("Video generated.");
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

  const handleReset = useCallback(() => setResult(INITIAL_RESULT), []);

  // The editor returns a fresh public URL when an edit completes.
  // Updating `videoUrl` on the same `result` object lets the user keep
  // iterating — every subsequent edit operates on the most recent
  // version, building up a chain of edits without leaving the panel.
  const handleVideoEdited = useCallback(
    (newUrl: string) =>
      setResult((prev) => ({ ...prev, videoUrl: newUrl, status: "ready" })),
    [],
  );

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
            onValueChange={(v) => setField("model", v as FalModelId)}
          />
          <Select
            label="Indic language (for prompt optimisation)"
            options={LANGUAGE_OPTIONS}
            value={form.language}
            onValueChange={(v) => setField("language", v as IndicLanguageCode)}
            searchable
          />
          <Select
            label="Resolution"
            options={RESOLUTION_OPTIONS}
            value={form.resolution}
            onValueChange={(v) => setField("resolution", v as Resolution)}
          />
          <Select
            label="Aspect ratio"
            options={ASPECT_RATIO_OPTIONS}
            value={form.aspectRatio}
            onValueChange={(v) => setField("aspectRatio", v as AspectRatio)}
          />
          <Select
            label="Duration"
            options={DURATION_OPTIONS}
            value={form.duration}
            onValueChange={(v) => setField("duration", v as Duration)}
          />
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
            generationLanguage={form.language}
            originalPrompt={form.prompt}
            onReset={handleReset}
            onVideoEdited={handleVideoEdited}
          />
        </div>
      </Section>
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

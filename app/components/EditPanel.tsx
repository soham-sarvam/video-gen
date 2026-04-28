"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  Button,
  Select,
  Slider,
  Text,
  Textarea,
  toast,
} from "@sarvam/tatva";
import {
  BULBUL_TEXT_MAX_CHARS,
  BULBUL_VOICES,
  DEFAULT_BULBUL_VOICE,
  DEFAULT_EDIT_AUDIO_MODE,
  DEFAULT_FAL_EDIT_MODEL,
  DEFAULT_INDIC_LANGUAGE,
  EDIT_MAX_SEGMENT_S,
  EDIT_MIN_SEGMENT_S,
  EDIT_PROMPT_MIN_CHARS,
  FAL_EDIT_MODELS,
  INDIC_LANGUAGES,
  PROMPT_MAX_CHARS,
  type BulbulVoice,
  type EditAudioMode,
  type FalEditModelId,
  type IndicLanguageCode,
} from "@/lib/constants";
import type {
  EditVideoFinalizeResponse,
  EditVideoSubmitRequest,
  EditVideoSubmitResponse,
  OptimizePromptResponse,
  SeedanceQueueStatus,
} from "@/lib/types";
import { fetchJson } from "@/app/hooks/useApi";

interface EditPanelProps {
  /** Public URL of the video that's currently in the player. */
  sourceVideoUrl: string;
  /** Total duration of the source video, probed from the <video> element. */
  sourceDurationS: number;
  /**
   * Indic language picked at generation time. Used to (a) bias the
   * edit-prompt optimizer toward the right intonation cues and (b)
   * pre-select the Bulbul language in the audio panel.
   */
  generationLanguage: IndicLanguageCode;
  /**
   * Prompt used at original generation time, if known. Forwarded to
   * Gemini via the editContext so it can preserve stylistic intent
   * across the edit. The test-editor sandbox doesn't have this — pass
   * undefined and Gemini will infer style from the boundary frames.
   */
  originalPrompt?: string;
  /** Called when an edited MP4 is ready — parent swaps the player URL. */
  onVideoEdited: (newUrl: string) => void;
}

interface CapturedFrame {
  /** JPEG bytes as base64 — WITHOUT the `data:image/jpeg;base64,` prefix. */
  base64: string;
  mimeType: "image/jpeg";
}

/**
 * Downscale ceiling for boundary frames. 384px on the longer edge is
 * plenty for Gemini to identify character, framing, lighting, and
 * style; going higher just inflates the JSON body without improving
 * the optimised prompt.
 */
const CAPTURE_MAX_DIM = 384;
const CAPTURE_QUALITY = 0.85;

/**
 * Captures a series of frames from a video URL by mounting a hidden
 * <video> element, seeking sequentially to each timestamp, and
 * rasterising into a canvas. Returns one entry per requested
 * timestamp; entries are null when capture fails (cross-origin
 * canvas taint, decode error, abort).
 *
 * We use one video element for all timestamps (rather than one per)
 * so the bytes are only fetched/decoded once. Cleanup releases the
 * src + triggers a final load() so the browser can free decoder state.
 */
async function captureFramesAt(
  videoUrl: string,
  timesS: readonly number[],
  signal?: AbortSignal,
): Promise<Array<CapturedFrame | null>> {
  if (timesS.length === 0) return [];
  return new Promise((resolve) => {
    const results: Array<CapturedFrame | null> = Array.from(timesS, () => null);
    let idx = 0;

    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.muted = true;
    video.preload = "auto";
    video.playsInline = true;

    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      try {
        video.src = "";
        video.removeAttribute("src");
        video.load();
      } catch {
        // ignore — we're throwing this element away anyway.
      }
      resolve(results);
    };

    if (signal) {
      if (signal.aborted) {
        settle();
        return;
      }
      signal.addEventListener("abort", settle, { once: true });
    }

    video.addEventListener("error", settle, { once: true });

    video.addEventListener(
      "loadedmetadata",
      () => {
        if (settled) return;
        video.currentTime = clampTime(timesS[idx], video.duration);
      },
      { once: true },
    );

    // `seeked` fires once per completed seek; we step through the
    // requested timestamps by advancing `idx` after each capture.
    video.addEventListener("seeked", () => {
      if (settled) return;
      results[idx] = captureCurrentFrame(video);
      idx += 1;
      if (idx >= timesS.length) {
        settle();
        return;
      }
      video.currentTime = clampTime(timesS[idx], video.duration);
    });

    video.src = videoUrl;
  });
}

function clampTime(t: number, duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  // Stay just inside the clip — seeking to exactly `duration` either
  // returns a black frame or never fires `seeked` on some browsers.
  return Math.min(Math.max(t, 0), Math.max(0, duration - 0.05));
}

function captureCurrentFrame(video: HTMLVideoElement): CapturedFrame | null {
  try {
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) return null;
    const ratio = Math.min(1, CAPTURE_MAX_DIM / Math.max(w, h));
    const targetW = Math.max(1, Math.round(w * ratio));
    const targetH = Math.max(1, Math.round(h * ratio));
    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, targetW, targetH);
    const dataUrl = canvas.toDataURL("image/jpeg", CAPTURE_QUALITY);
    const prefix = "data:image/jpeg;base64,";
    if (!dataUrl.startsWith(prefix)) return null;
    return { mimeType: "image/jpeg", base64: dataUrl.slice(prefix.length) };
  } catch {
    // Most likely a SecurityError from a CORS-tainted canvas. The
    // calling code will toast and degrade to text-only optimisation.
    return null;
  }
}

const EDIT_MODEL_OPTIONS = FAL_EDIT_MODELS.map((m) => ({
  value: m.value,
  label: m.label,
  description: m.description,
}));

const AUDIO_MODE_OPTIONS: ReadonlyArray<{
  value: EditAudioMode;
  label: string;
  description: string;
}> = [
  {
    value: "keep_original",
    label: "Keep original audio",
    description:
      "Mux the existing segment's audio over the new video — fastest, lossless audio.",
  },
  {
    value: "bulbul_dialogue",
    label: "Indic dialogue (Bulbul)",
    description:
      "Synthesise Indic dialogue with Sarvam Bulbul v3 in the language and voice of your choice.",
  },
  {
    value: "regenerate_seedance",
    label: "Ambient / SFX (Seedance)",
    description:
      "Let Seedance generate ambient sound and sound effects for the new segment.",
  },
];

const BULBUL_VOICE_OPTIONS = BULBUL_VOICES.map((v) => ({
  value: v.value,
  label: v.label,
}));

const LANGUAGE_OPTIONS = INDIC_LANGUAGES.map((l) => ({
  value: l.value,
  label: l.label,
}));

const POLL_INTERVAL_MS = 2500;
const POLL_MAX_ATTEMPTS = 240;

type EditStatus =
  | "idle"
  | "submitting"
  | "queued"
  | "rendering"
  | "finalizing"
  | "error";

interface EditState {
  status: EditStatus;
  queuePosition?: number | null;
  logs?: string[];
  errorMessage?: string;
}

const INITIAL_STATE: EditState = { status: "idle" };

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

function formatSeconds(value: number): string {
  return `${value.toFixed(1)}s`;
}

function describeStatus(state: EditState): string {
  switch (state.status) {
    case "submitting":
      return "Slicing the video, synthesising audio if needed, and uploading boundary frames…";
    case "queued":
      return state.queuePosition != null
        ? `Waiting in FAL queue — position ${state.queuePosition}.`
        : "Waiting in FAL queue…";
    case "rendering":
      return "Seedance is regenerating the selected segment…";
    case "finalizing":
      return "Stitching the new segment back into your video…";
    case "error":
      return state.errorMessage ?? "Edit failed.";
    default:
      return "";
  }
}

export function EditPanel({
  sourceVideoUrl,
  sourceDurationS,
  generationLanguage,
  originalPrompt,
  onVideoEdited,
}: EditPanelProps) {
  // Default selection: a centred 5s window, clamped to source bounds.
  const initialRange = useMemo<[number, number]>(() => {
    const wantedLength = Math.min(
      EDIT_MAX_SEGMENT_S,
      Math.max(EDIT_MIN_SEGMENT_S, 5),
    );
    const start = Math.max(0, (sourceDurationS - wantedLength) / 2);
    const end = Math.min(sourceDurationS, start + wantedLength);
    return [Number(start.toFixed(1)), Number(end.toFixed(1))];
  }, [sourceDurationS]);

  const [range, setRange] = useState<[number, number]>(initialRange);
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState<FalEditModelId>(DEFAULT_FAL_EDIT_MODEL);

  const [audioMode, setAudioMode] = useState<EditAudioMode>(
    DEFAULT_EDIT_AUDIO_MODE,
  );
  const [bulbulText, setBulbulText] = useState("");
  const [bulbulLanguage, setBulbulLanguage] = useState<IndicLanguageCode>(
    generationLanguage ?? DEFAULT_INDIC_LANGUAGE,
  );
  const [bulbulVoice, setBulbulVoice] = useState<BulbulVoice>(
    DEFAULT_BULBUL_VOICE,
  );

  const [optimizing, setOptimizing] = useState(false);
  const [state, setState] = useState<EditState>(INITIAL_STATE);
  const abortRef = useRef<AbortController | null>(null);

  const [startS, endS] = range;
  const segmentLength = Math.max(0, endS - startS);
  // Seedance only accepts integer durations, so the actual regen
  // length the server uses is the rounded value clamped to [4, 15].
  const effectiveLength = Math.min(
    EDIT_MAX_SEGMENT_S,
    Math.max(EDIT_MIN_SEGMENT_S, Math.round(segmentLength)),
  );
  const lengthValid =
    segmentLength >= EDIT_MIN_SEGMENT_S - 0.5 &&
    segmentLength <= EDIT_MAX_SEGMENT_S + 0.5;
  const promptValid = prompt.trim().length >= EDIT_PROMPT_MIN_CHARS;
  const bulbulValid =
    audioMode !== "bulbul_dialogue" || bulbulText.trim().length > 0;
  const isBusy = state.status !== "idle" && state.status !== "error";
  const canApply = lengthValid && promptValid && bulbulValid && !isBusy;

  // Slider step of 0.1s gives precise control without making the
  // segment-length validator chase floating-point noise.
  const handleRangeChange = useCallback((value: number[]) => {
    if (value.length !== 2) return;
    const [a, b] = value;
    setRange([
      Number(Math.min(a, b).toFixed(1)),
      Number(Math.max(a, b).toFixed(1)),
    ]);
  }, []);

  const handleOptimize = useCallback(async () => {
    if (!prompt.trim()) {
      toast.error("Write your edit idea first.");
      return;
    }
    setOptimizing(true);

    // 1) Capture the segment's first and last frames client-side.
    //    Best-effort — if the canvas is CORS-tainted (cross-origin
    //    URL without ACAO header) or decode fails, we degrade to
    //    text-only optimisation rather than blocking the user.
    let boundaryFrames:
      | { firstFrameBase64: string; lastFrameBase64: string }
      | undefined;
    try {
      const captured = await captureFramesAt(sourceVideoUrl, [
        startS,
        Math.max(startS, endS - 0.05),
      ]);
      const first = captured[0];
      const last = captured[1];
      if (first && last) {
        boundaryFrames = {
          firstFrameBase64: first.base64,
          lastFrameBase64: last.base64,
        };
      } else {
        toast.warning({
          title: "Couldn't capture boundary frames",
          description:
            "Optimising from text only — Gemini won't see the segment. Likely a cross-origin video without CORS headers.",
        });
      }
    } catch {
      // Swallow — we'll proceed text-only.
    }

    // 2) Always send editContext when we're inside the editor — even
    //    if both fields are empty. That routes Gemini to the edit-mode
    //    system instruction (no @-references, anchor-aware language)
    //    instead of the generation-mode prompt-engineering rules.
    const editContext: {
      originalPrompt?: string;
      boundaryFrames?: { firstFrameBase64: string; lastFrameBase64: string };
    } = {};
    if (originalPrompt && originalPrompt.trim().length > 0) {
      editContext.originalPrompt = originalPrompt.trim();
    }
    if (boundaryFrames) {
      editContext.boundaryFrames = boundaryFrames;
    }

    try {
      const data = await fetchJson<OptimizePromptResponse>(
        "/api/optimize-prompt",
        {
          method: "POST",
          body: JSON.stringify({
            rawPrompt: prompt,
            language: generationLanguage,
            duration: effectiveLength.toString(),
            referenceImages: [],
            referenceVideos: [],
            referenceAudios: [],
            editContext,
          }),
        },
      );
      setPrompt(data.optimizedPrompt);
      if (data.warnings.length > 0) {
        toast.warning({
          title: "Optimised, but with warnings",
          description: data.warnings.join(" · "),
        });
      } else {
        toast.success(
          boundaryFrames
            ? "Optimised with vision context — Gemini saw the segment."
            : "Edit prompt optimised (text only).",
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Optimisation failed.";
      toast.error(msg);
    } finally {
      setOptimizing(false);
    }
  }, [
    prompt,
    effectiveLength,
    generationLanguage,
    sourceVideoUrl,
    startS,
    endS,
    originalPrompt,
  ]);

  const handleApply = useCallback(async () => {
    if (!canApply) return;
    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;

    setState({ status: "submitting" });

    try {
      // 1) Submit. The server slices, optionally synthesises Bulbul
      //    audio, extracts frames, uploads them to FAL, and submits
      //    the Seedance edit job. Returns the job ids needed to drive
      //    the rest of the flow.
      const submitBody: EditVideoSubmitRequest = {
        sourceVideoUrl,
        segmentStartS: startS,
        segmentEndS: endS,
        prompt,
        model,
        audioMode,
        ...(audioMode === "bulbul_dialogue"
          ? {
              bulbulText: bulbulText.trim(),
              bulbulLanguage,
              bulbulVoice,
            }
          : {}),
      };
      const submitRes = await fetchJson<EditVideoSubmitResponse>(
        "/api/edit-video/submit",
        {
          method: "POST",
          body: JSON.stringify(submitBody),
        },
      );

      // 2) Poll the existing /generation-status route — same shape,
      //    same polling cadence as the main generation flow.
      const statusUrl = `/api/generation-status?requestId=${encodeURIComponent(submitRes.requestId)}&model=${encodeURIComponent(submitRes.model)}`;

      let attempts = 0;
      while (attempts < POLL_MAX_ATTEMPTS) {
        attempts += 1;
        const status = await fetchJson<SeedanceQueueStatus>(statusUrl);
        setState({
          status: status.status === "IN_QUEUE" ? "queued" : "rendering",
          queuePosition: status.queuePosition,
          logs: status.logs.slice(-3),
        });
        if (status.status === "COMPLETED") break;
        await delay(POLL_INTERVAL_MS, abort.signal);
      }
      if (attempts >= POLL_MAX_ATTEMPTS) {
        throw new Error("Edit timed out after 10 minutes.");
      }

      // 3) Finalize — server downloads the new segment, normalises
      //    dims if needed, muxes the right audio, concats pre+new+post.
      setState({ status: "finalizing" });
      const finalRes = await fetchJson<EditVideoFinalizeResponse>(
        "/api/edit-video/finalize",
        {
          method: "POST",
          body: JSON.stringify({ editJobId: submitRes.editJobId }),
        },
      );

      onVideoEdited(finalRes.videoUrl);
      setState(INITIAL_STATE);
      toast.success("Edit applied.");
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      const msg = err instanceof Error ? err.message : "Edit failed.";
      setState({ status: "error", errorMessage: msg });
      toast.error(msg);
    }
  }, [
    canApply,
    sourceVideoUrl,
    startS,
    endS,
    prompt,
    model,
    audioMode,
    bulbulText,
    bulbulLanguage,
    bulbulVoice,
    onVideoEdited,
  ]);

  const audioModeDescription =
    AUDIO_MODE_OPTIONS.find((o) => o.value === audioMode)?.description;

  return (
    <div className="flex flex-col gap-tatva-12">
      <div className="flex flex-col gap-tatva-4">
        <Text variant="heading-sm">Edit a segment of this video</Text>
        <Text variant="body-sm" tone="secondary">
          Drag the handles to choose a {EDIT_MIN_SEGMENT_S}–{EDIT_MAX_SEGMENT_S} second segment, describe the change, and Seedance will regenerate just that portion. The unchanged parts before and after are stitched back in losslessly.
        </Text>
      </div>

      <div className="flex flex-col gap-tatva-8">
        <div className="flex items-center justify-between">
          <Text variant="label-md">Segment</Text>
          <Text
            variant="label-sm"
            tone={lengthValid ? "secondary" : "danger"}
          >
            {formatSeconds(startS)} → {formatSeconds(endS)} ·{" "}
            {formatSeconds(segmentLength)}
            {!lengthValid &&
              ` (must be ${EDIT_MIN_SEGMENT_S}–${EDIT_MAX_SEGMENT_S}s)`}
            {lengthValid &&
              segmentLength !== effectiveLength &&
              ` · regen as ${effectiveLength}s`}
          </Text>
        </div>
        <Slider
          min={0}
          max={Number(sourceDurationS.toFixed(1))}
          step={0.1}
          value={range}
          onValueChange={handleRangeChange}
          disabled={isBusy}
        />
      </div>

      <div className="grid grid-cols-1 gap-tatva-12 md:grid-cols-2">
        <Select
          label="Edit model"
          options={EDIT_MODEL_OPTIONS}
          value={model}
          onValueChange={(v) => setModel(v as FalEditModelId)}
          disabled={isBusy}
        />
        <Select
          label="Audio for the new segment"
          options={AUDIO_MODE_OPTIONS.map((o) => ({
            value: o.value,
            label: o.label,
            description: o.description,
          }))}
          value={audioMode}
          onValueChange={(v) => setAudioMode(v as EditAudioMode)}
          disabled={isBusy}
        />
      </div>
      {audioModeDescription && (
        <Text variant="body-xs" tone="tertiary">
          {audioModeDescription}
        </Text>
      )}

      {audioMode === "bulbul_dialogue" && (
        <div className="flex flex-col gap-tatva-8 rounded-tatva-md border border-tatva-border-secondary bg-tatva-surface-primary p-tatva-12">
          <Text variant="label-md">Indic dialogue (Bulbul v3)</Text>
          <div className="grid grid-cols-1 gap-tatva-8 md:grid-cols-2">
            <Select
              label="Language"
              options={LANGUAGE_OPTIONS}
              value={bulbulLanguage}
              onValueChange={(v) => setBulbulLanguage(v as IndicLanguageCode)}
              searchable
              disabled={isBusy}
            />
            <Select
              label="Voice"
              options={BULBUL_VOICE_OPTIONS}
              value={bulbulVoice}
              onValueChange={(v) => setBulbulVoice(v as BulbulVoice)}
              disabled={isBusy}
            />
          </div>
          <Textarea
            label="Dialogue text"
            placeholder="नमस्ते दोस्तों, आज हम सीखेंगे…"
            value={bulbulText}
            onChange={(e) => setBulbulText(e.target.value)}
            rows={3}
            helperText={`${bulbulText.length} / ${BULBUL_TEXT_MAX_CHARS} · audio is clipped to the segment length on mux`}
            maxLength={BULBUL_TEXT_MAX_CHARS}
            disabled={isBusy}
          />
        </div>
      )}

      <Textarea
        label="Edit prompt"
        placeholder="Replace the storyteller's saffron shawl with a deep indigo one; keep the same warm oil-lamp glow and the gentle dolly-in."
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={5}
        helperText={`${prompt.length} / ${PROMPT_MAX_CHARS}`}
        maxLength={PROMPT_MAX_CHARS}
        disabled={isBusy}
      />
      <div className="flex justify-end">
        <Button
          variant="secondary"
          icon="ai-magic"
          isLoading={optimizing}
          onClick={handleOptimize}
          disabled={optimizing || isBusy}
        >
          {optimizing ? "Optimising…" : "Optimise edit prompt"}
        </Button>
      </div>

      {state.status !== "idle" && (
        <div className="rounded-tatva-md border border-tatva-border-secondary bg-tatva-surface-primary p-tatva-8">
          <Text
            variant="body-sm"
            tone={state.status === "error" ? "danger" : "secondary"}
          >
            {describeStatus(state)}
          </Text>
          {state.logs && state.logs.length > 0 && (
            <div className="mt-tatva-2 flex flex-col gap-tatva-2">
              {state.logs.map((line, idx) => (
                <Text
                  key={`${idx}-${line.slice(0, 12)}`}
                  variant="body-xs"
                  tone="tertiary"
                >
                  {line}
                </Text>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex justify-end gap-tatva-8 border-t border-tatva-border-secondary pt-tatva-8">
        <Button
          variant="primary"
          size="lg"
          icon="play"
          isLoading={isBusy}
          disabled={!canApply}
          onClick={handleApply}
        >
          {isBusy ? "Applying edit…" : "Apply edit"}
        </Button>
      </div>
    </div>
  );
}

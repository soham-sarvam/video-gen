"use client";

import { useCallback, useState } from "react";
import { Button, EmptyState, Skeleton, Text } from "@sarvam/tatva";
import type { IndicLanguageCode } from "@/lib/constants";
import type { SeedanceQueueState } from "@/lib/types";
import { EditPanel } from "./EditPanel";

interface VideoResultPanelProps {
  status: "idle" | "generating" | "ready" | "error";
  videoUrl?: string;
  seed?: number | null;
  errorMessage?: string;
  /** Live FAL queue status while polling. */
  queueStatus?: SeedanceQueueState;
  queuePosition?: number | null;
  /** Last few log lines from FAL. */
  logs?: string[];
  /**
   * Indic language picked at generation time. Forwarded to the editor
   * so the prompt-optimiser and Bulbul TTS use the right language by
   * default (instead of falling back to Hindi for every clip).
   */
  generationLanguage: IndicLanguageCode;
  /**
   * Original prompt used to generate this video, if known. Forwarded
   * to the editor so Gemini can preserve stylistic intent across the
   * edit. The test-editor sandbox loads pre-existing videos with no
   * known original prompt — pass undefined.
   */
  originalPrompt?: string;
  onReset: () => void;
  /**
   * Called when an edit completes — the parent updates the displayed
   * video URL so the player swaps to the edited MP4 and the next edit
   * iterates on the new version.
   */
  onVideoEdited: (newUrl: string) => void;
}

function describeQueueStatus(
  state: SeedanceQueueState | undefined,
  position: number | null | undefined,
): string {
  if (!state) return "Submitting to FAL queue…";
  if (state === "IN_QUEUE") {
    return position != null
      ? `Waiting in FAL queue — position ${position}.`
      : "Waiting in FAL queue…";
  }
  if (state === "IN_PROGRESS") return "Seedance is rendering your video…";
  if (state === "COMPLETED") return "Finalising result…";
  return `Queue status: ${state}`;
}

export function VideoResultPanel({
  status,
  videoUrl,
  seed,
  errorMessage,
  queueStatus,
  queuePosition,
  logs,
  generationLanguage,
  originalPrompt,
  onReset,
  onVideoEdited,
}: VideoResultPanelProps) {
  // The editor needs the source duration to set the slider's max. We
  // probe it from the rendered <video> element on metadata load — that's
  // the same value the user sees in the player's scrubber.
  const [duration, setDuration] = useState<number | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);

  const handleLoadedMetadata = useCallback(
    (e: React.SyntheticEvent<HTMLVideoElement>) => {
      const value = e.currentTarget.duration;
      if (Number.isFinite(value) && value > 0) setDuration(value);
    },
    [],
  );

  // Each new edit creates a fresh `videoUrl`; resetting the duration
  // forces a re-probe against the new clip.
  const handleEdited = useCallback(
    (url: string) => {
      setDuration(null);
      onVideoEdited(url);
    },
    [onVideoEdited],
  );

  if (status === "idle") {
    return (
      <div className="flex h-full items-center justify-center p-tatva-24">
        <EmptyState
          heading="No video yet"
          body="Upload references, write your prompt, and hit Generate to see the output here."
        />
      </div>
    );
  }

  if (status === "generating") {
    return (
      <div className="flex h-full flex-col gap-tatva-12 p-tatva-24">
        <Text variant="heading-sm">Generating your video…</Text>
        <Text variant="body-sm" tone="secondary">
          {describeQueueStatus(queueStatus, queuePosition)}
        </Text>
        <Text variant="body-sm" tone="tertiary">
          Seedance Standard typically takes 2–4 minutes; Fast finishes in
          30–60 seconds. You can leave this tab open and we&apos;ll keep
          polling.
        </Text>
        <Skeleton width="100%" height={360} />
        {logs && logs.length > 0 && (
          <div className="flex flex-col gap-tatva-2 rounded-tatva-md border border-tatva-border-secondary bg-tatva-surface-primary p-tatva-8">
            <Text variant="label-sm" tone="tertiary">
              Latest log lines
            </Text>
            {logs.map((line, idx) => (
              <Text
                key={`${idx}-${line.slice(0, 12)}`}
                variant="body-xs"
                tone="secondary"
              >
                {line}
              </Text>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex h-full items-center justify-center p-tatva-24">
        <EmptyState
          heading="Generation failed"
          body={errorMessage ?? "Something went wrong. Try again."}
          actions={[{ children: "Reset", variant: "primary", onClick: onReset }]}
        />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-tatva-12 p-tatva-24">
      <div className="flex items-center justify-between">
        <Text variant="heading-sm">Generated video</Text>
        <Button variant="ghost" size="sm" onClick={onReset}>
          New generation
        </Button>
      </div>
      {videoUrl && (
        <video
          // Re-key on URL so React rebuilds the <video> element when
          // the user finalises an edit — the loadedmetadata event then
          // re-fires, populating `duration` against the new clip.
          key={videoUrl}
          src={videoUrl}
          controls
          onLoadedMetadata={handleLoadedMetadata}
          className="w-full rounded-tatva-md shadow-tatva-l1"
        />
      )}
      <div className="flex flex-wrap items-center gap-tatva-12">
        {typeof seed === "number" && (
          <Text variant="body-sm" tone="secondary">
            Seed: {seed}
          </Text>
        )}
        {videoUrl && (
          <a
            href={videoUrl}
            target="_blank"
            rel="noopener noreferrer"
            download
          >
            <Button variant="secondary" size="sm" icon="download">
              Download MP4
            </Button>
          </a>
        )}
        {videoUrl && (
          <Button
            variant={editorOpen ? "secondary" : "primary"}
            size="sm"
            icon={editorOpen ? "close" : "edit"}
            onClick={() => setEditorOpen((v) => !v)}
            disabled={duration === null}
          >
            {editorOpen ? "Close editor" : "Edit this video"}
          </Button>
        )}
      </div>
      {editorOpen && videoUrl && duration !== null && (
        <div className="rounded-tatva-md border border-tatva-border-secondary bg-tatva-surface-primary p-tatva-12">
          <EditPanel
            sourceVideoUrl={videoUrl}
            sourceDurationS={duration}
            generationLanguage={generationLanguage}
            originalPrompt={originalPrompt}
            onVideoEdited={handleEdited}
          />
        </div>
      )}
    </div>
  );
}

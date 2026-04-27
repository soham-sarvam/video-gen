"use client";

import { Button, EmptyState, Skeleton, Text } from "@sarvam/tatva";
import type { TaskStatus } from "@/lib/providers/types";

interface VideoResultPanelProps {
  status: "idle" | "generating" | "ready" | "error";
  videoUrl?: string;
  seed?: number | null;
  errorMessage?: string;
  /** Live provider task status while polling. */
  queueStatus?: TaskStatus;
  queuePosition?: number | null;
  /** Last few log lines from the provider. */
  logs?: string[];
  onReset: () => void;
}

function describeQueueStatus(
  state: TaskStatus | undefined,
  position: number | null | undefined,
): string {
  if (!state) return "Submitting job to provider…";
  if (state === "queued") {
    return position != null
      ? `Waiting in queue — position ${position}.`
      : "Waiting in provider queue…";
  }
  if (state === "running") return "Seedance is rendering your video…";
  if (state === "completed") return "Finalising result…";
  if (state === "failed") return "Generation failed.";
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
  onReset,
}: VideoResultPanelProps) {
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
          src={videoUrl}
          controls
          className="w-full rounded-tatva-md shadow-tatva-l1"
        />
      )}
      <div className="flex items-center gap-tatva-12">
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
      </div>
    </div>
  );
}

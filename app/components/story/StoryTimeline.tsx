"use client";

import { useState } from "react";
import { Button, EmptyState, Text, toast } from "@sarvam/tatva";
import type { StoryRun } from "@/lib/story/types";
import { fetchJson } from "@/app/hooks/useApi";
import { BeatProgressCard } from "./BeatProgressCard";

interface StoryTimelineProps {
  run: StoryRun | null;
  onRunUpdate?: (run: StoryRun) => void;
  onRerollBeat: (index: number) => void;
  onReset: () => void;
}

export function StoryTimeline({
  run,
  onRunUpdate,
  onRerollBeat,
  onReset,
}: StoryTimelineProps) {
  const [stitching, setStitching] = useState(false);

  if (!run) {
    return (
      <div className="flex h-full items-center justify-center p-tatva-24">
        <EmptyState
          heading="No story yet"
          body="Plan and approve an outline above to start generating."
        />
      </div>
    );
  }

  const completedCount = run.beats.filter((b) => b.status === "completed").length;
  const failedCount = run.beats.filter((b) => b.status === "failed").length;
  const allSettled = run.beats.every((b) => b.status === "completed" || b.status === "failed");
  const allDone = run.beats.every((b) => b.status === "completed");
  const canStitch =
    allSettled &&
    completedCount > 0 &&
    run.stitchStatus !== "completed" &&
    run.stitchStatus !== "stitching";
  const isStitched = run.stitchStatus === "completed" && !!run.finalLocalUrl;

  const handleManualStitch = async () => {
    if (!canStitch) return;
    setStitching(true);
    try {
      const provider = run.beats[0]?.taskId ? "kie" : "fal";
      const updated = await fetchJson<StoryRun>(
        `/api/story/result?storyId=${encodeURIComponent(run.storyId)}&provider=${provider}`,
      );
      onRunUpdate?.(updated);
      toast.success("Video stitched successfully.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Stitching failed.");
    } finally {
      setStitching(false);
    }
  };

  return (
    <div className="flex h-full flex-col gap-tatva-12 p-tatva-24">
      <div className="flex items-center justify-between">
        <Text variant="heading-sm">
          {`Story · ${run.beats.length} beats · ${run.totalDurationSeconds}s · ${run.mode}`}
        </Text>
        <div className="flex items-center gap-tatva-4">
          <Button
            variant="secondary"
            size="sm"
            disabled={!canStitch || stitching}
            isLoading={stitching}
            onClick={handleManualStitch}
          >
            {isStitched
              ? "Stitched"
              : stitching
                ? "Stitching…"
                : "Stitch video"}
          </Button>
          <Button variant="ghost" size="sm" onClick={onReset}>
            New story
          </Button>
        </div>
      </div>
      {isStitched ? (
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <video
          src={run.finalLocalUrl}
          controls
          className="w-full rounded-tatva-md shadow-tatva-l1"
        />
      ) : (
        <div className="flex flex-col gap-tatva-4">
          <Text variant="body-sm" tone="secondary">
            {run.stitchStatus === "stitching"
              ? "Stitching final video…"
              : run.stitchStatus === "failed"
                ? "Stitching failed. Use the button above to retry."
                : `Beats progress: ${run.beats.filter((b) => b.status === "completed").length}/${run.beats.length}`}
          </Text>
          {canStitch && failedCount === 0 && (
            <Text variant="body-xs" tone="tertiary">
              All beats are ready. Click "Stitch video" to combine them.
            </Text>
          )}
          {canStitch && failedCount > 0 && (
            <Text variant="body-xs" tone="tertiary">
              {`${completedCount}/${run.beats.length} beats completed (${failedCount} failed). You can still stitch the successful beats.`}
            </Text>
          )}
        </div>
      )}
      <div className="grid grid-cols-1 gap-tatva-8 md:grid-cols-2 lg:grid-cols-4">
        {run.beats.map((b) => (
          <BeatProgressCard
            key={b.index}
            beat={b}
            onReroll={() => onRerollBeat(b.index)}
          />
        ))}
      </div>
      {(run.characterProfiles?.length ?? 0) > 0 ? (
        <div className="flex flex-col gap-tatva-8">
          <Text variant="label-md">
            Character Sheets ({run.characterProfiles!.length})
          </Text>
          <div className="grid grid-cols-1 gap-tatva-8 md:grid-cols-2 lg:grid-cols-3">
            {run.characterProfiles!.map((cp) => (
              <div
                key={cp.id}
                className="flex flex-col gap-tatva-2 rounded-tatva-md border border-tatva-border-secondary p-tatva-4 shadow-tatva-l1"
              >
                <Text variant="label-sm">{cp.name}</Text>
                <Text variant="body-xs" tone="tertiary" lineClamp={3}>
                  {cp.description}
                </Text>
                {cp.sheetUrl && (
                  <img
                    src={cp.sheetUrl}
                    alt={`Reference sheet for ${cp.name}`}
                    className="mt-tatva-2 w-full rounded-tatva-sm"
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      ) : run.characterSheetUrl ? (
        <div className="flex flex-col gap-tatva-4">
          <Text variant="label-md">Character Sheet</Text>
          <img
            src={run.characterSheetUrl}
            alt="Character reference sheet"
            className="w-full max-w-md rounded-tatva-md border border-tatva-border-secondary shadow-tatva-l1"
          />
        </div>
      ) : null}
    </div>
  );
}

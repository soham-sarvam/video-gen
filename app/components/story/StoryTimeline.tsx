"use client";

import { Button, EmptyState, Text } from "@sarvam/tatva";
import type { StoryRun } from "@/lib/story/types";
import { BeatProgressCard } from "./BeatProgressCard";

interface StoryTimelineProps {
  run: StoryRun | null;
  onRerollBeat: (index: number) => void;
  onReset: () => void;
}

export function StoryTimeline({ run, onRerollBeat, onReset }: StoryTimelineProps) {
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
  return (
    <div className="flex h-full flex-col gap-tatva-12 p-tatva-24">
      <div className="flex items-center justify-between">
        <Text variant="heading-sm">
          {`Story · ${run.beats.length} beats · ${run.totalDurationSeconds}s · ${run.mode}`}
        </Text>
        <Button variant="ghost" size="sm" onClick={onReset}>
          New story
        </Button>
      </div>
      {run.finalLocalUrl ? (
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <video
          src={run.finalLocalUrl}
          controls
          className="w-full rounded-tatva-md shadow-tatva-l1"
        />
      ) : (
        <Text variant="body-sm" tone="secondary">
          {run.stitchStatus === "stitching"
            ? "Stitching final video…"
            : `Beats progress: ${run.beats.filter((b) => b.status === "completed").length}/${run.beats.length}`}
        </Text>
      )}
      <div className="grid grid-cols-1 gap-tatva-8 md:grid-cols-2 lg:grid-cols-4">
        {run.beats.map((b) => (
          <BeatProgressCard key={b.index} beat={b} onReroll={() => onRerollBeat(b.index)} />
        ))}
      </div>
    </div>
  );
}

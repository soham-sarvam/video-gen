"use client";

import { Button, Skeleton, Text } from "@sarvam/tatva";
import type { BeatRun } from "@/lib/story/types";

interface BeatProgressCardProps {
  beat: BeatRun;
  onReroll: () => void;
}

export function BeatProgressCard({ beat, onReroll }: BeatProgressCardProps) {
  return (
    <div className="flex flex-col gap-tatva-4 rounded-tatva-md border border-tatva-border-secondary bg-tatva-surface-secondary p-tatva-8">
      <Text variant="label-sm">
        {`Beat ${beat.index} · ${beat.durationSeconds}s · ${beat.tier}`}
      </Text>
      {beat.status === "queued" && <Skeleton width="100%" height={120} />}
      {beat.status === "running" && <Skeleton width="100%" height={120} />}
      {beat.status === "completed" && beat.localUrl && (
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <video src={beat.localUrl} controls className="w-full rounded-tatva-sm" />
      )}
      {beat.status === "failed" && (
        <div className="flex flex-col gap-tatva-2">
          <Text variant="body-sm" tone="danger">
            Failed
          </Text>
          {beat.failureMessage && (
            <Text variant="body-xs" tone="tertiary" lineClamp={3}>
              {beat.failureMessage}
            </Text>
          )}
        </div>
      )}
      <div className="flex items-center justify-between">
        <Text variant="body-xs" tone="tertiary">
          {beat.oneLineSummary}
        </Text>
        <Button variant="ghost" size="sm" onClick={onReroll} disabled={beat.status === "running"}>
          Re-roll
        </Button>
      </div>
    </div>
  );
}

"use client";

import { Button, Text } from "@sarvam/tatva";
import type { StoryOutline } from "@/lib/story/types";
import { BeatOutlineRow } from "./BeatOutlineRow";

interface OutlineReviewerProps {
  outline: StoryOutline;
  onOutlineChange: (next: StoryOutline) => void;
  onRegenerate: () => void;
  onApprove: () => void;
  isGenerating: boolean;
}

export function OutlineReviewer({
  outline,
  onOutlineChange,
  onRegenerate,
  onApprove,
  isGenerating,
}: OutlineReviewerProps) {
  const total = outline.beats.reduce((acc, b) => acc + b.durationSeconds, 0);
  return (
    <div className="flex flex-col gap-tatva-12">
      <div className="flex items-center justify-between">
        <Text variant="heading-sm">
          Story outline ({outline.beats.length} beats · {total}s)
        </Text>
        <div className="flex items-center gap-tatva-8">
          <Button variant="secondary" size="sm" onClick={onRegenerate}>
            Regenerate plan
          </Button>
          <Button
            variant="primary"
            size="sm"
            isLoading={isGenerating}
            disabled={isGenerating}
            onClick={onApprove}
          >
            {`Generate ${outline.beats.length} clips`}
          </Button>
        </div>
      </div>
      <div className="flex flex-col gap-tatva-8">
        {outline.beats.map((beat, i) => (
          <BeatOutlineRow
            key={beat.index}
            beat={beat}
            onChange={(next) => {
              const beats = outline.beats.slice();
              beats[i] = next;
              onOutlineChange({ ...outline, beats });
            }}
          />
        ))}
      </div>
    </div>
  );
}

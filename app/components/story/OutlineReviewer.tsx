"use client";

import { Button, Skeleton, Text } from "@sarvam/tatva";
import type { StoryOutline } from "@/lib/story/types";
import type { UploadedAsset } from "@/lib/types";
import { BeatOutlineRow } from "./BeatOutlineRow";

export type CharacterSheetStatus =
  | { state: "idle" }
  | { state: "loading" }
  | {
      state: "ready";
      source: "user-images" | "video-first-frame" | "text-imagined";
      asset: UploadedAsset | null;
    }
  | { state: "error"; message: string };

interface OutlineReviewerProps {
  outline: StoryOutline;
  onOutlineChange: (next: StoryOutline) => void;
  onRegenerate: () => void;
  onApprove: () => void;
  isGenerating: boolean;
  characterSheet: CharacterSheetStatus;
  onRegenerateCharacterSheet?: () => void;
}

export function OutlineReviewer({
  outline,
  onOutlineChange,
  onRegenerate,
  onApprove,
  isGenerating,
  characterSheet,
  onRegenerateCharacterSheet,
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
            disabled={isGenerating || characterSheet.state === "loading"}
            onClick={onApprove}
          >
            {`Generate ${outline.beats.length} clips`}
          </Button>
        </div>
      </div>
      <CharacterSheetPanel
        status={characterSheet}
        onRegenerate={onRegenerateCharacterSheet}
      />
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

interface CharacterSheetPanelProps {
  status: CharacterSheetStatus;
  onRegenerate?: () => void;
}

function CharacterSheetPanel({ status, onRegenerate }: CharacterSheetPanelProps) {
  if (status.state === "idle") return null;

  return (
    <div className="rounded-tatva-md border border-tatva-border-secondary bg-tatva-surface-primary p-tatva-12">
      <div className="flex items-center justify-between pb-tatva-8">
        <div className="flex flex-col gap-tatva-1">
          <Text variant="label-md">Character sheet</Text>
          <Text variant="body-sm" tone="secondary">
            {captionFor(status)}
          </Text>
        </div>
        {status.state === "ready" && onRegenerate && (
          <Button variant="secondary" size="sm" onClick={onRegenerate}>
            Regenerate sheet
          </Button>
        )}
      </div>
      {status.state === "loading" && (
        <div className="aspect-[16/9] w-full">
          <Skeleton className="h-full w-full" />
        </div>
      )}
      {status.state === "ready" && status.asset && (
        <img
          src={status.asset.localPreviewUrl ?? status.asset.publicUrl}
          alt="Generated character reference sheet"
          className="w-full rounded-tatva-sm"
        />
      )}
      {status.state === "error" && (
        <div className="flex items-center justify-between gap-tatva-8">
          <Text variant="body-sm" tone="danger">
            {status.message}
          </Text>
          {onRegenerate && (
            <Button variant="secondary" size="sm" onClick={onRegenerate}>
              Retry
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function captionFor(status: CharacterSheetStatus): string {
  if (status.state === "loading") {
    return "Building a turnaround sheet to lock identity across every shot…";
  }
  if (status.state === "error") {
    return "Sheet generation failed. The run will proceed without one.";
  }
  if (status.state === "ready") {
    if (status.source === "user-images") {
      return "Using your uploaded reference images for character consistency.";
    }
    if (status.source === "video-first-frame") {
      return "Generated from the first frame of your reference video.";
    }
    return "Imagined from the script — no reference media was provided.";
  }
  return "";
}

"use client";

import { Button, Input, Select, Switch, Text, Textarea } from "@sarvam/tatva";
import type { BeatOutline } from "@/lib/story/types";

interface BeatOutlineRowProps {
  beat: BeatOutline;
  onChange: (next: BeatOutline) => void;
  onRemove?: () => void;
}

const SHOT_TYPES = [
  { value: "wide", label: "Wide" },
  { value: "medium", label: "Medium" },
  { value: "closeup", label: "Close-up" },
  { value: "extreme_closeup", label: "Extreme close-up" },
  { value: "insert", label: "Insert" },
  { value: "over_the_shoulder", label: "Over the shoulder" },
];

const ROLES = [
  { value: "opener", label: "Opener (fresh refs)" },
  { value: "continuation", label: "Continuation (chain off prev)" },
];

export function BeatOutlineRow({ beat, onChange, onRemove }: BeatOutlineRowProps) {
  return (
    <div className="flex flex-col gap-tatva-8 rounded-tatva-md border border-tatva-border-secondary bg-tatva-surface-secondary p-tatva-12">
      <div className="flex items-center justify-between">
        <Text variant="label-md">Beat {beat.index}</Text>
        {onRemove && (
          <Button variant="ghost" size="sm" onClick={onRemove}>
            Remove
          </Button>
        )}
      </div>
      <div className="grid grid-cols-1 gap-tatva-8 md:grid-cols-3">
        <Input
          label="Duration (s)"
          type="number"
          value={String(beat.durationSeconds)}
          onChange={(e) => onChange({ ...beat, durationSeconds: Number(e.target.value) })}
        />
        <Select
          label="Shot type"
          options={SHOT_TYPES}
          value={beat.shotType}
          onValueChange={(v) => onChange({ ...beat, shotType: v as BeatOutline["shotType"] })}
        />
        <Select
          label="Role"
          options={ROLES}
          value={beat.role}
          onValueChange={(v) => onChange({ ...beat, role: v as "opener" | "continuation" })}
        />
      </div>
      <Textarea
        label="One-line summary"
        value={beat.oneLineSummary}
        onChange={(e) => onChange({ ...beat, oneLineSummary: e.target.value })}
        rows={2}
      />
      <div className="flex items-center justify-between">
        <Text as="label" variant="label-sm">
          Has dialogue
        </Text>
        <Switch
          checked={beat.hasDialogue}
          onCheckedChange={(checked) => onChange({ ...beat, hasDialogue: checked })}
        />
      </div>
      {beat.hasDialogue && beat.dialogue && (
        <Textarea
          label={`Dialogue (${beat.dialogue.languageCode}, ${beat.dialogue.speaker})`}
          value={beat.dialogue.text}
          onChange={(e) =>
            onChange({
              ...beat,
              dialogue: { ...beat.dialogue!, text: e.target.value },
            })
          }
          rows={2}
          helperText="Must end on terminal punctuation (. ! ? ।) — cuts land at sentence boundaries."
        />
      )}
    </div>
  );
}

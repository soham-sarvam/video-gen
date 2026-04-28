"use client";

import React from "react";
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

const BEAT_TYPES = [
  { value: "establishing", label: "Establishing" },
  { value: "dialogue", label: "Dialogue" },
  { value: "b-roll", label: "B-Roll" },
  { value: "action", label: "Action" },
  { value: "transition", label: "Transition" },
  { value: "montage", label: "Montage" },
  { value: "reaction", label: "Reaction" },
  { value: "cutaway", label: "Cutaway" },
];

const ROLES = [
  { value: "opener", label: "Opener (fresh refs)" },
  { value: "continuation", label: "Continuation (chain off prev)" },
];

const BEAT_TYPE_COLORS: Record<string, string> = {
  establishing: "bg-blue-100 text-blue-800",
  dialogue: "bg-amber-100 text-amber-800",
  "b-roll": "bg-emerald-100 text-emerald-800",
  action: "bg-red-100 text-red-800",
  transition: "bg-purple-100 text-purple-800",
  montage: "bg-pink-100 text-pink-800",
  reaction: "bg-cyan-100 text-cyan-800",
  cutaway: "bg-orange-100 text-orange-800",
};

export function BeatOutlineRow({ beat, onChange, onRemove }: BeatOutlineRowProps) {
  const [expanded, setExpanded] = React.useState(false);
  const badgeClass = BEAT_TYPE_COLORS[beat.beatType] ?? "bg-gray-100 text-gray-800";

  return (
    <div className="flex flex-col gap-tatva-8 rounded-tatva-md border border-tatva-border-secondary bg-tatva-surface-secondary p-tatva-12">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-tatva-8">
          <Text variant="label-md">Beat {beat.index}</Text>
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badgeClass}`}>
            {beat.beatType}
          </span>
          <Text variant="body-sm" tone="secondary">
            {beat.durationSeconds}s · {beat.shotType}
          </Text>
        </div>
        <div className="flex items-center gap-tatva-4">
          <Button variant="ghost" size="sm" onClick={() => setExpanded((e) => !e)}>
            {expanded ? "Collapse" : "Edit"}
          </Button>
          {onRemove && (
            <Button variant="ghost" size="sm" onClick={onRemove}>
              Remove
            </Button>
          )}
        </div>
      </div>

      <Text variant="body-sm">{beat.oneLineSummary}</Text>

      {!expanded && beat.sceneDescription && (
        <Text variant="body-sm" tone="secondary" lineClamp={2}>
          {beat.sceneDescription}
        </Text>
      )}

      {expanded && (
        <>
          <div className="grid grid-cols-1 gap-tatva-8 md:grid-cols-4">
            <Input
              label="Duration (s)"
              type="number"
              value={String(beat.durationSeconds)}
              onChange={(e) => onChange({ ...beat, durationSeconds: Number(e.target.value) })}
            />
            <Select
              label="Beat type"
              options={BEAT_TYPES}
              value={beat.beatType}
              onValueChange={(v) => onChange({ ...beat, beatType: v as BeatOutline["beatType"] })}
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
          <Textarea
            label="Scene description"
            value={beat.sceneDescription}
            onChange={(e) => onChange({ ...beat, sceneDescription: e.target.value })}
            rows={3}
            helperText="Environment, props, colors, textures — be maximally specific."
          />
          <Textarea
            label="Camera direction"
            value={beat.cameraDirection}
            onChange={(e) => onChange({ ...beat, cameraDirection: e.target.value })}
            rows={2}
            helperText="Shot size, camera move, speed, angle, lens, focus."
          />
          <div className="grid grid-cols-1 gap-tatva-8 md:grid-cols-2">
            <Textarea
              label="Lighting notes"
              value={beat.lightingNotes}
              onChange={(e) => onChange({ ...beat, lightingNotes: e.target.value })}
              rows={2}
            />
            <Textarea
              label="Audio direction"
              value={beat.audioDirection}
              onChange={(e) => onChange({ ...beat, audioDirection: e.target.value })}
              rows={2}
              helperText="Ambient bed, SFX events, music cue, voice direction."
            />
          </div>
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
        </>
      )}
    </div>
  );
}

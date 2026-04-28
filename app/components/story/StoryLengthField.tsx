"use client";

import { Select } from "@sarvam/tatva";
import { type StoryLength } from "@/lib/constants";

interface StoryLengthFieldProps {
  value: StoryLength;
  onChange: (value: StoryLength) => void;
}

const OPTIONS = [
  { value: "single", label: "Single clip (4–15s)", description: "One Seedance generation." },
  { value: "half", label: "Half-minute (16–30s)", description: "2–3 stitched beats." },
  { value: "minute", label: "Minute story (~60s)", description: "4–6 stitched beats." },
];

export function StoryLengthField({ value, onChange }: StoryLengthFieldProps) {
  return (
    <Select
      label="Story length"
      options={OPTIONS}
      value={value}
      onValueChange={(v) => onChange(v as StoryLength)}
    />
  );
}

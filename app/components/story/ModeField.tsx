"use client";

import { ButtonGroup, Text } from "@sarvam/tatva";
import { type GenerationMode } from "@/lib/constants";

interface ModeFieldProps {
  value: GenerationMode;
  onChange: (v: GenerationMode) => void;
}

const ITEMS = [
  { value: "quality", label: "Quality (~6–9 min)" },
  { value: "fast", label: "Fast (~2–3 min)" },
];

export function ModeField({ value, onChange }: ModeFieldProps) {
  return (
    <div className="flex flex-col gap-tatva-4">
      <Text as="label" variant="label-md">
        Mode
      </Text>
      <ButtonGroup
        items={ITEMS}
        value={value}
        onValueChange={(v) => onChange(v as GenerationMode)}
      />
      <Text variant="body-sm" tone="secondary">
        {value === "quality"
          ? "Reactive chain — strongest continuity, sequential."
          : "Parallel all-fresh — hard cuts but ~3× faster."}
      </Text>
    </div>
  );
}

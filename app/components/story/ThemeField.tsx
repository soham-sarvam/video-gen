"use client";

import { Select } from "@sarvam/tatva";
import { STYLE_PACKS } from "@/lib/story/style-pack-registry";

interface ThemeFieldProps {
  value: string;
  onChange: (v: string) => void;
}

const OPTIONS = STYLE_PACKS.map((p) => ({
  value: p.id,
  label: p.label,
  description: p.description,
}));

export function ThemeField({ value, onChange }: ThemeFieldProps) {
  return (
    <Select
      label="Theme / Genre"
      options={OPTIONS}
      value={value}
      onValueChange={onChange}
      searchable
    />
  );
}

/**
 * UI-shaped option arrays for Tatva Select. Built atop `lib/constants.ts`
 * to avoid duplicating the source of truth.
 */
import {
  ASPECT_RATIOS,
  DURATIONS,
  FAL_MODELS,
  INDIC_LANGUAGES,
  RESOLUTIONS,
  type AspectRatio,
  type Duration,
  type FalModelId,
  type IndicLanguageCode,
  type Resolution,
} from "@/lib/constants";

interface Option<V extends string> {
  value: V;
  label: string;
  description?: string;
}

export const MODEL_OPTIONS: Option<FalModelId>[] = FAL_MODELS.map((m) => ({
  value: m.value,
  label: m.label,
  description: m.description,
}));

export const RESOLUTION_OPTIONS: Option<Resolution>[] = RESOLUTIONS.map((r) => ({
  value: r,
  label: r,
}));

export const ASPECT_RATIO_OPTIONS: Option<AspectRatio>[] = ASPECT_RATIOS.map(
  (a) => ({ value: a, label: a === "auto" ? "Auto (from inputs)" : a }),
);

export const DURATION_OPTIONS: Option<Duration>[] = DURATIONS.map((d) => ({
  value: d,
  label: d === "auto" ? "Auto (model decides)" : `${d} seconds`,
}));

export const LANGUAGE_OPTIONS: Option<IndicLanguageCode>[] = INDIC_LANGUAGES.map(
  (l) => ({ value: l.value, label: l.label }),
);

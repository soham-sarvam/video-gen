import type {
  AspectRatio,
  GenerationMode,
  IndicLanguageCode,
  Resolution,
  StoryLength,
  VideoModelId,
} from "@/lib/constants";
import type { BulbulSpeaker } from "@/lib/voice/bulbul-client";
import type { TaskStatus } from "@/lib/providers/types";
import type { UploadedAsset } from "@/lib/types";

export type BgmIntensity = "silent" | "low" | "mid" | "peak";
export type ShotType =
  | "wide"
  | "medium"
  | "closeup"
  | "extreme_closeup"
  | "insert"
  | "over_the_shoulder";

export type BeatType =
  | "establishing"
  | "dialogue"
  | "b-roll"
  | "action"
  | "transition"
  | "montage"
  | "reaction"
  | "cutaway";

/** Continuity tier for a single beat. */
export type ContinuityTier =
  | "fresh"
  | "motion-match"
  | "frame-exact-motion-match";

export interface BeatDialogue {
  text: string;
  speaker: BulbulSpeaker;
  languageCode: IndicLanguageCode;
}

export interface BeatOutline {
  index: number;
  durationSeconds: number;
  oneLineSummary: string;
  beatType: BeatType;
  hasDialogue: boolean;
  dialogue?: BeatDialogue;
  role: "opener" | "continuation";
  /** Quality mode + KIE only — promotes the tier from motion-match → frame-exact-motion-match. */
  pinFrame?: boolean;
  shotType: ShotType;
  bgmIntensity: BgmIntensity;
  /** Detailed visual scene description: environment, props, colors, textures. */
  sceneDescription: string;
  /** Camera direction: movement, angle, lens, speed. */
  cameraDirection: string;
  /** Lighting and color grading notes. */
  lightingNotes: string;
  /** Audio direction: SFX, ambient, music cues, voice tone. */
  audioDirection: string;
  /** Character IDs present in this beat (auto-detected from outline). */
  characterIds?: string[];
  /** Fast mode only — full Seedance prompt baked at outline time. */
  fullPrompt?: string;
}

/** A detected character with a generated reference sheet. */
export interface CharacterProfile {
  id: string;
  name: string;
  description: string;
  sheetUrl?: string;
  asset?: UploadedAsset;
}

export interface StoryOutline {
  storyId: string;
  mode: GenerationMode;
  totalDurationSeconds: number;
  language: IndicLanguageCode;
  stylePackId: string;
  voiceTimbreSpeaker: BulbulSpeaker;
  resolution: Resolution;
  aspectRatio: AspectRatio;
  generateAudio: boolean;
  beats: BeatOutline[];
}

export interface OutlineRequest {
  prompt: string;
  language: IndicLanguageCode;
  storyLength: StoryLength;
  mode: GenerationMode;
  stylePack: string;
  model: VideoModelId;
  resolution: Resolution;
  aspectRatio: AspectRatio;
  references: {
    images: UploadedAsset[];
    videos: UploadedAsset[];
    audios: UploadedAsset[];
  };
}

export interface BeatRun extends BeatOutline {
  status: TaskStatus;
  taskId: string;
  videoUrl?: string;
  localUrl?: string;
  diskPath?: string;
  fullPrompt: string;
  tier: ContinuityTier;
  trailVideoUrl?: string;
  lastFrameUrl?: string;
  endStateDescription?: string;
  /** Human-readable error message when status === "failed". */
  failureMessage?: string;
}

export interface StoryRun {
  storyId: string;
  mode: GenerationMode;
  totalDurationSeconds: number;
  language: IndicLanguageCode;
  stylePackId: string;
  voiceTimbreSpeaker: BulbulSpeaker;
  resolution: Resolution;
  aspectRatio: AspectRatio;
  generateAudio: boolean;
  beats: BeatRun[];
  finalVideoUrl?: string;
  finalLocalUrl?: string;
  /** @deprecated Use characterProfiles instead. Kept for backward compat with existing state.json files. */
  characterSheetUrl?: string;
  /** Auto-detected characters with generated reference sheets. */
  characterProfiles?: CharacterProfile[];
  stitchStatus: "pending" | "stitching" | "completed" | "failed";
  failure?: { stage: string; message: string };
}

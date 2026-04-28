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
  hasDialogue: boolean;
  dialogue?: BeatDialogue;
  role: "opener" | "continuation";
  /** Quality mode + KIE only — promotes the tier from motion-match → frame-exact-motion-match. */
  pinFrame?: boolean;
  shotType: ShotType;
  bgmIntensity: BgmIntensity;
  /** Fast mode only — full Seedance prompt baked at outline time. */
  fullPrompt?: string;
}

export interface StoryOutline {
  storyId: string;
  mode: GenerationMode;
  totalDurationSeconds: number;
  language: IndicLanguageCode;
  stylePackId: string;
  voiceTimbreSpeaker: BulbulSpeaker;
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
}

export interface StoryRun {
  storyId: string;
  mode: GenerationMode;
  totalDurationSeconds: number;
  language: IndicLanguageCode;
  stylePackId: string;
  voiceTimbreSpeaker: BulbulSpeaker;
  beats: BeatRun[];
  finalVideoUrl?: string;
  finalLocalUrl?: string;
  stitchStatus: "pending" | "stitching" | "completed" | "failed";
  failure?: { stage: string; message: string };
}

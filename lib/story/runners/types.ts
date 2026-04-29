import type { VideoModel } from "@/lib/constants";
import type { UploadedAsset } from "@/lib/types";
import type { StoryOutline, StoryRun } from "../types";

export interface ChainRunnerInput {
  outline: StoryOutline;
  model: VideoModel;
  references: {
    images: UploadedAsset[];
    videos: UploadedAsset[];
    audios: UploadedAsset[];
  };
  voiceTimbreCdnUrl: string;
  /**
   * Human-readable labels for each entry in `references.images`, in order.
   * Used to append "@Image1 = Character sheet for X" to the prompt so the
   * model knows what each reference slot contains.
   */
  imageLabels?: string[];
  /** Called after every state.json write so the API status route stays fresh. */
  onProgress?: (run: StoryRun) => Promise<void>;
}

export interface ChainRunner {
  run(input: ChainRunnerInput): Promise<StoryRun>;
}

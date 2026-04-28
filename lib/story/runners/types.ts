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
  /** Called after every state.json write so the API status route stays fresh. */
  onProgress?: (run: StoryRun) => Promise<void>;
}

export interface ChainRunner {
  run(input: ChainRunnerInput): Promise<StoryRun>;
}

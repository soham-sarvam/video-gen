/**
 * Provider router — picks the right `VideoProvider` for a given model.
 * Every API route imports `getProvider(model)` instead of provider-specific
 * code, so adding a new provider is purely additive.
 */
import type { Provider, VideoModel } from "../constants";
import { falProvider } from "./fal";
import { kieProvider } from "./kie";
import type { VideoProvider } from "./types";

const PROVIDER_BY_NAME: Record<Provider, VideoProvider> = {
  fal: falProvider,
  kie: kieProvider,
};

export function getProvider(model: VideoModel): VideoProvider {
  const provider = PROVIDER_BY_NAME[model.provider];
  if (!provider) {
    throw new Error(`No provider implementation for "${model.provider}".`);
  }
  return provider;
}

export type {
  GenerationInput,
  ResultOutput,
  StatusOutput,
  SubmitOutput,
  TaskStatus,
  VideoProvider,
} from "./types";

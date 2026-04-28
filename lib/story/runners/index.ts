import type { GenerationMode } from "@/lib/constants";
import { parallelRunner } from "./parallel-runner";
import { sequentialRunner } from "./sequential-runner";
import type { ChainRunner } from "./types";

export function pickRunner(mode: GenerationMode): ChainRunner {
  return mode === "quality" ? sequentialRunner : parallelRunner;
}

export type { ChainRunner, ChainRunnerInput } from "./types";

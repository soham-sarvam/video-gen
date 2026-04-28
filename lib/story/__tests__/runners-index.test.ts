import { describe, expect, it } from "vitest";
import { pickRunner } from "../runners";
import { sequentialRunner } from "../runners/sequential-runner";
import { parallelRunner } from "../runners/parallel-runner";

describe("pickRunner", () => {
  it("returns sequential runner for quality mode", () => {
    expect(pickRunner("quality")).toBe(sequentialRunner);
  });

  it("returns parallel runner for fast mode", () => {
    expect(pickRunner("fast")).toBe(parallelRunner);
  });
});

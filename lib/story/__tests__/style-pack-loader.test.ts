import { describe, expect, it } from "vitest";
import { loadStylePackContent } from "../style-pack-loader";

describe("loadStylePackContent", () => {
  it("returns null for auto", async () => {
    expect(await loadStylePackContent("auto")).toBeNull();
  });
});

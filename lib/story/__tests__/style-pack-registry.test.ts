import { describe, expect, it } from "vitest";
import { STYLE_PACKS, pickAutoStylePack } from "../style-pack-registry";

describe("style-pack-registry", () => {
  it("ships 16 entries (auto + 15 packs)", () => {
    expect(STYLE_PACKS.length).toBe(16);
    expect(STYLE_PACKS[0].id).toBe("auto");
  });

  it("each pack has id, label, description, and skill path (except auto)", () => {
    for (const pack of STYLE_PACKS) {
      expect(pack.id).toMatch(/^(auto|\d{2}-[a-z0-9-]+)$/);
      expect(pack.label.length).toBeGreaterThan(0);
      expect(pack.description.length).toBeGreaterThan(0);
      if (pack.id === "auto") {
        expect(pack.skillPath).toBeNull();
      } else {
        expect(pack.skillPath).toMatch(/^skills\/\d{2}-/);
      }
    }
  });

  it("11-social-hook implies 9:16 default aspect", () => {
    const social = STYLE_PACKS.find((p) => p.id === "11-social-hook");
    expect(social?.defaultAspectRatio).toBe("9:16");
  });

  it("pickAutoStylePack returns a non-auto pack", () => {
    expect(pickAutoStylePack("dance music video", {})).toBe("10-music-video");
    expect(pickAutoStylePack("close-up of a burger", {})).toBe("14-food-beverage");
    expect(pickAutoStylePack("real estate walkthrough", {})).toBe("15-real-estate");
    expect(pickAutoStylePack("nothing matches", {})).toBe("01-cinematic");
  });


});

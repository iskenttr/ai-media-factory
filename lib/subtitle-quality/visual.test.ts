import { describe, expect, it } from "vitest";

import { createQualityProfile } from "./engine";
import { choosePlacement } from "./visual";

describe("visual collision placement", () => {
  it("moves above an edge-dense burned-caption band", () => {
    const width = 90;
    const height = 160;
    const frame = new Uint8Array(width * height).fill(80);
    for (let y = 116; y < 130; y += 1) {
      for (let x = 5; x < width - 5; x += 2) frame[y * width + x] = x % 4 ? 255 : 0;
    }
    const result = choosePlacement([frame], width, height, createQualityProfile(1080, 1920), 52);
    expect(result.bottomMargin).toBeGreaterThan(Math.round(1920 * 0.22));
  });
});

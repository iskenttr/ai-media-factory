import { describe, expect, it } from "vitest";

import { visualDiff } from "./visual-diff";

describe("visual regression diff", () => {
  it("detects a large changed subtitle band", () => {
    const before = new Uint8Array(100).fill(10);
    const after = new Uint8Array(before);
    after.fill(200, 0, 20);
    expect(visualDiff(before, after)).toMatchObject({ changedPixelRatio: 0.2, regressed: true });
  });
});

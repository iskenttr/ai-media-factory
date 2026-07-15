// @vitest-environment node
import { describe, expect, it } from "vitest";
import { numericSetting } from "./limits";

describe("numeric settings", () => {
  it("uses safe fallbacks for missing and blank values", () => {
    expect(numericSetting(undefined, 30)).toBe(30);
    expect(numericSetting("", 30)).toBe(30);
  });
  it("preserves explicit zero as a stop control", () => expect(numericSetting("0", 30)).toBe(0));
  it("rejects malformed and negative settings", () => {
    expect(() => numericSetting("many", 30)).toThrow("invalid_numeric_setting");
    expect(() => numericSetting("-1", 30)).toThrow("invalid_numeric_setting");
  });
});

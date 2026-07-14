import { describe, expect, it } from "vitest";

import { createAssSubtitles, createFittedAss, rebalanceSubtitleCues, wrapSubtitleText } from "./video-renderer";

describe("localized video subtitles", () => {
  it("writes ordered ASS dialogue with escaped user text", () => {
    const result = createAssSubtitles([
      { startMs: 1_230, endMs: 4_560, text: "Merhaba {dünya}\\test\nikinci satır" },
    ]);

    expect(result).toContain("Dialogue: 0,0:00:01.23,0:00:04.56");
    expect(result).toContain("Merhaba \\{dünya\\}\\\\test ikinci satır");
  });

  it("wraps Turkish copy into no more than two balanced lines", () => {
    const wrapped = wrapSubtitleText("Bu cümle Türkçe karakterleri koruyarak iki dengeli satıra ayrılır", 32);
    expect(wrapped.split("\\N")).toHaveLength(2);
    expect(wrapped).toContain("Türkçe");
  });

  it("never merges phrases and removes cue overlap", () => {
    const cues = rebalanceSubtitleCues([
      { startMs: 0, endMs: 1_000, text: "Evet." },
      { startMs: 900, endMs: 1_500, text: "Devam edebiliriz." },
    ], 42);

    expect(cues).toEqual([
      { startMs: 0, endMs: 870, text: "Evet." },
      { startMs: 900, endMs: 1_500, text: "Devam edebiliriz." },
    ]);
  });

  it("uses vertical safe margins in the ASS style", () => {
    const result = createAssSubtitles([{ startMs: 0, endMs: 1_000, text: "Merhaba" }], {
      width: 1080, height: 1920, orientation: "vertical", fontSize: 71, horizontalMargin: 81, bottomMargin: 269, maxCharactersPerLine: 24,
    });
    expect(result).toContain("PlayResX: 1080");
    expect(result).toContain(",2,81,81,269,1");
  });

  it("emits a deterministic Turkish font and valid ASS size override", () => {
    const result = createFittedAss([{
      startMs: 0,
      endMs: 1_000,
      text: "Türkçe altyazı",
      lines: ["Türkçe altyazı"],
      fontSize: 44,
    }], {
      width: 1080,
      height: 1920,
      orientation: "vertical",
      fontSize: 56,
      horizontalMargin: 97,
      bottomMargin: 595,
      maxCharactersPerLine: 30,
    });

    expect(result).toContain("Style: Localized,DejaVu Sans,56");
    expect(result).toContain("{\\fs44}Türkçe altyazı");
    expect([...result].some((character) => {
      const code = character.charCodeAt(0);
      return code < 32 && ![9, 10, 13].includes(code);
    })).toBe(false);
  });
});

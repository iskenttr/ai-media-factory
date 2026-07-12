import { describe, expect, it } from "vitest";

import { createAssSubtitles, rebalanceSubtitleCues, wrapSubtitleText } from "./video-renderer";

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

  it("merges short adjacent flashes into a readable cue", () => {
    const cues = rebalanceSubtitleCues([
      { startMs: 0, endMs: 320, text: "Evet." },
      { startMs: 350, endMs: 1_200, text: "Devam edebiliriz." },
    ], 42);

    expect(cues).toEqual([{ startMs: 0, endMs: 1_200, text: "Evet. Devam edebiliriz." }]);
  });

  it("uses vertical safe margins in the ASS style", () => {
    const result = createAssSubtitles([{ startMs: 0, endMs: 1_000, text: "Merhaba" }], {
      width: 1080, height: 1920, orientation: "vertical", fontSize: 71, horizontalMargin: 81, bottomMargin: 269, maxCharactersPerLine: 24,
    });
    expect(result).toContain("PlayResX: 1080");
    expect(result).toContain(",2,81,81,269,1");
  });
});

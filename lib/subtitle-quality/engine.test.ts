import { describe, expect, it } from "vitest";

import {
  createQualityProfile,
  fitCue,
  normalizeCueTiming,
  prepareCues,
  semanticSplit,
  speechIntervalsFromSilenceLog,
  validateCues,
  weightedTextWidth,
} from "./engine";

describe("subtitle quality engine", () => {
  const vertical = createQualityProfile(1080, 1920);

  it("parses voiced intervals and refines phrase boundaries", () => {
    const speech = speechIntervalsFromSilenceLog(
      "silence_start: 0.42\nsilence_end: 0.71\nsilence_start: 2.35\nsilence_end: 2.8",
      4_000,
    );
    expect(speech).toEqual([
      { startMs: 0, endMs: 420 },
      { startMs: 710, endMs: 2350 },
      { startMs: 2800, endMs: 4000 },
    ]);
    const cues = prepareCues([{ startMs: 650, endMs: 2_500, text: "Merhaba dünya" }], vertical, speech);
    expect(cues[0]).toMatchObject({ startMs: 710, endMs: 2350 });
  });

  it("removes overlaps instead of merging or extending stale text", () => {
    const result = normalizeCueTiming([
      { startMs: 0, endMs: 1_200, text: "Birinci konuşmacı." },
      { startMs: 1_000, endMs: 1_700, text: "İkinci konuşmacı." },
    ], vertical);
    expect(result).toHaveLength(2);
    expect(result[0].endMs).toBe(970);
    expect(result[0].text).toBe("Birinci konuşmacı.");
  });

  it("prefers Turkish punctuation and balanced semantic lines", () => {
    const split = semanticSplit("Bugün buraya geldik, çünkü önemli bir konuyu birlikte konuşacağız");
    expect(split).toEqual(["Bugün buraya geldik,", "çünkü önemli bir konuyu birlikte konuşacağız"]);
  });

  it("fits measured text inside the vertical safe width", () => {
    const fitted = fitCue("Türkçe altyazılar ekranda güvenli ve dengeli görünmelidir", vertical);
    expect(fitted.lines.length).toBeLessThanOrEqual(2);
    expect(Math.max(...fitted.lines.map(weightedTextWidth)) * fitted.fontSize)
      .toBeLessThanOrEqual(vertical.width - vertical.safeLeft - vertical.safeRight);
    expect(fitted.fontSize).toBeGreaterThanOrEqual(vertical.minFontSize);
  });

  it("re-splits a dense cue instead of shrinking below readable size", () => {
    const cues = prepareCues([{
      startMs: 0,
      endMs: 5_300,
      text: "İnsanlar öğrenmeyi gerçekten önemsiyor; çok zekiler ve bilgilerini paylaşmaya değer veriyorlar.",
    }], vertical);
    expect(cues).toHaveLength(2);
    expect(cues[0].text).toMatch(/önemsiyor;$/u);
    expect(cues.every((cue) => cue.fontSize >= vertical.minFontSize)).toBe(true);
  });

  it("splits excessive reading speed and validates hard invariants", () => {
    const cues = prepareCues([{
      startMs: 0,
      endMs: 4_000,
      text: "Bu çok uzun Türkçe cümle, izleyicinin rahat okuyabilmesi için anlamlı parçalara ayrılmalıdır ve ekranda gereğinden fazla metin bırakmamalıdır.",
    }], vertical);
    expect(cues.length).toBeGreaterThan(1);
    expect(validateCues(cues, vertical).filter((issue) => ["overlap", "line_count", "text_bounds"].includes(issue.code))).toEqual([]);
  });
});

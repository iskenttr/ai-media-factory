import { describe, expect, it } from "vitest";

import { createQualityProfile, prepareCues } from "./engine";
import { diffSubtitles } from "./diff";
import { nextRepair } from "./repair";
import { passesQualityGate, qualitySnapshot } from "./validation";

describe("quality validation, repair, and regression", () => {
  const profile = createQualityProfile(1080, 1920);
  const cues = prepareCues([
    { startMs: 0, endMs: 2_000, text: "Doğal ve okunabilir Türkçe." },
    { startMs: 2_030, endMs: 4_300, text: "İkinci konuşmacı devam ediyor.", speakerId: "speaker_2" },
  ], profile);

  it("produces an explainable passing score", () => {
    const snapshot = qualitySnapshot(cues, profile, 0.04, 7);
    expect(snapshot).toMatchObject({ overlapCount: 0, minimumGapMs: 30, maximumLineCount: 2, failures: [] });
    expect(passesQualityGate(snapshot)).toBe(true);
  });

  it("classifies a regression and bounds repairs to five attempts", () => {
    const before = qualitySnapshot(cues, profile, 0.02, 0);
    const regressed = cues.map((cue, index) => index ? { ...cue, startMs: cues[0].endMs } : cue);
    const after = qualitySnapshot(regressed, profile, 0.2, 0);
    expect(diffSubtitles(cues, regressed, before, after).regressions).toContain("hard_failures_increased");
    expect(nextRepair({ attempt: 5, profile, bottomCandidateIndex: 0 }, after)).toBeNull();
  });

  it("uses aligned word boundaries when splitting dense translated text", () => {
    const aligned = prepareCues([{
      startMs: 0,
      endMs: 4_000,
      text: "Bu uzun Türkçe ifade, güvenli bir kelime sınırında iki parçaya ayrılmalıdır.",
      words: [
        { text: "source", startMs: 0, endMs: 1_600 },
        { text: "phrase", startMs: 1_700, endMs: 2_300 },
        { text: "ending", startMs: 2_400, endMs: 4_000 },
      ],
    }], profile);
    expect(aligned.length).toBeGreaterThan(1);
    expect(aligned[0].endMs).toBe(1_600);
  });

  describe("comprehensive quality scoring", () => {
    it("achieves a perfect score of 100 under ideal conditions", () => {
      const perfectCues = prepareCues([
        { startMs: 1000, endMs: 3000, text: "Kısa ve net." }
      ], profile);
      const snapshot = qualitySnapshot(perfectCues, profile, 0, 0);
      expect(snapshot.score).toBe(100);
      expect(snapshot.failures).toEqual([]);
    });

    it("handles zero-length segments gracefully without crashing", () => {
      const zeroLengthCues = [
        {
          startMs: 1000,
          endMs: 1000,
          text: "Sıfır",
          lines: ["Sıfır"] as [string],
          fontSize: 32
        }
      ];
      const snapshot = qualitySnapshot(zeroLengthCues, profile, 0, 0);
      expect(snapshot.failures).toContain("timing");
      expect(snapshot.score).toBeLessThan(100);
    });

    it("correctly scores Unicode text with combining marks", () => {
      const unicodeCues = prepareCues([
        { startMs: 1000, endMs: 3000, text: "C\u0327u\u0308neyt" }
      ], profile);
      const snapshot = qualitySnapshot(unicodeCues, profile, 0, 0);
      expect(snapshot.failures).toEqual([]);
      expect(snapshot.maximumCps).toBeLessThan(10);
    });

    it("handles extreme and negative timestamps safely", () => {
      const extremeCues = [
        {
          startMs: -5000,
          endMs: 999999999,
          text: "Sınırlar",
          lines: ["Sınırlar"] as [string],
          fontSize: 32
        }
      ];
      const snapshot = qualitySnapshot(extremeCues, profile, 0, 0);
      expect(snapshot.failures).toContain("timing");
    });
  });
});

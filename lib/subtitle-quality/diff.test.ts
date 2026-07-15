import { describe, expect, it } from "vitest";

import { diffSubtitles } from "./diff";
import type { QualityMetricSnapshot } from "./contracts";
import type { FittedCue } from "./engine";

function makeMetric(overrides: Partial<QualityMetricSnapshot> = {}): QualityMetricSnapshot {
  return {
    score: 95,
    cueCount: 2,
    overlapCount: 0,
    minimumGapMs: 30,
    maximumCps: 12.5,
    minimumFontSize: 32,
    maximumLineCount: 2,
    collisionScore: 0.05,
    durationDeltaMs: 0,
    failures: [],
    ...overrides,
  };
}

function makeCue(index: number, overrides: Partial<FittedCue> = {}): FittedCue {
  return {
    startMs: index * 2000,
    endMs: (index + 1) * 2000,
    text: `Cue ${index}`,
    lines: [`Line ${index}`],
    fontSize: 32,
    ...overrides,
  };
}

describe("diffSubtitles", () => {
  it("calculates added cues correctly", () => {
    const before: FittedCue[] = [makeCue(0), makeCue(1)];
    const after: FittedCue[] = [makeCue(0), makeCue(1), makeCue(2)];
    const beforeMetrics = makeMetric({ cueCount: 2 });
    const afterMetrics = makeMetric({ cueCount: 3 });
    const diff = diffSubtitles(before, after, beforeMetrics, afterMetrics);
    expect(diff.added).toBe(1);
    expect(diff.removed).toBe(0);
  });

  it("calculates removed cues correctly", () => {
    const before: FittedCue[] = [makeCue(0), makeCue(1), makeCue(2)];
    const after: FittedCue[] = [makeCue(0), makeCue(1)];
    const beforeMetrics = makeMetric({ cueCount: 3 });
    const afterMetrics = makeMetric({ cueCount: 2 });
    const diff = diffSubtitles(before, after, beforeMetrics, afterMetrics);
    expect(diff.added).toBe(0);
    expect(diff.removed).toBe(1);
  });

  it("counts changed timing when cue times differ", () => {
    const before: FittedCue[] = [makeCue(0)];
    const after: FittedCue[] = [makeCue(0, { startMs: 100 })];
    const diff = diffSubtitles(before, after, makeMetric(), makeMetric());
    expect(diff.changedTiming).toBe(1);
    expect(diff.changedText).toBe(0);
  });

  it("counts changed text when cue text differs", () => {
    const before: FittedCue[] = [makeCue(0, { text: "Original" })];
    const after: FittedCue[] = [makeCue(0, { text: "Modified" })];
    const diff = diffSubtitles(before, after, makeMetric(), makeMetric());
    expect(diff.changedTiming).toBe(0);
    expect(diff.changedText).toBe(1);
  });

  it("counts changed text when lines differ", () => {
    const before: FittedCue[] = [makeCue(0, { lines: ["Line 1"] })];
    const after: FittedCue[] = [makeCue(0, { lines: ["Line 1", "Line 2"] })];
    const diff = diffSubtitles(before, after, makeMetric(), makeMetric());
    expect(diff.changedText).toBe(1);
  });

  it("calculates score delta correctly", () => {
    const before: FittedCue[] = [makeCue(0)];
    const after: FittedCue[] = [makeCue(0)];
    const beforeMetrics = makeMetric({ score: 90 });
    const afterMetrics = makeMetric({ score: 85 });
    const diff = diffSubtitles(before, after, beforeMetrics, afterMetrics);
    expect(diff.scoreDelta).toBe(-5);
  });

  it("detects overlap count regression", () => {
    const before: FittedCue[] = [makeCue(0)];
    const after: FittedCue[] = [makeCue(0)];
    const beforeMetrics = makeMetric({ overlapCount: 0 });
    const afterMetrics = makeMetric({ overlapCount: 2 });
    const diff = diffSubtitles(before, after, beforeMetrics, afterMetrics);
    expect(diff.regressions).toContain("overlap_count_increased");
  });

  it("detects minimum font size regression", () => {
    const before: FittedCue[] = [makeCue(0, { fontSize: 32 })];
    const after: FittedCue[] = [makeCue(0, { fontSize: 24 })];
    const beforeMetrics = makeMetric({ minimumFontSize: 32 });
    const afterMetrics = makeMetric({ minimumFontSize: 24 });
    const diff = diffSubtitles(before, after, beforeMetrics, afterMetrics);
    expect(diff.regressions).toContain("minimum_font_size_decreased");
  });

  it("detects reading speed regression", () => {
    const before: FittedCue[] = [makeCue(0)];
    const after: FittedCue[] = [makeCue(0)];
    const beforeMetrics = makeMetric({ maximumCps: 12.5 });
    const afterMetrics = makeMetric({ maximumCps: 13.0 });
    const diff = diffSubtitles(before, after, beforeMetrics, afterMetrics);
    expect(diff.regressions).toContain("reading_speed_increased");
  });

  it("does not flag reading speed regression within tolerance", () => {
    const before: FittedCue[] = [makeCue(0)];
    const after: FittedCue[] = [makeCue(0)];
    const beforeMetrics = makeMetric({ maximumCps: 12.5 });
    const afterMetrics = makeMetric({ maximumCps: 12.7 }); // within 0.25 tolerance
    const diff = diffSubtitles(before, after, beforeMetrics, afterMetrics);
    expect(diff.regressions).not.toContain("reading_speed_increased");
  });

  it("detects collision score regression", () => {
    const before: FittedCue[] = [makeCue(0)];
    const after: FittedCue[] = [makeCue(0)];
    const beforeMetrics = makeMetric({ collisionScore: 0.05 });
    const afterMetrics = makeMetric({ collisionScore: 0.10 });
    const diff = diffSubtitles(before, after, beforeMetrics, afterMetrics);
    expect(diff.regressions).toContain("collision_score_increased");
  });

  it("detects hard failures regression", () => {
    const before: FittedCue[] = [makeCue(0)];
    const after: FittedCue[] = [makeCue(0)];
    const beforeMetrics = makeMetric({ failures: [] });
    const afterMetrics = makeMetric({ failures: ["timing"] });
    const diff = diffSubtitles(before, after, beforeMetrics, afterMetrics);
    expect(diff.regressions).toContain("hard_failures_increased");
  });

  it("returns empty regressions when metrics are stable", () => {
    const before: FittedCue[] = [makeCue(0)];
    const after: FittedCue[] = [makeCue(0)];
    const diff = diffSubtitles(before, after, makeMetric(), makeMetric());
    expect(diff.regressions).toEqual([]);
  });

  it("handles empty before and after arrays", () => {
    const before: FittedCue[] = [];
    const after: FittedCue[] = [];
    const diff = diffSubtitles(before, after, makeMetric({ cueCount: 0 }), makeMetric({ cueCount: 0 }));
    expect(diff.added).toBe(0);
    expect(diff.removed).toBe(0);
    expect(diff.changedTiming).toBe(0);
    expect(diff.changedText).toBe(0);
    expect(diff.regressions).toEqual([]);
  });

  it("handles before empty, after has cues", () => {
    const before: FittedCue[] = [];
    const after: FittedCue[] = [makeCue(0), makeCue(1)];
    const diff = diffSubtitles(before, after, makeMetric({ cueCount: 0 }), makeMetric({ cueCount: 2 }));
    expect(diff.added).toBe(2);
    expect(diff.removed).toBe(0);
  });

  it("handles before has cues, after empty", () => {
    const before: FittedCue[] = [makeCue(0), makeCue(1)];
    const after: FittedCue[] = [];
    const diff = diffSubtitles(before, after, makeMetric({ cueCount: 2 }), makeMetric({ cueCount: 0 }));
    expect(diff.added).toBe(0);
    expect(diff.removed).toBe(2);
  });
});

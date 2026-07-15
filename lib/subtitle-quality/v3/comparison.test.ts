import { describe, expect, it } from "vitest";

import type { QualityReportV3 } from "./contracts";
import { compareQualityReports } from "./comparison";
import { evaluateSubtitleQuality } from "./evaluator";

function report(overrides: Partial<QualityReportV3> = {}): QualityReportV3 {
  const baseline = evaluateSubtitleQuality({
    runId: "run",
    videoId: "video",
    videoDurationMs: 2_000,
    cues: [{ id: "cue", startMs: 0, endMs: 1_000, text: "Merhaba" }],
  });
  return { ...baseline, ...overrides };
}

describe("subtitle quality V3 comparison", () => {
  it("accepts a candidate that satisfies the requested quality delta", () => {
    const result = compareQualityReports(
      report({ overallScore: 88 }),
      report({ overallScore: 91 }),
      3,
    );

    expect(result).toEqual({
      accepted: true,
      baselineScore: 88,
      candidateScore: 91,
      qualityDelta: 3,
      criticalErrorDelta: 0,
      regressions: [],
    });
  });

  it("rejects a quality delta below the configured minimum", () => {
    const result = compareQualityReports(
      report({ overallScore: 90 }),
      report({ overallScore: 90.5 }),
      1,
    );

    expect(result.accepted).toBe(false);
    expect(result.regressions).toContain("quality_delta_below_minimum:0.5<1");
  });

  it("rejects increased critical errors and formerly passing checks", () => {
    const baseline = report({
      overallScore: 80,
      criticalErrorCount: 1,
      checks: { render: { status: "passed", issueCount: 0 } },
    });
    const candidate = report({
      overallScore: 90,
      criticalErrorCount: 2,
      checks: { render: { status: "not_run", issueCount: 0 } },
    });
    const result = compareQualityReports(baseline, candidate);

    expect(result.accepted).toBe(false);
    expect(result.criticalErrorDelta).toBe(1);
    expect(result.regressions).toEqual(expect.arrayContaining([
      "critical_errors_increased:1",
      "check_regressed:render",
    ]));
  });
});

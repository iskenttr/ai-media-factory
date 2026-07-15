import type { QualityReportV3 } from "./contracts";

export interface QualityComparison {
  accepted: boolean;
  baselineScore: number;
  candidateScore: number;
  qualityDelta: number;
  criticalErrorDelta: number;
  regressions: string[];
}

export function compareQualityReports(baseline: QualityReportV3, candidate: QualityReportV3, minimumDelta = 0) : QualityComparison {
  const regressions: string[] = [];
  const qualityDelta = candidate.overallScore - baseline.overallScore;
  const criticalErrorDelta = candidate.criticalErrorCount - baseline.criticalErrorCount;
  if (qualityDelta < minimumDelta) regressions.push(`quality_delta_below_minimum:${qualityDelta}<${minimumDelta}`);
  if (criticalErrorDelta > 0) regressions.push(`critical_errors_increased:${criticalErrorDelta}`);
  for (const [name, check] of Object.entries(candidate.checks)) {
    const previous = baseline.checks[name];
    if (previous?.status === "passed" && check.status !== "passed") regressions.push(`check_regressed:${name}`);
  }
  return { accepted: regressions.length === 0, baselineScore: baseline.overallScore, candidateScore: candidate.overallScore, qualityDelta, criticalErrorDelta, regressions };
}

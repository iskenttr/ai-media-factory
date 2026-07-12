import type { FittedCue, QualityIssue, QualityProfile } from "./engine";
import { validateCues } from "./engine";
import type { QualityFailureClass, QualityMetricSnapshot } from "./contracts";

function classify(issue: QualityIssue): QualityFailureClass {
  if (issue.code === "overlap" || issue.code === "duration") return "timing";
  if (issue.code === "reading_speed") return "reading_speed";
  if (issue.code === "text_bounds" || issue.code === "line_count") return "bounds";
  return "segmentation";
}

export function qualitySnapshot(
  cues: FittedCue[],
  profile: QualityProfile,
  collisionScore = 0,
  durationDeltaMs = 0,
): QualityMetricSnapshot {
  const issues = validateCues(cues, profile);
  const gaps = cues.slice(1).map((cue, index) => cue.startMs - cues[index].endMs);
  const failures = [...new Set([
    ...issues.map(classify),
    ...(collisionScore > 0.16 ? ["collision" as const] : []),
    ...(Math.abs(durationDeltaMs) > 120 ? ["media_duration" as const] : []),
  ])];
  const maximumCps = cues.reduce((maximum, cue) => Math.max(maximum, cue.text.length / ((cue.endMs - cue.startMs) / 1_000)), 0);
  const softPenalty = Math.max(0, maximumCps - profile.maxCps) * 1.5
    + collisionScore * 100
    + cues.reduce((sum, cue) => sum + Math.max(0, profile.minFontSize - cue.fontSize), 0);
  const hardPenalty = failures.length * 25;
  return {
    score: Math.max(0, Math.round(100 - softPenalty - hardPenalty)),
    cueCount: cues.length,
    overlapCount: issues.filter((issue) => issue.code === "overlap").length,
    minimumGapMs: gaps.length ? Math.min(...gaps) : null,
    maximumCps: Number(maximumCps.toFixed(2)),
    minimumFontSize: cues.length ? Math.min(...cues.map((cue) => cue.fontSize)) : 0,
    maximumLineCount: cues.length ? Math.max(...cues.map((cue) => cue.lines.length)) : 0,
    collisionScore: Number(collisionScore.toFixed(4)),
    durationDeltaMs,
    failures,
  };
}

export function passesQualityGate(snapshot: QualityMetricSnapshot, threshold = 90) {
  return snapshot.failures.length === 0 && snapshot.score >= threshold;
}

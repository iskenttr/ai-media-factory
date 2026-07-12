import type { FittedCue } from "./engine";
import type { QualityMetricSnapshot, SubtitleDiff } from "./contracts";

export function diffSubtitles(before: FittedCue[], after: FittedCue[], beforeMetrics: QualityMetricSnapshot, afterMetrics: QualityMetricSnapshot): SubtitleDiff {
  const shared = Math.min(before.length, after.length);
  let changedTiming = 0;
  let changedText = 0;
  for (let index = 0; index < shared; index += 1) {
    if (before[index].startMs !== after[index].startMs || before[index].endMs !== after[index].endMs) changedTiming += 1;
    if (before[index].text !== after[index].text || before[index].lines.join("\n") !== after[index].lines.join("\n")) changedText += 1;
  }
  const regressions: string[] = [];
  if (afterMetrics.overlapCount > beforeMetrics.overlapCount) regressions.push("overlap_count_increased");
  if (afterMetrics.minimumFontSize < beforeMetrics.minimumFontSize) regressions.push("minimum_font_size_decreased");
  if (afterMetrics.maximumCps > beforeMetrics.maximumCps + 0.25) regressions.push("reading_speed_increased");
  if (afterMetrics.collisionScore > beforeMetrics.collisionScore + 0.01) regressions.push("collision_score_increased");
  if (afterMetrics.failures.length > beforeMetrics.failures.length) regressions.push("hard_failures_increased");
  return {
    added: Math.max(0, after.length - before.length),
    removed: Math.max(0, before.length - after.length),
    changedTiming,
    changedText,
    scoreDelta: afterMetrics.score - beforeMetrics.score,
    regressions,
  };
}

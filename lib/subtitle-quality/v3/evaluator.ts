import { validateAss } from "./ass-parser";
import type {
  CueQualityResult,
  DeterministicIssue,
  QualityEvaluationInput,
  QualityLimits,
  QualityReportV3,
  RawSubtitleCue,
} from "./contracts";

export const DEFAULT_QUALITY_LIMITS: QualityLimits = {
  maximumCps: 17,
  maximumLines: 2,
  maximumLineLength: 42,
  minimumCueDurationMs: 500,
  maximumCueDurationMs: 7_000,
  maximumCriticalErrors: 0,
};

function countCharacters(text: string) {
  return Array.from(text.normalize("NFC").replace(/\s+/g, " ").trim()).length;
}

function contains(bounds: NonNullable<RawSubtitleCue["bounds"]>, safe: NonNullable<QualityEvaluationInput["safeArea"]>) {
  return bounds.x >= safe.x && bounds.y >= safe.y
    && bounds.x + bounds.width <= safe.x + safe.width
    && bounds.y + bounds.height <= safe.y + safe.height;
}

function cueIssue(code: string, cueId: string, message: string, severity: "warning" | "critical" = "critical", value?: number, limit?: number): DeterministicIssue {
  return { code, cueId, message, severity, value, limit };
}

export function evaluateSubtitleQuality(input: QualityEvaluationInput): QualityReportV3 {
  const limits = { ...DEFAULT_QUALITY_LIMITS, ...input.limits };
  const allIssues: DeterministicIssue[] = [];
  let totalOverlapMs = 0;
  let safeAreaViolationCount = input.safeArea ? 0 : null;
  const segments: CueQualityResult[] = input.cues.map((cue, index) => {
    const previous = input.cues[index - 1];
    const durationMs = cue.endMs - cue.startMs;
    const text = cue.text.normalize("NFC");
    const characters = countCharacters(text);
    const lines = text.split(/\r?\n|\\N/i);
    const gapBeforeMs = previous ? cue.startMs - previous.endMs : null;
    const overlapBeforeMs = gapBeforeMs !== null && gapBeforeMs < 0 ? Math.abs(gapBeforeMs) : 0;
    totalOverlapMs += overlapBeforeMs;
    const issues: DeterministicIssue[] = [];
    if (!Number.isFinite(cue.startMs) || !Number.isFinite(cue.endMs) || cue.startMs < 0 || durationMs <= 0) {
      issues.push(cueIssue("invalid_timestamp", cue.id, "Cue has an invalid timestamp."));
    }
    if (!text.trim()) issues.push(cueIssue("empty_cue", cue.id, "Cue text is empty."));
    if (overlapBeforeMs > 0) issues.push(cueIssue("overlap", cue.id, "Cue overlaps the previous cue.", "critical", overlapBeforeMs, 0));
    if (durationMs > 0 && durationMs < limits.minimumCueDurationMs) issues.push(cueIssue("cue_too_short", cue.id, "Cue duration is too short.", "warning", durationMs, limits.minimumCueDurationMs));
    if (durationMs > limits.maximumCueDurationMs) issues.push(cueIssue("cue_too_long", cue.id, "Cue duration is too long.", "warning", durationMs, limits.maximumCueDurationMs));
    const cps = durationMs > 0 ? characters / (durationMs / 1_000) : null;
    if (cps !== null && cps > limits.maximumCps) issues.push(cueIssue("reading_speed", cue.id, "Cue exceeds the reading-speed limit.", "warning", Number(cps.toFixed(2)), limits.maximumCps));
    if (lines.length > limits.maximumLines) issues.push(cueIssue("line_count", cue.id, "Cue exceeds the line-count limit.", "critical", lines.length, limits.maximumLines));
    const maximumLineLength = Math.max(0, ...lines.map((line) => Array.from(line).length));
    if (maximumLineLength > limits.maximumLineLength) issues.push(cueIssue("line_length", cue.id, "Cue exceeds the line-length limit.", "warning", maximumLineLength, limits.maximumLineLength));
    if (cue.endMs > input.videoDurationMs) issues.push(cueIssue("video_overflow", cue.id, "Cue extends beyond the video duration.", "critical", cue.endMs, input.videoDurationMs));
    if (input.safeArea && cue.bounds && !contains(cue.bounds, input.safeArea)) {
      safeAreaViolationCount = (safeAreaViolationCount ?? 0) + 1;
      issues.push(cueIssue("safe_area", cue.id, "Cue bounds exceed the declared safe area."));
    }
    allIssues.push(...issues);
    return {
      id: cue.id,
      startMs: cue.startMs,
      endMs: cue.endMs,
      durationMs,
      characters,
      charactersPerSecond: cps === null ? null : Number(cps.toFixed(2)),
      lineCount: lines.length,
      maximumLineLength,
      gapBeforeMs,
      overlapBeforeMs,
      speakerChanged: Boolean(previous?.speakerId && cue.speakerId && previous.speakerId !== cue.speakerId),
      issues,
    };
  });
  const ass = validateAss(input.assText);
  allIssues.push(...ass.issues);
  const criticalErrorCount = allIssues.filter((entry) => entry.severity === "critical").length;
  const warningCount = allIssues.filter((entry) => entry.severity === "warning").length;
  const score = Math.max(0, Math.round(100 - criticalErrorCount * 20 - warningCount * 3));
  const safeAreaStatus = input.safeArea
    ? { status: safeAreaViolationCount ? "failed" as const : "passed" as const, issueCount: safeAreaViolationCount ?? 0 }
    : { status: "not_run" as const, issueCount: 0, detail: "No safe-area metadata was supplied." };
  const recommendations = [...new Set(allIssues.map((entry) => {
    if (entry.code === "reading_speed") return "Reduce reading speed by resplitting or extending the cue within speech boundaries.";
    if (entry.code === "overlap") return "Normalize cue gaps without extending text beyond speech.";
    if (entry.code.startsWith("ass_")) return "Regenerate and validate the ASS document before rendering.";
    if (entry.code === "safe_area") return "Refit or reposition the cue inside the declared safe area.";
    return `Resolve ${entry.code} deterministically.`;
  }))];
  return {
    schemaVersion: "subtitle-quality-v3",
    runId: input.runId,
    videoId: input.videoId,
    createdAt: new Date().toISOString(),
    source: { durationMs: input.videoDurationMs, width: input.videoWidth, height: input.videoHeight },
    overallScore: score,
    criticalErrorCount,
    segments,
    metrics: {
      cueCount: segments.length,
      invalidTimestampCount: allIssues.filter((entry) => entry.code === "invalid_timestamp").length,
      emptyCueCount: allIssues.filter((entry) => entry.code === "empty_cue").length,
      overlapCount: allIssues.filter((entry) => entry.code === "overlap").length,
      totalOverlapMs,
      minimumGapMs: segments.length > 1 ? Math.min(...segments.slice(1).map((segment) => segment.gapBeforeMs ?? 0)) : null,
      maximumCps: Math.max(0, ...segments.map((segment) => segment.charactersPerSecond ?? 0)),
      maximumLineCount: Math.max(0, ...segments.map((segment) => segment.lineCount)),
      maximumLineLength: Math.max(0, ...segments.map((segment) => segment.maximumLineLength)),
      speakerChangeCount: segments.filter((segment) => segment.speakerChanged).length,
      videoOverflowCount: allIssues.filter((entry) => entry.code === "video_overflow").length,
      safeAreaViolationCount,
    },
    checks: {
      timestamps: { status: allIssues.some((entry) => entry.code === "invalid_timestamp") ? "failed" : "passed", issueCount: allIssues.filter((entry) => entry.code === "invalid_timestamp").length },
      overlap: { status: totalOverlapMs > 0 ? "failed" : "passed", issueCount: allIssues.filter((entry) => entry.code === "overlap").length },
      ass: { status: ass.status, issueCount: ass.issues.length, detail: ass.status === "not_run" ? "ASS input was not supplied." : `${ass.dialogueCount} dialogue events parsed.` },
      safeArea: safeAreaStatus,
      videoDuration: { status: allIssues.some((entry) => entry.code === "video_overflow") ? "failed" : "passed", issueCount: allIssues.filter((entry) => entry.code === "video_overflow").length },
    },
    recommendations,
    issues: allIssues,
  };
}

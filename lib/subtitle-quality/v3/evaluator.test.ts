import { describe, expect, it } from "vitest";

import type { QualityEvaluationInput } from "./contracts";
import { evaluateSubtitleQuality } from "./evaluator";

const baseInput: QualityEvaluationInput = {
  runId: "run-1",
  videoId: "video-1",
  videoDurationMs: 3_000,
  videoWidth: 1_080,
  videoHeight: 1_920,
  safeArea: { x: 90, y: 100, width: 900, height: 1_600 },
  assText: `[Script Info]
[V4+ Styles]
Style: Localized,DejaVu Sans,48
[Events]
Dialogue: 0,0:00:00.00,0:00:01.00,Localized,,0,0,0,,Merhaba
`,
  cues: [
    {
      id: "cue-1",
      startMs: 0,
      endMs: 1_000,
      text: "Merhaba dünya",
      speakerId: "speaker-1",
      bounds: { x: 100, y: 1_400, width: 800, height: 120 },
    },
    {
      id: "cue-2",
      startMs: 1_030,
      endMs: 2_030,
      text: "İkinci satır",
      speakerId: "speaker-2",
      bounds: { x: 120, y: 1_380, width: 760, height: 120 },
    },
  ],
};

describe("subtitle quality V3 evaluator", () => {
  it("produces deterministic metrics for a valid speaker-aware subtitle set", () => {
    const report = evaluateSubtitleQuality(baseInput);

    expect(report).toMatchObject({
      schemaVersion: "subtitle-quality-v3",
      runId: "run-1",
      videoId: "video-1",
      source: { durationMs: 3_000, width: 1_080, height: 1_920 },
      overallScore: 100,
      criticalErrorCount: 0,
      metrics: {
        cueCount: 2,
        invalidTimestampCount: 0,
        emptyCueCount: 0,
        overlapCount: 0,
        totalOverlapMs: 0,
        minimumGapMs: 30,
        speakerChangeCount: 1,
        videoOverflowCount: 0,
        safeAreaViolationCount: 0,
      },
      checks: {
        timestamps: { status: "passed", issueCount: 0 },
        overlap: { status: "passed", issueCount: 0 },
        ass: { status: "passed", issueCount: 0 },
        safeArea: { status: "passed", issueCount: 0 },
        videoDuration: { status: "passed", issueCount: 0 },
      },
    });
    expect(report.segments[1]).toMatchObject({
      id: "cue-2",
      durationMs: 1_000,
      gapBeforeMs: 30,
      overlapBeforeMs: 0,
      speakerChanged: true,
    });
    expect(report.issues).toEqual([]);
    expect(report.recommendations).toEqual([]);
  });

  it("reports invalid input without filtering the offending cues", () => {
    const report = evaluateSubtitleQuality({
      ...baseInput,
      videoDurationMs: 200,
      limits: { maximumCps: 10_000, maximumLineLength: 100 },
      cues: [
        { id: "empty", startMs: -10, endMs: 0, text: "", speakerId: "speaker-1" },
        {
          id: "unsafe",
          startMs: -5,
          endMs: 250,
          text: "bir\niki\nüç",
          speakerId: "speaker-2",
          bounds: { x: 0, y: 0, width: 1_080, height: 1_920 },
        },
      ],
    });

    expect(report.segments).toHaveLength(2);
    expect(report.metrics).toMatchObject({
      invalidTimestampCount: 2,
      emptyCueCount: 1,
      overlapCount: 1,
      totalOverlapMs: 5,
      minimumGapMs: -5,
      maximumLineCount: 3,
      speakerChangeCount: 1,
      videoOverflowCount: 1,
      safeAreaViolationCount: 1,
    });
    expect(report.checks.timestamps.status).toBe("failed");
    expect(report.checks.overlap.status).toBe("failed");
    expect(report.checks.safeArea.status).toBe("failed");
    expect(report.checks.videoDuration.status).toBe("failed");
    expect(report.issues.map((entry) => entry.code)).toEqual(expect.arrayContaining([
      "invalid_timestamp",
      "empty_cue",
      "overlap",
      "line_count",
      "video_overflow",
      "safe_area",
    ]));
    expect(report.criticalErrorCount).toBeGreaterThanOrEqual(7);
  });

  it("uses NFC-normalized Unicode code points for character and CPS metrics", () => {
    const report = evaluateSubtitleQuality({
      runId: "unicode-run",
      videoId: "unicode-video",
      videoDurationMs: 2_000,
      cues: [{ id: "unicode", startMs: 0, endMs: 1_000, text: "C\u0327" }],
    });

    expect(report.segments[0]).toMatchObject({
      characters: 1,
      charactersPerSecond: 1,
      maximumLineLength: 1,
    });
  });

  it("distinguishes missing ASS and safe-area evidence from passing checks", () => {
    const report = evaluateSubtitleQuality({
      runId: "partial-run",
      videoId: "partial-video",
      videoDurationMs: 2_000,
      cues: [{ id: "cue", startMs: 0, endMs: 1_000, text: "Merhaba" }],
    });

    expect(report.checks.ass).toMatchObject({ status: "not_run", issueCount: 0 });
    expect(report.checks.safeArea).toMatchObject({ status: "not_run", issueCount: 0 });
    expect(report.metrics.safeAreaViolationCount).toBeNull();
  });
});

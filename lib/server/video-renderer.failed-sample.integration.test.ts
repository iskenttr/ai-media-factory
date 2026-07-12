import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const sourcePath = process.env.AMF_FAILED_VERTICAL_VIDEO_PATH;
const reportPath = process.env.AMF_FAILED_VERTICAL_QUALITY_REPORT_PATH;
const configured = Boolean(sourcePath && reportPath);

describe.skipIf(!configured)("failed vertical sample regression", () => {
  it("matches the accepted fixture and passes every deterministic transition invariant", () => {
    const probe = JSON.parse(execFileSync(process.env.FFPROBE_PATH ?? "ffprobe", [
      "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:format=duration", "-of", "json", sourcePath!,
    ], { encoding: "utf8" })) as { streams: Array<{ width: number; height: number }>; format: { duration: string } };
    expect(probe.streams[0]).toMatchObject({ width: 1080, height: 1920 });
    expect(Number(probe.format.duration)).toBeCloseTo(82.507, 3);

    const report = JSON.parse(readFileSync(reportPath!, "utf8")) as {
      attempts: number;
      issues: unknown[];
      inputDurationMs: number;
      outputDurationMs: number;
      cues: Array<{ startMs: number; endMs: number; lineCount: number; fontSize: number }>;
    };
    expect(report.attempts).toBeLessThanOrEqual(5);
    expect(report.issues).toEqual([]);
    expect(Math.abs(report.inputDurationMs - report.outputDurationMs)).toBeLessThanOrEqual(120);
    expect(report.cues.every((cue) => cue.lineCount <= 2 && cue.fontSize >= 38)).toBe(true);
    for (let index = 1; index < report.cues.length; index += 1) {
      expect(report.cues[index - 1].endMs).toBeLessThan(report.cues[index].startMs);
    }
  });
});

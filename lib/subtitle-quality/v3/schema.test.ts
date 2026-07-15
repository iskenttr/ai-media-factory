import { describe, expect, it } from "vitest";

import { evaluateSubtitleQuality } from "./evaluator";
import { qualityReportV3Schema } from "./schema";

function validReport() {
  return evaluateSubtitleQuality({
    runId: "schema-run",
    videoId: "schema-video",
    videoDurationMs: 2_000,
    videoWidth: 1_920,
    videoHeight: 1_080,
    cues: [{ id: "cue", startMs: 0, endMs: 1_000, text: "Türkçe altyazı" }],
  });
}

describe("subtitle quality V3 report schema", () => {
  it("round-trips an evaluator report through JSON", () => {
    const serialized = JSON.parse(JSON.stringify(validReport())) as unknown;
    const parsed = qualityReportV3Schema.parse(serialized);

    expect(parsed.schemaVersion).toBe("subtitle-quality-v3");
    expect(parsed.runId).toBe("schema-run");
    expect(parsed.metrics.cueCount).toBe(1);
  });

  it("rejects an unknown version and out-of-range score", () => {
    const invalid = {
      ...validReport(),
      schemaVersion: "subtitle-quality-v2",
      overallScore: 101,
    };

    const result = qualityReportV3Schema.safeParse(invalid);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((entry) => entry.path.join(".")))
        .toEqual(expect.arrayContaining(["schemaVersion", "overallScore"]));
    }
  });

  it("rejects malformed check and issue values", () => {
    const invalid = {
      ...validReport(),
      checks: { render: { status: "unknown", issueCount: -1 } },
      issues: [{ code: "", severity: "severe", message: "" }],
    };

    expect(qualityReportV3Schema.safeParse(invalid).success).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { acceptanceEvidencePassed } from "./acceptance";

describe("acceptance evidence", () => {
  it("accepts a non-render task without media artifacts", () => {
    expect(acceptanceEvidencePassed({
      renderPassed: true,
      renderSkippedByContract: true,
      criticalErrorCount: 0,
      maximumCriticalErrors: 0,
      renderArtifactsComplete: false,
    })).toBe(true);
  });

  it("requires media artifacts when rendering is required", () => {
    expect(acceptanceEvidencePassed({
      renderPassed: true,
      renderSkippedByContract: false,
      criticalErrorCount: 0,
      maximumCriticalErrors: 0,
      renderArtifactsComplete: false,
    })).toBe(false);
  });

  it("never bypasses render or critical-error failures", () => {
    expect(acceptanceEvidencePassed({
      renderPassed: false,
      renderSkippedByContract: true,
      criticalErrorCount: 1,
      maximumCriticalErrors: 0,
      renderArtifactsComplete: true,
    })).toBe(false);
  });
});

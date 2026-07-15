import { describe, expect, it } from "vitest";

import { buildAnalysisSnapshot } from "./build-analysis-snapshot";
import type { AnyAnalysisEvent } from "@/lib/analysis/contracts";

function makeEvent(type: AnyAnalysisEvent["type"], jobId = "job-1", attempt = 1): AnyAnalysisEvent {
  return {
    schemaVersion: 1,
    eventId: `event-${type}`,
    jobId,
    uploadId: "upload-1",
    attempt,
    sequence: 1,
    type,
    occurredAt: "2024-01-01T00:00:00.000Z",
    payload: { availability: "available" as const },
  } as AnyAnalysisEvent;
}

describe("buildAnalysisSnapshot", () => {
  it("builds a complete snapshot from all required events", () => {
    const events = [
      makeEvent("upload_received"),
      makeEvent("media_metadata_ready"),
      makeEvent("audio_extracted"),
      makeEvent("language_detected"),
      makeEvent("speaker_analysis_completed"),
      makeEvent("pacing_analysis_completed"),
      makeEvent("speech_quality_assessed"),
      makeEvent("content_profile_completed"),
    ];
    const snapshot = buildAnalysisSnapshot(events);
    expect(snapshot.jobId).toBe("job-1");
    expect(snapshot.attempt).toBe(1);
    expect(snapshot.language).toEqual({ availability: "available" });
    expect(snapshot.speakers).toEqual({ availability: "available" });
    expect(snapshot.pacing).toEqual({ availability: "available" });
    expect(snapshot.speechQuality).toEqual({ availability: "available" });
    expect(snapshot.contentProfile).toEqual({ availability: "available" });
    expect(snapshot.sourceEvents).toHaveLength(8);
  });

  it("uses jobId and attempt from the first event", () => {
    const events: AnyAnalysisEvent[] = [
      { ...makeEvent("language_detected"), jobId: "custom-job", attempt: 5 } as AnyAnalysisEvent,
      { ...makeEvent("speaker_analysis_completed"), jobId: "other-job", attempt: 2 } as AnyAnalysisEvent,
      makeEvent("pacing_analysis_completed"),
      makeEvent("speech_quality_assessed"),
      makeEvent("content_profile_completed"),
    ];
    const snapshot = buildAnalysisSnapshot(events);
    expect(snapshot.jobId).toBe("custom-job");
    expect(snapshot.attempt).toBe(5);
  });

  it("freezes the snapshot to prevent mutation", () => {
    const events = [
      makeEvent("language_detected"),
      makeEvent("speaker_analysis_completed"),
      makeEvent("pacing_analysis_completed"),
      makeEvent("speech_quality_assessed"),
      makeEvent("content_profile_completed"),
    ];
    const snapshot = buildAnalysisSnapshot(events);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.sourceEvents)).toBe(true);
  });

  it("throws when events array is empty", () => {
    expect(() => buildAnalysisSnapshot([])).toThrow("Cannot build a snapshot without events");
  });

  it("throws when language_detected event is missing", () => {
    const events = [
      makeEvent("upload_received"),
      makeEvent("speaker_analysis_completed"),
      makeEvent("pacing_analysis_completed"),
      makeEvent("speech_quality_assessed"),
      makeEvent("content_profile_completed"),
    ];
    expect(() => buildAnalysisSnapshot(events)).toThrow("Missing terminal observation: language_detected");
  });

  it("throws when speaker_analysis_completed event is missing", () => {
    const events = [
      makeEvent("upload_received"),
      makeEvent("language_detected"),
      makeEvent("pacing_analysis_completed"),
      makeEvent("speech_quality_assessed"),
      makeEvent("content_profile_completed"),
    ];
    expect(() => buildAnalysisSnapshot(events)).toThrow("Missing terminal observation: speaker_analysis_completed");
  });

  it("throws when pacing_analysis_completed event is missing", () => {
    const events = [
      makeEvent("upload_received"),
      makeEvent("language_detected"),
      makeEvent("speaker_analysis_completed"),
      makeEvent("speech_quality_assessed"),
      makeEvent("content_profile_completed"),
    ];
    expect(() => buildAnalysisSnapshot(events)).toThrow("Missing terminal observation: pacing_analysis_completed");
  });

  it("throws when speech_quality_assessed event is missing", () => {
    const events = [
      makeEvent("upload_received"),
      makeEvent("language_detected"),
      makeEvent("speaker_analysis_completed"),
      makeEvent("pacing_analysis_completed"),
      makeEvent("content_profile_completed"),
    ];
    expect(() => buildAnalysisSnapshot(events)).toThrow("Missing terminal observation: speech_quality_assessed");
  });

  it("throws when content_profile_completed event is missing", () => {
    const events = [
      makeEvent("upload_received"),
      makeEvent("language_detected"),
      makeEvent("speaker_analysis_completed"),
      makeEvent("pacing_analysis_completed"),
      makeEvent("speech_quality_assessed"),
    ];
    expect(() => buildAnalysisSnapshot(events)).toThrow("Missing terminal observation: content_profile_completed");
  });
});

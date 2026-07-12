import type { AnalysisSnapshot } from "@/lib/analysis/observations";
import type { AnyAnalysisEvent, AnalysisEventType } from "@/lib/analysis/contracts";

function required<T extends AnalysisEventType>(events: AnyAnalysisEvent[], type: T) {
  const event = events.find(
    (candidate): candidate is Extract<AnyAnalysisEvent, { type: T }> => candidate.type === type,
  );
  if (!event) throw new Error(`Missing terminal observation: ${type}`);
  return event;
}

export function buildAnalysisSnapshot(events: AnyAnalysisEvent[]): AnalysisSnapshot {
  if (events.length === 0) throw new Error("Cannot build a snapshot without events");
  const first = events[0];
  return Object.freeze({
    jobId: first.jobId,
    attempt: first.attempt,
    language: required(events, "language_detected").payload,
    speakers: required(events, "speaker_analysis_completed").payload,
    pacing: required(events, "pacing_analysis_completed").payload,
    speechQuality: required(events, "speech_quality_assessed").payload,
    contentProfile: required(events, "content_profile_completed").payload,
    sourceEvents: Object.freeze([...events]) as unknown as AnyAnalysisEvent[],
  });
}

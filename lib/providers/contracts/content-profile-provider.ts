import type { EventPayload } from "@/lib/analysis/contracts";
import type { SpeechObservation } from "@/lib/analysis/observations";

export interface ContentProfileInput {
  durationMs: number;
  speech: SpeechObservation;
  speakers: EventPayload<"speaker_analysis_completed">;
  pacing: EventPayload<"pacing_analysis_completed">;
  speechQuality: EventPayload<"speech_quality_assessed">;
}

export interface ContentProfileProvider {
  readonly id: string;
  readonly version: string;
  analyze(input: ContentProfileInput): Promise<EventPayload<"content_profile_completed">>;
}

import type { AnyAnalysisEvent, EventPayload } from "./contracts";

export interface SpeechSegment {
  startSeconds: number;
  endSeconds: number;
  text: string;
}

export interface SpeechObservation {
  transcript: string;
  segments: SpeechSegment[];
  language: { code: string; name: string } | null;
  providerId: string;
  providerVersion: string;
}

export interface SpeakerSegment {
  speakerId: `speaker_${number}`;
  start: number;
  end: number;
}

export type SpeakerObservation =
  | {
      availability: "available";
      speakerCount: number;
      segments: SpeakerSegment[];
      providerVersion: string;
      limitations: string[];
    }
  | {
      availability: "unavailable";
      reason: "model_not_configured" | "provider_unavailable" | "insufficient_speech";
      speakerCount: null;
      segments: [];
      providerVersion: string;
      limitations: string[];
    };

export interface AnalysisSnapshot {
  jobId: string;
  attempt: number;
  language: EventPayload<"language_detected">;
  speakers: EventPayload<"speaker_analysis_completed">;
  pacing: EventPayload<"pacing_analysis_completed">;
  speechQuality: EventPayload<"speech_quality_assessed">;
  contentProfile: EventPayload<"content_profile_completed">;
  sourceEvents: AnyAnalysisEvent[];
}

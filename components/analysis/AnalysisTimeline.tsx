import type { AnyAnalysisEvent } from "@/lib/analysis/contracts";

import { AnalysisStep } from "./AnalysisStep";
import styles from "./Analysis.module.css";

function eventMessage(event: AnyAnalysisEvent) {
  switch (event.type) {
    case "upload_received":
      return { state: "understood" as const, message: "Your video is here." };
    case "media_metadata_ready":
      return { state: "understood" as const, message: "I can read the video." };
    case "audio_extracted":
      return { state: "understood" as const, message: "I can hear the audio clearly enough to begin." };
    case "language_detected":
      return event.payload.availability === "available"
        ? { state: "understood" as const, message: `I hear ${event.payload.language.name}.` }
        : { state: "unavailable" as const, message: "I couldn’t identify the spoken language." };
    case "speaker_analysis_completed":
      return event.payload.availability === "available"
        ? {
            state: "understood" as const,
            message: `I found ${event.payload.speakerCount === 1 ? "one speaker" : `${event.payload.speakerCount} speakers`}.`,
          }
        : { state: "unavailable" as const, message: "I couldn’t reliably identify the speakers." };
    case "pacing_analysis_completed":
      if (event.payload.availability === "unavailable") {
        return { state: "unavailable" as const, message: "I couldn’t assess the pacing." };
      }
      return {
        state: "understood" as const,
        message:
          event.payload.assessment === "clear"
            ? "The pacing is clear."
            : event.payload.assessment === "dense"
              ? "The pacing is fast and information-rich."
              : "The pacing changes across the video.",
      };
    case "speech_quality_assessed":
      if (event.payload.availability === "unavailable") {
        return { state: "unavailable" as const, message: "I couldn’t assess the speech quality." };
      }
      return {
        state: "understood" as const,
        message:
          event.payload.assessment === "strong"
            ? "Speech quality looks strong."
            : event.payload.assessment === "usable"
              ? "Speech quality is usable."
              : "Some speech may need extra care.",
      };
    case "content_profile_completed":
      return event.payload.availability === "available"
        ? { state: "understood" as const, message: "I understand how this video is structured." }
        : {
            state: "unavailable" as const,
            message: "I couldn’t fully understand the video’s structure.",
          };
    default:
      return null;
  }
}

export function AnalysisTimeline({ events }: { events: AnyAnalysisEvent[] }) {
  const steps = events.map(eventMessage).filter((step) => step !== null);
  return (
    <ol className={styles.timeline} aria-live="polite">
      {steps.map((step, index) => (
        <AnalysisStep key={`${index}-${step.message}`} {...step} />
      ))}
    </ol>
  );
}

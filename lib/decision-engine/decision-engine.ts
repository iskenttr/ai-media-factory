import type { LocalizationPlan } from "@/lib/analysis/localization-plan";
import type { AnalysisSnapshot } from "@/lib/analysis/observations";

export const DECISION_ENGINE_VERSION = "localization-plan-v2";

export function createLocalizationPlan(snapshot: AnalysisSnapshot): LocalizationPlan {
  const requiredCapabilities: string[] = [];
  const unavailableCapabilities: string[] = [];
  const limitations: string[] = [];
  const decisionReasons: string[] = [];
  let requiresReview = false;

  if (snapshot.language.availability === "unavailable") {
    requiredCapabilities.push("source_language");
    unavailableCapabilities.push("source_language");
    decisionReasons.push("A reliable source language is required before localization can begin.");
  }
  if (snapshot.pacing.availability === "unavailable") {
    requiredCapabilities.push("timestamped_transcript");
    unavailableCapabilities.push("pacing_analysis");
    decisionReasons.push("Timestamped speech evidence is required before localization can begin.");
  }
  if (snapshot.speechQuality.availability === "unavailable") {
    requiredCapabilities.push("usable_speech");
    unavailableCapabilities.push("speech_quality");
    decisionReasons.push("Usable speech evidence is required before localization can begin.");
  } else if (snapshot.speechQuality.assessment === "limited") {
    requiresReview = true;
    limitations.push("Source speech quality requires review before production output.");
  }
  if (snapshot.speakers.availability === "unavailable") {
    requiresReview = true;
    unavailableCapabilities.push("speaker_analysis");
    limitations.push(...snapshot.speakers.limitations);
  } else {
    limitations.push(...snapshot.speakers.limitations);
  }
  if (snapshot.contentProfile.availability === "unavailable") {
    requiresReview = true;
    unavailableCapabilities.push("content_profile");
    limitations.push(...snapshot.contentProfile.limitations);
  } else {
    limitations.push(...snapshot.contentProfile.limitations);
    if (Object.values(snapshot.contentProfile.profile).includes("unknown")) {
      limitations.push("Some content characteristics remain unknown without visual evidence.");
    }
  }

  // Speaker and content observations improve the plan but are not prerequisites for a safe start.
  const providerFailedTerminally = [snapshot.language, snapshot.pacing, snapshot.speechQuality]
    .some((result) => result.availability === "unavailable" && result.reason === "provider_unavailable");
  if (providerFailedTerminally) {
    decisionReasons.push("A required analysis provider failed terminally.");
  }

  const blocked = requiredCapabilities.length > 0 || providerFailedTerminally;
  const status = blocked
    ? "blocked" as const
    : unavailableCapabilities.length > 0 || requiresReview
      ? "limited" as const
      : "ready" as const;
  const safeToContinue = status !== "blocked";
  if (status === "ready") decisionReasons.push("All required localization evidence is available.");
  if (status === "limited") decisionReasons.push("Localization can begin with the recorded limitations.");

  return {
    status,
    safeToContinue,
    sourceLanguage: snapshot.language.availability === "available" ? snapshot.language.language : null,
    speakerStrategy: snapshot.speakers.availability === "available"
      ? "preserve_detected_speakers"
      : "requires_speaker_analysis",
    timingStrategy: snapshot.pacing.availability === "unavailable"
      ? "requires_pacing_analysis"
      : snapshot.pacing.assessment === "dense"
        ? "adapt_dense_pacing"
        : snapshot.pacing.assessment === "variable"
          ? "review_variable_pacing"
          : "preserve_clear_pacing",
    speechQualityStrategy: snapshot.speechQuality.availability === "unavailable"
      ? "requires_audio_review"
      : snapshot.speechQuality.assessment === "strong"
        ? "use_source_audio"
        : snapshot.speechQuality.assessment === "usable"
          ? "enhance_source_audio"
          : "requires_audio_review",
    contentAdaptationStrategy: snapshot.contentProfile.availability === "available"
      ? "preserve_detected_structure"
      : "requires_content_profile",
    constraints: limitations,
    limitations: [...new Set(limitations)],
    unavailableCapabilities: [...new Set(unavailableCapabilities)],
    requiredCapabilities: [...new Set(requiredCapabilities)],
    decisionReasons,
    engineVersion: DECISION_ENGINE_VERSION,
    sourceEventIds: snapshot.sourceEvents.map((event) => event.eventId),
  };
}
